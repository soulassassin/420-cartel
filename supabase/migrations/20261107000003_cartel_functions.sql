-- =====================================================================
-- 420 CARTEL :: TRANSACTIONAL BUSINESS LOGIC
-- Atomic order processing across GRAMS / MILLILITERS / UNITS
-- =====================================================================

alter table public.orders
  add column if not exists idempotency_key text;

create unique index if not exists orders_idempotency_key_unique
  on public.orders (idempotency_key)
  where idempotency_key is not null;

-- ---------------------------------------------------------------------
-- 1. HELPERS
-- ---------------------------------------------------------------------
create or replace function public.next_order_number(p_channel order_channel)
returns text
language sql
volatile
as $fn$
  select case when p_channel = 'POS' then 'POS-' else 'ONL-' end
         || to_char(now() at time zone 'Africa/Johannesburg', 'YYMMDD')
         || '-'
         || lpad(nextval('public.order_number_seq')::text, 6, '0');
$fn$;

create or replace function public.active_loyalty_rules()
returns public.loyalty_rules
language sql
stable
as $fn$
  select * from public.loyalty_rules where is_active order by created_at limit 1;
$fn$;

create or replace function public.rank_for_lifetime_value(p_cents bigint)
returns member_rank
language plpgsql
stable
as $fn$
declare
  v_rules      public.loyalty_rules;
  v_thresholds jsonb;
  v_best       member_rank := 'INITIATE';
  v_key        text;
  v_value      bigint;
begin
  v_rules := public.active_loyalty_rules();
  v_thresholds := coalesce(
    v_rules.rank_thresholds,
    '{"INITIATE": 0, "SOLDIER": 250000, "CAPO": 1000000, "CONSIGLIERE": 5000000}'::jsonb
  );

  for v_key, v_value in
    select key, (value)::text::bigint from jsonb_each(v_thresholds)
    order by (value)::text::bigint asc
  loop
    if p_cents >= v_value then
      v_best := v_key::member_rank;
    end if;
  end loop;

  return v_best;
end;
$fn$;

-- ---------------------------------------------------------------------
-- 2. STOCK ADJUSTMENT (intake, waste, spillage, corrections)
-- ---------------------------------------------------------------------
create or replace function public.adjust_batch_stock(
  p_batch_id      uuid,
  p_movement_type stock_movement_type,
  p_base_qty      numeric,
  p_reason        text default null,
  p_metadata      jsonb default '{}'::jsonb
)
returns public.master_batches
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_batch   public.master_batches;
  v_delta   numeric;
  v_balance numeric;
begin
  if not public.is_staff() then
    raise exception 'CARTEL_FORBIDDEN: only active staff may adjust stock'
      using errcode = '42501';
  end if;

  if p_base_qty is null or p_base_qty <= 0 then
    raise exception 'CARTEL_INVALID_QTY: adjustment quantity must be greater than zero'
      using errcode = '22023';
  end if;

  select * into v_batch
  from public.master_batches
  where id = p_batch_id
  for update;

  if not found then
    raise exception 'CARTEL_BATCH_NOT_FOUND: %', p_batch_id using errcode = 'P0002';
  end if;

  -- Only INTAKE, RETURN and TRANSFER_IN add stock; everything else removes it.
  v_delta := case
    when p_movement_type in ('INTAKE', 'RETURN', 'TRANSFER_IN') then p_base_qty
    when p_movement_type = 'ADJUSTMENT' then p_base_qty  -- signed by caller via p_base_qty
    else -p_base_qty
  end;

  v_balance := v_batch.remaining_base_qty + v_delta;

  if v_balance < 0 then
    raise exception 'CARTEL_INSUFFICIENT_STOCK: batch % holds %, cannot remove %',
      v_batch.batch_code, v_batch.remaining_base_qty, p_base_qty
      using errcode = '23514';
  end if;

  if v_balance < v_batch.reserved_base_qty then
    raise exception 'CARTEL_RESERVED_CONFLICT: batch % has % reserved, balance would drop to %',
      v_batch.batch_code, v_batch.reserved_base_qty, v_balance
      using errcode = '23514';
  end if;

  update public.master_batches
  set remaining_base_qty = v_balance,
      received_base_qty  = case
                             when p_movement_type in ('INTAKE', 'TRANSFER_IN')
                               then received_base_qty + p_base_qty
                             else greatest(received_base_qty, v_balance)
                           end
  where id = p_batch_id
  returning * into v_batch;

  insert into public.stock_movements (
    master_batch_id, product_id, branch_id, movement_type, base_uom,
    base_qty_delta, balance_after, unit_cost_cents, performed_by, reason, metadata
  )
  select
    v_batch.id, v_batch.product_id, v_batch.branch_id, p_movement_type, p.base_uom,
    v_delta, v_balance, v_batch.cost_per_base_unit_cents, auth.uid(), p_reason, coalesce(p_metadata, '{}'::jsonb)
  from public.products p
  where p.id = v_batch.product_id;

  return v_batch;
end;
$fn$;

