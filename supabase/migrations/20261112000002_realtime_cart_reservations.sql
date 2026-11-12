-- =====================================================================
-- 420 CARTEL :: REAL-TIME CART RESERVATIONS & IMS STOCK SYNC
-- Supports fractional g / ml / unit holds per branch & live IMS updates
-- =====================================================================

-- 1. Upgrade inventory_reservations for fractional UOM quantities & member labels
alter table public.inventory_reservations
  add column if not exists base_qty numeric(12,3) not null default 0,
  add column if not exists member_label text;

alter table public.inventory_reservations
  alter column quantity set default 1;

-- Backfill base_qty from legacy integer quantity if any rows exist
update public.inventory_reservations
   set base_qty = quantity::numeric
 where base_qty = 0 and quantity > 0;

create index if not exists idx_inventory_reservations_branch_product
  on public.inventory_reservations (branch_id, product_id, expires_at);

-- Allow staff to view active cart holds inside IMS in real time
drop policy if exists "Staff manage reservations" on public.inventory_reservations;
create policy "Staff view all reservations"
  on public.inventory_reservations
  for select
  using (public.is_staff());

-- Ensure realtime stream emits batch & cart hold changes to /admin/inventory
do $$
begin
  alter publication supabase_realtime add table public.master_batches;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.inventory_reservations;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.stock_movements;
exception when duplicate_object then null;
end $$;

-- 2. Atomic cart reservation sync: replaces holds for one cart_session_id,
--    purges expired holds, and recomputes master_batches.reserved_base_qty FIFO
--    (which also triggers master_batches_board_sync -> product_stock_board).
create or replace function public.sync_cart_stock_holds(
  p_cart_session_id text,
  p_branch_id       uuid,
  p_holds           jsonb,
  p_member_label    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_now      timestamptz := now();
  v_expires  timestamptz := now() + interval '30 minutes';
  v_item     jsonb;
  v_pair     record;
  v_batch    record;
  v_held     numeric;
  v_take     numeric;
  v_prod_id  uuid;
  v_qty      numeric;
  v_touched  int := 0;
begin
  if p_cart_session_id is null or length(trim(p_cart_session_id)) < 4 then
    raise exception 'CARTEL_INVALID_SESSION: invalid cart_session_id' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_holds, '[]'::jsonb)) <> 'array' then
    raise exception 'CARTEL_INVALID_PAYLOAD: p_holds must be a JSON array' using errcode = '22023';
  end if;

  create temp table if not exists _affected_cart_pairs (
    branch_id  uuid not null,
    product_id uuid not null,
    primary key (branch_id, product_id)
  ) on commit drop;
  truncate _affected_cart_pairs;

  -- Record all pairs whose hold count might change (expired or owned by this session)
  insert into _affected_cart_pairs (branch_id, product_id)
  select distinct r.branch_id, r.product_id
    from public.inventory_reservations r
   where r.cart_session_id = p_cart_session_id
      or r.expires_at <= v_now
  on conflict do nothing;

  -- Purge expired holds across all sessions and clear this session's prior rows
  delete from public.inventory_reservations
   where cart_session_id = p_cart_session_id
      or expires_at <= v_now;

  -- Insert fresh holds for this session (capped to prevent abuse)
  for v_item in
    select elem from jsonb_array_elements(coalesce(p_holds, '[]'::jsonb)) as elem
    limit 50
  loop
    v_prod_id := (v_item ->> 'product_id')::uuid;
    v_qty     := coalesce((v_item ->> 'base_qty')::numeric, 0);

    if v_prod_id is null or v_qty <= 0 or p_branch_id is null then
      continue;
    end if;

    insert into public.inventory_reservations (
      cart_session_id, branch_id, product_id, quantity, base_qty, member_label, expires_at
    )
    values (
      p_cart_session_id,
      p_branch_id,
      v_prod_id,
      greatest(1, ceil(v_qty)::int),
      round(v_qty, 3),
      nullif(trim(coalesce(p_member_label, '')), ''),
      v_expires
    );

    insert into _affected_cart_pairs (branch_id, product_id)
    values (p_branch_id, v_prod_id)
    on conflict do nothing;

    v_touched := v_touched + 1;
  end loop;

  -- Recompute master_batches.reserved_base_qty FIFO for every affected (branch, product)
  for v_pair in select branch_id, product_id from _affected_cart_pairs loop
    select coalesce(sum(base_qty), 0)
      into v_held
      from public.inventory_reservations
     where branch_id = v_pair.branch_id
       and product_id = v_pair.product_id
       and expires_at > v_now;

    for v_batch in
      select id, remaining_base_qty, reserved_base_qty
        from public.master_batches
       where branch_id = v_pair.branch_id
         and product_id = v_pair.product_id
         and is_active
       order by received_at asc, created_at asc
       for update
    loop
      v_take := least(greatest(v_held, 0), v_batch.remaining_base_qty);
      if v_batch.reserved_base_qty is distinct from v_take then
        update public.master_batches
           set reserved_base_qty = v_take,
               updated_at = v_now
         where id = v_batch.id;
      end if;
      v_held := greatest(0, v_held - v_take);
    end loop;
  end loop;

  return jsonb_build_object(
    'cart_session_id', p_cart_session_id,
    'synced_items', v_touched,
    'expires_at', v_expires
  );
end;
$fn$;

grant execute on function public.sync_cart_stock_holds(text, uuid, jsonb, text) to authenticated, anon;