-- ---------------------------------------------------------------------
-- 3. SOFT RESERVATIONS (online cart / in-flight POS ticket)
-- ---------------------------------------------------------------------
create or replace function public.reserve_product_stock(
  p_product_id uuid,
  p_branch_id  uuid,
  p_base_qty   numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_remaining numeric := p_base_qty;
  v_take      numeric;
  v_batch     record;
  v_alloc     jsonb := '[]'::jsonb;
begin
  if p_base_qty is null or p_base_qty <= 0 then
    raise exception 'CARTEL_INVALID_QTY: reservation quantity must be greater than zero'
      using errcode = '22023';
  end if;

  for v_batch in
    select id, batch_code, remaining_base_qty, reserved_base_qty
    from public.master_batches
    where product_id = p_product_id
      and branch_id = p_branch_id
      and is_active
      and remaining_base_qty > reserved_base_qty
    order by received_at asc, created_at asc
    for update
  loop
    exit when v_remaining <= 0;

    v_take := least(v_remaining, v_batch.remaining_base_qty - v_batch.reserved_base_qty);
    if v_take <= 0 then
      continue;
    end if;

    update public.master_batches
    set reserved_base_qty = reserved_base_qty + v_take
    where id = v_batch.id;

    v_alloc := v_alloc || jsonb_build_object(
      'batch_id', v_batch.id,
      'batch_code', v_batch.batch_code,
      'base_qty', v_take
    );
    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    raise exception 'CARTEL_INSUFFICIENT_STOCK: short by % base units for product %',
      v_remaining, p_product_id
      using errcode = '23514';
  end if;

  return jsonb_build_object('reserved', p_base_qty, 'allocation', v_alloc);
end;
$fn$;

create or replace function public.release_product_reservation(p_allocation jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row jsonb;
begin
  for v_row in select jsonb_array_elements(coalesce(p_allocation, '[]'::jsonb))
  loop
    update public.master_batches
    set reserved_base_qty = greatest(
          0,
          reserved_base_qty - (v_row ->> 'base_qty')::numeric
        )
    where id = (v_row ->> 'batch_id')::uuid;
  end loop;
end;
$fn$;

-- ---------------------------------------------------------------------
-- 4. process_cartel_order
--    One transaction: validate -> FIFO deduct g/ml/ea -> price ->
--    tender -> loyalty -> CRM rollup -> affiliate attribution.
-- ---------------------------------------------------------------------
create or replace function public.process_cartel_order(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_channel          order_channel;
  v_fulfilment       fulfilment_type;
  v_branch_id        uuid;
  v_member_id        uuid;
  v_staff_id         uuid;
  v_idempotency      text;
  v_existing         public.orders;
  v_order            public.orders;
  v_member           public.members;
  v_rules            public.loyalty_rules;

  v_item             jsonb;
  v_variant          public.product_variants;
  v_product          public.products;
  v_line_base_qty    numeric;
  v_line_qty         int;
  v_override         numeric;
  v_unit_price       bigint;
  v_line_total       bigint;
  v_line_cost        bigint;
  v_alloc            jsonb;
  v_alloc_row        jsonb;
  v_remaining        numeric;
  v_take             numeric;
  v_batch            record;

  v_subtotal         bigint := 0;
  v_cost_total       bigint := 0;
  v_discount         bigint := 0;
  v_delivery_fee     bigint := 0;
  v_total            bigint := 0;
  v_points_redeemed  bigint := 0;
  v_points_earned    bigint := 0;
  v_redeem_value     bigint := 0;

  v_zone             record;
  v_delivery         jsonb;
  v_lat              double precision;
  v_lng              double precision;

  v_payment          jsonb;
  v_captured         bigint := 0;
  v_pending          bigint := 0;
  v_method           payment_method;
  v_amount           bigint;
  v_credit_balance   bigint;

  v_referral         text;
  v_affiliate        public.affiliate_codes;
  v_final_status     order_status;
  v_item_count       int := 0;
begin
  -- ---- 4.1 Parse & authorise -------------------------------------------------
  v_channel     := (p_payload ->> 'channel')::order_channel;
  v_fulfilment  := (p_payload ->> 'fulfilment_type')::fulfilment_type;
  v_branch_id   := (p_payload ->> 'branch_id')::uuid;
  v_member_id   := nullif(p_payload ->> 'member_id', '')::uuid;
  v_staff_id    := nullif(p_payload ->> 'staff_id', '')::uuid;
  v_idempotency := nullif(p_payload ->> 'idempotency_key', '');
  v_referral    := nullif(upper(trim(coalesce(p_payload ->> 'referral_code', ''))), '');
  v_delivery    := p_payload -> 'delivery';

  if v_channel is null or v_fulfilment is null or v_branch_id is null then
    raise exception 'CARTEL_INVALID_PAYLOAD: channel, fulfilment_type and branch_id are required'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_payload -> 'items') <> 'array'
     or jsonb_array_length(p_payload -> 'items') = 0 then
    raise exception 'CARTEL_EMPTY_CART: at least one item is required'
      using errcode = '22023';
  end if;

  if v_channel = 'POS' then
    if not public.is_staff() then
      raise exception 'CARTEL_FORBIDDEN: POS orders require active staff'
        using errcode = '42501';
    end if;
    v_staff_id := coalesce(v_staff_id, auth.uid());
  else
    -- Online: the caller must be the member on the order (or staff placing it for them).
    if not public.is_staff() then
      if v_member_id is null or v_member_id <> auth.uid() then
        raise exception 'CARTEL_FORBIDDEN: online orders must be placed by the member'
          using errcode = '42501';
      end if;
      if not public.is_active_member(v_member_id) then
        raise exception 'CARTEL_NOT_A_MEMBER: active 18+ verified membership required to order'
          using errcode = '42501';
      end if;
    end if;
  end if;

  -- ---- 4.2 Idempotency ------------------------------------------------------
  if v_idempotency is not null then
    select * into v_existing from public.orders where idempotency_key = v_idempotency;
    if found then
      return jsonb_build_object(
        'order_id', v_existing.id,
        'order_number', v_existing.order_number,
        'status', v_existing.status,
        'total_cents', v_existing.total_cents,
        'replayed', true
      );
    end if;
  end if;

  -- ---- 4.3 Member gate ------------------------------------------------------
  if v_member_id is not null then
    select * into v_member from public.members where id = v_member_id for update;
    if not found then
      raise exception 'CARTEL_MEMBER_NOT_FOUND: %', v_member_id using errcode = 'P0002';
    end if;
    if v_member.status = 'SUSPENDED' then
      raise exception 'CARTEL_MEMBER_SUSPENDED: % is suspended (%)',
        v_member.member_code, coalesce(v_member.suspended_reason, 'no reason recorded')
        using errcode = '42501';
    end if;
    if v_member.age_verified_at is null then
      raise exception 'CARTEL_AGE_NOT_VERIFIED: % has not completed 18+ verification',
        v_member.member_code
        using errcode = '42501';
    end if;
  end if;

  v_rules := public.active_loyalty_rules();

  -- ---- 4.4 Create the order shell ------------------------------------------
  insert into public.orders (
    order_number, channel, status, fulfilment_type, branch_id, member_id, staff_id,
    delivery_address, delivery_suburb, delivery_lat, delivery_lng, delivery_instructions,
    pickup_slot_start, pickup_slot_end, referral_code, notes, idempotency_key,
    subtotal_cents, discount_cents, delivery_fee_cents, total_cents
  )
  values (
    public.next_order_number(v_channel), v_channel, 'DRAFT', v_fulfilment, v_branch_id,
    v_member_id, v_staff_id,
    nullif(v_delivery ->> 'address', ''),
    nullif(v_delivery ->> 'suburb', ''),
    nullif(v_delivery ->> 'lat', '')::double precision,
    nullif(v_delivery ->> 'lng', '')::double precision,
    nullif(v_delivery ->> 'instructions', ''),
    nullif(p_payload ->> 'pickup_slot_start', '')::timestamptz,
    nullif(p_payload ->> 'pickup_slot_end', '')::timestamptz,
    v_referral,
    nullif(p_payload ->> 'notes', ''),
    v_idempotency,
    0, 0, 0, 0
  )
  returning * into v_order;

  -- ---- 4.5 Lines: FIFO deduction across g / ml / ea -------------------------
  for v_item in select jsonb_array_elements(p_payload -> 'items')
  loop
    v_item_count := v_item_count + 1;

    select * into v_variant
    from public.product_variants
    where id = (v_item ->> 'variant_id')::uuid and is_active;

    if not found then
      raise exception 'CARTEL_VARIANT_NOT_FOUND: %', v_item ->> 'variant_id'
        using errcode = 'P0002';
    end if;

    select * into v_product
    from public.products
    where id = v_variant.product_id and is_active;

    if not found then
      raise exception 'CARTEL_PRODUCT_INACTIVE: %', v_variant.product_id
        using errcode = 'P0002';
    end if;

    if v_product.is_member_only and v_member_id is null then
      raise exception 'CARTEL_MEMBER_ONLY: % may only be sold to a linked member', v_product.name
        using errcode = '42501';
    end if;

    v_line_qty := coalesce(nullif(v_item ->> 'quantity', '')::int, 1);
    if v_line_qty <= 0 then
      raise exception 'CARTEL_INVALID_QTY: quantity must be greater than zero for %', v_product.name
        using errcode = '22023';
    end if;

    v_override := nullif(v_item ->> 'base_qty_override', '')::numeric;

    if v_variant.is_custom_amount then
      if v_override is null then
        raise exception 'CARTEL_CUSTOM_AMOUNT_REQUIRED: % needs an explicit amount in %',
          v_variant.label, v_product.base_uom
          using errcode = '22023';
      end if;
      if v_override < v_variant.base_quantity then
        raise exception 'CARTEL_BELOW_MIN_AMOUNT: % has a minimum of % %',
          v_variant.label, v_variant.base_quantity, v_product.base_uom
          using errcode = '22023';
      end if;
      -- Custom tiers price per base unit; price_cents is the per-unit rate.
      v_line_base_qty := v_override * v_line_qty;
      v_unit_price    := round(v_variant.price_cents * v_override)::bigint;
    else
      if v_product.base_uom = 'UNITS' and v_variant.base_quantity <> trunc(v_variant.base_quantity) then
        raise exception 'CARTEL_FRACTIONAL_UNITS: % is sold in whole units', v_product.name
          using errcode = '22023';
      end if;
      v_line_base_qty := v_variant.base_quantity * v_line_qty;
      v_unit_price    := v_variant.price_cents;
    end if;

    v_line_total := v_unit_price * v_line_qty;

    -- FIFO allocate. `for update` (not skip locked) so concurrent tills queue
    -- instead of silently overselling the same batch.
    v_remaining := v_line_base_qty;
    v_alloc     := '[]'::jsonb;
    v_line_cost := 0;

    for v_batch in
      select id, batch_code, remaining_base_qty, reserved_base_qty, cost_per_base_unit_cents
      from public.master_batches
      where product_id = v_product.id
        and branch_id = v_branch_id
        and is_active
        and remaining_base_qty > 0
      order by received_at asc, created_at asc
      for update
    loop
      exit when v_remaining <= 0;

      -- POS sales may draw on stock reserved for this very ticket, so the
      -- caller can pass release_reserved to bypass the reservation buffer.
      v_take := least(
        v_remaining,
        case
          when coalesce((p_payload ->> 'ignore_reservations')::boolean, false)
            then v_batch.remaining_base_qty
          else v_batch.remaining_base_qty - v_batch.reserved_base_qty
        end
      );

      if v_take <= 0 then
        continue;
      end if;

      update public.master_batches
      set remaining_base_qty = remaining_base_qty - v_take,
          reserved_base_qty  = greatest(0, reserved_base_qty - v_take)
      where id = v_batch.id;

      insert into public.stock_movements (
        master_batch_id, product_id, branch_id, movement_type, base_uom,
        base_qty_delta, balance_after, unit_cost_cents, order_id, performed_by, reason, metadata
      )
      values (
        v_batch.id, v_product.id, v_branch_id, 'SALE', v_product.base_uom,
        -v_take, v_batch.remaining_base_qty - v_take, v_batch.cost_per_base_unit_cents,
        v_order.id, auth.uid(),
        format('Sale %s / %s', v_order.order_number, v_variant.label),
        jsonb_build_object('variant_id', v_variant.id, 'variant_label', v_variant.label)
      );

      v_alloc := v_alloc || jsonb_build_object(
        'batch_id', v_batch.id,
        'batch_code', v_batch.batch_code,
        'base_qty', v_take,
        'unit_cost_cents', v_batch.cost_per_base_unit_cents
      );

      v_line_cost := v_line_cost + round(v_take * v_batch.cost_per_base_unit_cents)::bigint;
      v_remaining := v_remaining - v_take;
    end loop;

    if v_remaining > 0 then
      raise exception 'CARTEL_INSUFFICIENT_STOCK: % short by % % at this branch',
        v_product.name, v_remaining, lower(v_product.base_uom::text)
        using errcode = '23514';
    end if;

    insert into public.order_items (
      order_id, product_id, variant_id, product_name, variant_label, base_uom,
      base_qty, quantity, unit_price_cents, line_total_cents, cost_cents, batch_allocation
    )
    values (
      v_order.id, v_product.id, v_variant.id, v_product.name,
      case when v_variant.is_custom_amount
        then format('%s %s', v_override, lower(v_product.base_uom::text))
        else v_variant.label
      end,
      v_product.base_uom, v_line_base_qty, v_line_qty,
      v_unit_price, v_line_total, v_line_cost, v_alloc
    );

    v_subtotal   := v_subtotal + v_line_total;
    v_cost_total := v_cost_total + v_line_cost;
  end loop;

  -- ---- 4.6 Discounts & points redemption ------------------------------------
  v_discount        := greatest(0, coalesce((p_payload ->> 'discount_cents')::bigint, 0));
  v_points_redeemed := greatest(0, coalesce((p_payload ->> 'points_redeemed')::bigint, 0));

  if v_points_redeemed > 0 then
    if v_member_id is null then
      raise exception 'CARTEL_NO_MEMBER: points can only be redeemed against a member profile'
        using errcode = '22023';
    end if;
    if v_points_redeemed > v_member.points_balance then
      raise exception 'CARTEL_INSUFFICIENT_POINTS: % has % points, tried to redeem %',
        v_member.member_code, v_member.points_balance, v_points_redeemed
        using errcode = '23514';
    end if;
    if v_rules.id is not null and v_points_redeemed < v_rules.min_redeem_points then
      raise exception 'CARTEL_BELOW_MIN_REDEEM: minimum redemption is % points',
        v_rules.min_redeem_points
        using errcode = '22023';
    end if;
    v_redeem_value := round(v_points_redeemed * coalesce(v_rules.point_value_cents, 1))::bigint;
    v_discount     := v_discount + v_redeem_value;
  end if;

  v_discount := least(v_discount, v_subtotal);

  -- ---- 4.7 Delivery fee -----------------------------------------------------
  if v_fulfilment = 'DELIVERY' then
    v_lat := nullif(v_delivery ->> 'lat', '')::double precision;
    v_lng := nullif(v_delivery ->> 'lng', '')::double precision;

    if v_lat is null or v_lng is null then
      raise exception 'CARTEL_NO_DROP_POINT: delivery orders need a geocoded address'
        using errcode = '22023';
    end if;

    select * into v_zone from public.resolve_delivery_zone(v_branch_id, v_lat, v_lng);

    if v_zone.zone_id is null then
      raise exception 'CARTEL_OUT_OF_ZONE: % is outside every active delivery zone',
        coalesce(v_delivery ->> 'address', 'that address')
        using errcode = '22023';
    end if;

    if (v_subtotal - v_discount) < v_zone.min_order_cents then
      raise exception 'CARTEL_BELOW_MIN_ORDER: % requires a minimum of R%',
        v_zone.zone_name, round(v_zone.min_order_cents / 100.0, 2)
        using errcode = '22023';
    end if;

    v_delivery_fee := case
      when v_zone.free_over_cents is not null
           and (v_subtotal - v_discount) >= v_zone.free_over_cents then 0
      else v_zone.fee_cents
    end;

    update public.orders
    set delivery_zone_id     = v_zone.zone_id,
        delivery_distance_km = v_zone.distance_km
    where id = v_order.id;
  end if;

  v_total := v_subtotal - v_discount + v_delivery_fee;

  -- ---- 4.8 Tender -----------------------------------------------------------
  if jsonb_typeof(p_payload -> 'payments') = 'array' then
    for v_payment in select jsonb_array_elements(p_payload -> 'payments')
    loop
      v_method := (v_payment ->> 'method')::payment_method;
      v_amount := (v_payment ->> 'amount_cents')::bigint;

      if v_amount is null or v_amount <= 0 then
        raise exception 'CARTEL_INVALID_TENDER: payment amount must be greater than zero'
          using errcode = '22023';
      end if;

      if v_method = 'MEMBER_CREDIT' then
        if v_member_id is null then
          raise exception 'CARTEL_NO_MEMBER: member credit requires a linked member'
            using errcode = '22023';
        end if;

        select credit_balance_cents into v_credit_balance
        from public.members where id = v_member_id for update;

        if v_credit_balance < v_amount then
          raise exception 'CARTEL_INSUFFICIENT_CREDIT: balance is R%, tried to spend R%',
            round(v_credit_balance / 100.0, 2), round(v_amount / 100.0, 2)
            using errcode = '23514';
        end if;

        update public.members
        set credit_balance_cents = credit_balance_cents - v_amount
        where id = v_member_id;

        insert into public.member_credit_ledger (
          member_id, order_id, delta_cents, balance_after, reason, created_by
        )
        values (
          v_member_id, v_order.id, -v_amount, v_credit_balance - v_amount,
          format('Order %s', v_order.order_number), auth.uid()
        );
      end if;

      insert into public.payments (
        order_id, method, status, amount_cents, tendered_cents, change_cents,
        provider, provider_ref, provider_payload, captured_at, created_by
      )
      values (
        v_order.id,
        v_method,
        -- Cash, card terminal, instant EFT and credit settle at the till.
        -- Manual EFT, pay-on-collection and the future gateway settle later.
        case
          when v_method in ('CASH', 'CARD_TERMINAL', 'EFT_INSTANT', 'MEMBER_CREDIT')
            then 'CAPTURED'::payment_status
          else 'PENDING'::payment_status
        end,
        v_amount,
        nullif(v_payment ->> 'tendered_cents', '')::bigint,
        case
          when v_method = 'CASH' and (v_payment ->> 'tendered_cents') is not null
            then greatest(0, (v_payment ->> 'tendered_cents')::bigint - v_amount)
          else null
        end,
        coalesce(nullif(v_payment ->> 'provider', ''), 'INTERNAL'),
        nullif(v_payment ->> 'provider_ref', ''),
        coalesce(v_payment -> 'provider_payload', '{}'::jsonb),
        case
          when v_method in ('CASH', 'CARD_TERMINAL', 'EFT_INSTANT', 'MEMBER_CREDIT')
            then now()
          else null
        end,
        auth.uid()
      );

      if v_method in ('CASH', 'CARD_TERMINAL', 'EFT_INSTANT', 'MEMBER_CREDIT') then
        v_captured := v_captured + v_amount;
      else
        v_pending := v_pending + v_amount;
      end if;
    end loop;
  end if;

  if v_captured > v_total then
    raise exception 'CARTEL_OVERPAID: captured R% against a R% total',
      round(v_captured / 100.0, 2), round(v_total / 100.0, 2)
      using errcode = '22023';
  end if;

  v_final_status := case
    when v_captured >= v_total then 'PAID'::order_status
    else 'AWAITING_PAYMENT'::order_status
  end;

  -- ---- 4.9 Loyalty accrual --------------------------------------------------
  if v_member_id is not null and v_rules.id is not null then
    v_points_earned := floor(
      ((v_subtotal - v_discount) / 100.0) * coalesce(v_rules.points_per_100_cents, 1)
    )::bigint;
  end if;

  -- ---- 4.10 Finalise order --------------------------------------------------
  update public.orders
  set status             = v_final_status,
      subtotal_cents     = v_subtotal,
      discount_cents     = v_discount,
      delivery_fee_cents = v_delivery_fee,
      total_cents        = v_total,
      cost_cents         = v_cost_total,
      points_earned      = v_points_earned,
      points_redeemed    = v_points_redeemed,
      paid_at            = case when v_final_status = 'PAID' then now() else null end
  where id = v_order.id
  returning * into v_order;

  -- ---- 4.11 CRM rollup ------------------------------------------------------
  if v_member_id is not null then
    if v_points_redeemed > 0 then
      update public.members
      set points_balance = points_balance - v_points_redeemed
      where id = v_member_id
      returning points_balance into v_credit_balance;

      insert into public.loyalty_ledger (member_id, order_id, points_delta, balance_after, reason, created_by)
      values (v_member_id, v_order.id, -v_points_redeemed, v_credit_balance,
              format('Redeemed on %s', v_order.order_number), auth.uid());
    end if;

    if v_points_earned > 0 then
      update public.members
      set points_balance = points_balance + v_points_earned
      where id = v_member_id
      returning points_balance into v_credit_balance;

      insert into public.loyalty_ledger (member_id, order_id, points_delta, balance_after, reason, created_by)
      values (v_member_id, v_order.id, v_points_earned, v_credit_balance,
              format('Earned on %s', v_order.order_number), auth.uid());
    end if;

    update public.members
    set lifetime_value_cents = lifetime_value_cents + v_total,
        order_count          = order_count + 1,
        last_seen_at         = now(),
        rank                 = public.rank_for_lifetime_value(lifetime_value_cents + v_total)
    where id = v_member_id;
  end if;

  -- ---- 4.12 Affiliate attribution ------------------------------------------
  if v_referral is not null then
    select * into v_affiliate
    from public.affiliate_codes
    where code = v_referral and is_active;

    if found then
      insert into public.affiliate_attributions (
        affiliate_code_id, member_id, order_id, commission_cents
      )
      values (
        v_affiliate.id, v_member_id, v_order.id,
        round((v_subtotal - v_discount) * v_affiliate.commission_bps / 10000.0)::bigint
      )
      on conflict (affiliate_code_id, order_id) do nothing;

      update public.affiliate_codes
      set order_count = order_count + 1
      where id = v_affiliate.id;
    end if;
  end if;

  -- ---- 4.13 Receipt payload -------------------------------------------------
  return jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'status', v_order.status,
    'channel', v_order.channel,
    'fulfilment_type', v_order.fulfilment_type,
    'item_count', v_item_count,
    'subtotal_cents', v_order.subtotal_cents,
    'discount_cents', v_order.discount_cents,
    'delivery_fee_cents', v_order.delivery_fee_cents,
    'total_cents', v_order.total_cents,
    'captured_cents', v_captured,
    'outstanding_cents', v_total - v_captured,
    'pending_cents', v_pending,
    'points_earned', v_order.points_earned,
    'points_redeemed', v_order.points_redeemed,
    'replayed', false,
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'product_name', oi.product_name,
        'variant_label', oi.variant_label,
        'base_uom', oi.base_uom,
        'base_qty', oi.base_qty,
        'quantity', oi.quantity,
        'unit_price_cents', oi.unit_price_cents,
        'line_total_cents', oi.line_total_cents,
        'batch_allocation', oi.batch_allocation
      ) order by oi.created_at), '[]'::jsonb)
      from public.order_items oi where oi.order_id = v_order.id
    )
  );
end;
$fn$;

comment on function public.process_cartel_order is
  'Atomic order pipeline: authorises caller, enforces the member gate, FIFO-deducts GRAMS/MILLILITERS/UNITS from master_batches under row locks, writes stock movements, resolves delivery fees, records tender, accrues loyalty and attributes referrals. Any failure rolls the whole order back.';

-- ---------------------------------------------------------------------
-- 5. ORDER CANCELLATION / RESTOCK
-- ---------------------------------------------------------------------
create or replace function public.cancel_cartel_order(
  p_order_id uuid,
  p_reason   text,
  p_restock  boolean default true
)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_order public.orders;
  v_item  public.order_items;
  v_row   jsonb;
  v_qty   numeric;
  v_batch public.master_batches;
begin
  if not public.is_staff() then
    raise exception 'CARTEL_FORBIDDEN: only staff may cancel orders' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'CARTEL_ORDER_NOT_FOUND: %', p_order_id using errcode = 'P0002';
  end if;

  if v_order.status in ('CANCELLED', 'REFUNDED') then
    return v_order;
  end if;

  if p_restock then
    for v_item in select * from public.order_items where order_id = p_order_id
    loop
      for v_row in select jsonb_array_elements(v_item.batch_allocation)
      loop
        v_qty := (v_row ->> 'base_qty')::numeric;

        update public.master_batches
        set remaining_base_qty = remaining_base_qty + v_qty,
            received_base_qty  = greatest(received_base_qty, remaining_base_qty + v_qty)
        where id = (v_row ->> 'batch_id')::uuid
        returning * into v_batch;

        if found then
          insert into public.stock_movements (
            master_batch_id, product_id, branch_id, movement_type, base_uom,
            base_qty_delta, balance_after, unit_cost_cents, order_id, performed_by, reason
          )
          values (
            v_batch.id, v_item.product_id, v_batch.branch_id, 'RETURN', v_item.base_uom,
            v_qty, v_batch.remaining_base_qty, v_batch.cost_per_base_unit_cents,
            p_order_id, auth.uid(), format('Cancelled %s', v_order.order_number)
          );
        end if;
      end loop;
    end loop;
  end if;

  -- Reverse loyalty and credit side effects.
  if v_order.member_id is not null then
    update public.members
    set lifetime_value_cents = greatest(0, lifetime_value_cents - v_order.total_cents),
        order_count          = greatest(0, order_count - 1),
        points_balance       = greatest(0, points_balance - v_order.points_earned + v_order.points_redeemed)
    where id = v_order.member_id;

    update public.members m
    set credit_balance_cents = m.credit_balance_cents + coalesce(c.refund, 0)
    from (
      select sum(amount_cents) as refund
      from public.payments
      where order_id = p_order_id and method = 'MEMBER_CREDIT' and status = 'CAPTURED'
    ) c
    where m.id = v_order.member_id and coalesce(c.refund, 0) > 0;
  end if;

  update public.payments
  set status = 'REFUNDED', updated_at = now()
  where order_id = p_order_id and status in ('PENDING', 'AUTHORIZED', 'CAPTURED');

  update public.orders
  set status           = 'CANCELLED',
      cancelled_reason = p_reason
  where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$fn$;

-- ---------------------------------------------------------------------
-- 6. MEMBER ONBOARDING / KYC
-- ---------------------------------------------------------------------
create or replace function public.submit_member_kyc(p_payload jsonb)
returns public.members
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_member   public.members;
  v_doc_type id_document_type;
  v_sa_id    text;
  v_dob      date;
begin
  if auth.uid() is null then
    raise exception 'CARTEL_UNAUTHENTICATED: sign in before onboarding' using errcode = '42501';
  end if;

  v_doc_type := (p_payload ->> 'id_document_type')::id_document_type;

  if v_doc_type = 'SA_ID' then
    v_sa_id := regexp_replace(coalesce(p_payload ->> 'sa_id_number', ''), '[^0-9]', '', 'g');

    if not public.sa_id_luhn_valid(v_sa_id) then
      raise exception 'CARTEL_INVALID_SA_ID: checksum failed on the supplied ID number'
        using errcode = '22023';
    end if;

    v_dob := public.sa_id_to_dob(v_sa_id);
    if v_dob is null then
      raise exception 'CARTEL_INVALID_SA_ID: date of birth could not be parsed'
        using errcode = '22023';
    end if;
  else
    v_sa_id := null;
    v_dob := (p_payload ->> 'date_of_birth')::date;
    if v_dob is null then
      raise exception 'CARTEL_INVALID_DOB: passport onboarding requires a date of birth'
        using errcode = '22023';
    end if;
  end if;

  if not public.is_of_legal_age(v_dob) then
    raise exception 'CARTEL_UNDERAGE: 420 Cartel membership is restricted to adults 18 and over'
      using errcode = '42501';
  end if;

  insert into public.members (
    id, first_name, last_name, email, phone, id_document_type,
    sa_id_number, passport_number, passport_country, date_of_birth,
    nationality, gender, preferred_uom, marketing_opt_in, home_branch_id,
    referred_by_code, age_verified_at, kyc_submitted_at, status
  )
  values (
    auth.uid(),
    p_payload ->> 'first_name',
    p_payload ->> 'last_name',
    p_payload ->> 'email',
    p_payload ->> 'phone',
    v_doc_type,
    v_sa_id,
    nullif(p_payload ->> 'passport_number', ''),
    nullif(p_payload ->> 'passport_country', ''),
    v_dob,
    coalesce(
      nullif(p_payload ->> 'nationality', ''),
      case when v_doc_type = 'SA_ID' then public.sa_id_citizenship(v_sa_id) else null end
    ),
    coalesce(
      nullif(p_payload ->> 'gender', ''),
      case when v_doc_type = 'SA_ID' then public.sa_id_gender(v_sa_id) else null end
    ),
    coalesce(nullif(p_payload ->> 'preferred_uom', '')::base_uom, 'GRAMS'),
    coalesce((p_payload ->> 'marketing_opt_in')::boolean, false),
    nullif(p_payload ->> 'home_branch_id', '')::uuid,
    nullif(upper(trim(coalesce(p_payload ->> 'referred_by_code', ''))), ''),
    now(),
    now(),
    'PENDING_KYC'
  )
  on conflict (id) do update
  set first_name       = excluded.first_name,
      last_name        = excluded.last_name,
      email            = excluded.email,
      phone            = excluded.phone,
      id_document_type = excluded.id_document_type,
      sa_id_number     = excluded.sa_id_number,
      passport_number  = excluded.passport_number,
      passport_country = excluded.passport_country,
      date_of_birth    = excluded.date_of_birth,
      nationality      = excluded.nationality,
      gender           = excluded.gender,
      preferred_uom    = excluded.preferred_uom,
      marketing_opt_in = excluded.marketing_opt_in,
      home_branch_id   = excluded.home_branch_id,
      age_verified_at  = coalesce(public.members.age_verified_at, now()),
      kyc_submitted_at = now()
  returning * into v_member;

  -- Credit the referrer's signup counter once.
  if v_member.referred_by_code is not null then
    update public.affiliate_codes
    set signup_count = signup_count + 1
    where code = v_member.referred_by_code and is_active;
  end if;

  return v_member;
end;
$fn$;

create or replace function public.sign_membership_agreement(
  p_version        text,
  p_signature_path text
)
returns public.members
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_member public.members;
begin
  update public.members
  set agreement_signed_at      = now(),
      agreement_version        = p_version,
      agreement_signature_path = p_signature_path
  where id = auth.uid()
  returning * into v_member;

  if not found then
    raise exception 'CARTEL_NO_PROFILE: complete onboarding before signing' using errcode = 'P0002';
  end if;

  return v_member;
end;
$fn$;

create or replace function public.review_member_kyc(
  p_member_id uuid,
  p_approve   boolean,
  p_reason    text default null
)
returns public.members
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_member public.members;
begin
  if not public.is_manager() then
    raise exception 'CARTEL_FORBIDDEN: only owners and managers may review KYC'
      using errcode = '42501';
  end if;

  select * into v_member from public.members where id = p_member_id for update;
  if not found then
    raise exception 'CARTEL_MEMBER_NOT_FOUND: %', p_member_id using errcode = 'P0002';
  end if;

  if p_approve then
    if v_member.agreement_signed_at is null then
      raise exception 'CARTEL_AGREEMENT_UNSIGNED: % has not signed the membership agreement',
        v_member.member_code
        using errcode = '22023';
    end if;

    update public.kyc_documents
    set review_status = 'APPROVED', reviewed_by = auth.uid(), reviewed_at = now()
    where member_id = p_member_id and review_status = 'PENDING';

    update public.members
    set status          = 'ACTIVE_MEMBER',
        kyc_approved_at = now(),
        kyc_approved_by = auth.uid(),
        age_verified_at = coalesce(age_verified_at, now()),
        suspended_reason = null
    where id = p_member_id
    returning * into v_member;
  else
    update public.kyc_documents
    set review_status    = 'REJECTED',
        reviewed_by      = auth.uid(),
        reviewed_at      = now(),
        rejection_reason = p_reason
    where member_id = p_member_id and review_status = 'PENDING';

    update public.members
    set status           = 'PENDING_KYC',
        kyc_approved_at  = null,
        suspended_reason = p_reason
    where id = p_member_id
    returning * into v_member;
  end if;

  insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, after_data)
  values (
    auth.uid(), public.staff_role_of()::text,
    case when p_approve then 'KYC_APPROVED' else 'KYC_REJECTED' end,
    'members', p_member_id,
    jsonb_build_object('status', v_member.status, 'reason', p_reason)
  );

  return v_member;
end;
$fn$;

-- POS member lookup by wallet-pass QR token, member code or phone.
create or replace function public.lookup_member_for_pos(p_query text)
returns table (
  member_id          uuid,
  member_code        text,
  full_name          text,
  status             member_status,
  rank               member_rank,
  age_verified       boolean,
  date_of_birth      date,
  age_years          int,
  preferred_uom      base_uom,
  credit_balance_cents bigint,
  points_balance     bigint,
  lifetime_value_cents bigint,
  order_count        int,
  last_order_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_clean text;
begin
  if not public.is_staff() then
    raise exception 'CARTEL_FORBIDDEN: POS lookup requires active staff' using errcode = '42501';
  end if;

  v_clean := trim(coalesce(p_query, ''));
  if v_clean = '' then
    return;
  end if;

  return query
  select
    m.id,
    m.member_code,
    m.first_name || ' ' || m.last_name,
    m.status,
    m.rank,
    m.age_verified_at is not null,
    m.date_of_birth,
    public.age_years(m.date_of_birth),
    m.preferred_uom,
    m.credit_balance_cents,
    m.points_balance,
    m.lifetime_value_cents,
    m.order_count,
    (select max(o.created_at) from public.orders o where o.member_id = m.id)
  from public.members m
  where
    (v_clean ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and m.qr_token = v_clean::uuid)
    or m.member_code = upper(v_clean)
    or m.phone = v_clean
    or m.phone = regexp_replace(v_clean, '[^0-9+]', '', 'g')
    or m.email = v_clean
  limit 5;
end;
$fn$;

create or replace function public.rotate_member_qr_token()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_token uuid;
begin
  update public.members
  set qr_token = gen_random_uuid()
  where id = auth.uid()
  returning qr_token into v_token;

  if not found then
    raise exception 'CARTEL_NO_PROFILE: no member profile for this account' using errcode = 'P0002';
  end if;

  return v_token;
end;
$fn$;

-- ---------------------------------------------------------------------
-- 7. MEMBER CREDIT TOP-UP (staff / float)
-- ---------------------------------------------------------------------
create or replace function public.adjust_member_credit(
  p_member_id uuid,
  p_delta_cents bigint,
  p_reason    text
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_balance bigint;
begin
  if not public.is_manager() then
    raise exception 'CARTEL_FORBIDDEN: only owners and managers may adjust member credit'
      using errcode = '42501';
  end if;

  if p_delta_cents = 0 then
    raise exception 'CARTEL_INVALID_AMOUNT: adjustment must be non-zero' using errcode = '22023';
  end if;

  update public.members
  set credit_balance_cents = credit_balance_cents + p_delta_cents
  where id = p_member_id
  returning credit_balance_cents into v_balance;

  if not found then
    raise exception 'CARTEL_MEMBER_NOT_FOUND: %', p_member_id using errcode = 'P0002';
  end if;

  insert into public.member_credit_ledger (
    member_id, delta_cents, balance_after, reason, created_by
  )
  values (p_member_id, p_delta_cents, v_balance, p_reason, auth.uid());

  return v_balance;
end;
$fn$;
