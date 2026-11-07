-- =====================================================================
-- 420 CARTEL :: CATALOGUE, MULTI-UNIT INVENTORY, ORDERS, FULFILMENT
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. CATALOGUE
-- ---------------------------------------------------------------------
create table public.products (
  id             uuid primary key default gen_random_uuid(),
  sku            citext not null unique,
  name           text not null,
  slug           citext not null unique,
  category       product_category not null,
  base_uom       base_uom not null,
  strain         strain_type not null default 'NOT_APPLICABLE',
  short_tagline  text,
  description    text,
  brand          text default '420 Cartel',

  thc_pct        numeric(5, 2) check (thc_pct is null or thc_pct between 0 and 100),
  cbd_pct        numeric(5, 2) check (cbd_pct is null or cbd_pct between 0 and 100),
  terpene_tags   text[] not null default '{}',
  extraction_purity_pct numeric(5, 2) check (extraction_purity_pct is null or extraction_purity_pct between 0 and 100),

  is_active      boolean not null default true,
  is_member_only boolean not null default true,
  is_featured    boolean not null default false,
  sort_order     int not null default 0,

  hero_media_url text,
  gallery        jsonb not null default '[]'::jsonb,
  model_glb_url  text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint products_gallery_is_array check (jsonb_typeof(gallery) = 'array')
);

create index products_category_idx on public.products (category) where is_active;
create index products_uom_idx on public.products (base_uom) where is_active;
create index products_terpene_idx on public.products using gin (terpene_tags);

comment on column public.products.base_uom is
  'Unit the parent master_batch balance is held in. GRAMS -> flower/hash/extract, MILLILITERS -> elixirs/oils/distillate, UNITS -> pre-rolls/edibles/vapes/merch.';

-- A variant is a sellable tier. base_quantity is always expressed in the
-- parent product base_uom, so 3.5g flower and 30ml elixir both deduct from
-- one balance with one code path.
create table public.product_variants (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references public.products (id) on delete cascade,
  label            text not null,
  base_quantity    numeric(12, 3) not null check (base_quantity > 0),
  price_cents      bigint not null check (price_cents >= 0),
  compare_at_cents bigint check (compare_at_cents is null or compare_at_cents >= price_cents),
  barcode          citext,
  is_active        boolean not null default true,
  is_custom_amount boolean not null default false,
  pos_quick_key    boolean not null default false,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (product_id, label)
);

create unique index product_variants_barcode_unique on public.product_variants (barcode)
  where barcode is not null;
create index product_variants_product_idx on public.product_variants (product_id) where is_active;
create index product_variants_quick_key_idx on public.product_variants (product_id)
  where pos_quick_key and is_active;

comment on column public.product_variants.base_quantity is
  'Amount of the parent base_uom consumed by one of this variant: 3.5 for a 3.5g tier, 30 for a 30ml bottle, 1 for a single unit.';
comment on column public.product_variants.is_custom_amount is
  'Marks the open-ended POS tier (Custom g / Custom ml). base_quantity holds the minimum sellable amount and the cashier supplies the actual amount at sale time.';

-- ---------------------------------------------------------------------
-- 2. MASTER BATCHES (the single source of truth for stock)
-- ---------------------------------------------------------------------
create table public.master_batches (
  id                      uuid primary key default gen_random_uuid(),
  product_id              uuid not null references public.products (id) on delete restrict,
  branch_id               uuid not null references public.branches (id) on delete restrict,
  batch_code              citext not null,

  harvest_date            date,
  production_date         date,
  expiry_date             date,

  lab_thc_pct             numeric(5, 2) check (lab_thc_pct is null or lab_thc_pct between 0 and 100),
  lab_cbd_pct             numeric(5, 2) check (lab_cbd_pct is null or lab_cbd_pct between 0 and 100),
  lab_report_url          text,
  terpene_profile         jsonb not null default '{}'::jsonb,

  cost_per_base_unit_cents bigint not null default 0 check (cost_per_base_unit_cents >= 0),
  received_base_qty       numeric(14, 3) not null check (received_base_qty >= 0),
  remaining_base_qty      numeric(14, 3) not null check (remaining_base_qty >= 0),
  reserved_base_qty       numeric(14, 3) not null default 0 check (reserved_base_qty >= 0),
  low_stock_threshold     numeric(14, 3) not null default 0 check (low_stock_threshold >= 0),

  is_active               boolean not null default true,
  received_at             timestamptz not null default now(),
  created_by              uuid references public.staff_profiles (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  unique (branch_id, batch_code),
  constraint master_batches_not_oversold check (remaining_base_qty <= received_base_qty),
  constraint master_batches_reserve_within_stock check (reserved_base_qty <= remaining_base_qty)
);

create index master_batches_product_branch_idx
  on public.master_batches (product_id, branch_id)
  where is_active;
create index master_batches_fifo_idx
  on public.master_batches (product_id, branch_id, received_at)
  where is_active and remaining_base_qty > 0;

comment on table public.master_batches is
  'Parent stock balance in the product base_uom. Every variant tier of a product deducts from these batches, FIFO by received_at.';
comment on column public.master_batches.reserved_base_qty is
  'Soft-held quantity for open online carts and in-flight POS tickets. available = remaining_base_qty - reserved_base_qty.';

-- Sellable availability per product/branch, net of reservations.
create or replace view public.product_stock_levels as
select
  p.id                                                as product_id,
  p.sku,
  p.name,
  p.category,
  p.base_uom,
  b.branch_id,
  sum(b.remaining_base_qty)                           as remaining_base_qty,
  sum(b.reserved_base_qty)                            as reserved_base_qty,
  sum(b.remaining_base_qty - b.reserved_base_qty)     as available_base_qty,
  max(b.low_stock_threshold)                          as low_stock_threshold,
  (sum(b.remaining_base_qty - b.reserved_base_qty) <= max(b.low_stock_threshold)) as is_low_stock,
  count(*) filter (where b.remaining_base_qty > 0)    as open_batch_count
from public.products p
join public.master_batches b on b.product_id = p.id
where p.is_active and b.is_active
group by p.id, p.sku, p.name, p.category, p.base_uom, b.branch_id;

-- ---------------------------------------------------------------------
-- 3. STOCK MOVEMENT AUDIT LOG
-- ---------------------------------------------------------------------
create table public.stock_movements (
  id               uuid primary key default gen_random_uuid(),
  master_batch_id  uuid not null references public.master_batches (id) on delete restrict,
  product_id       uuid not null references public.products (id) on delete restrict,
  branch_id        uuid not null references public.branches (id) on delete restrict,
  movement_type    stock_movement_type not null,
  base_uom         base_uom not null,
  base_qty_delta   numeric(14, 3) not null check (base_qty_delta <> 0),
  balance_after    numeric(14, 3) not null check (balance_after >= 0),
  unit_cost_cents  bigint not null default 0,
  order_id         uuid,
  performed_by     uuid references auth.users (id) on delete set null,
  reason           text,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create index stock_movements_batch_idx on public.stock_movements (master_batch_id, created_at desc);
create index stock_movements_product_idx on public.stock_movements (product_id, created_at desc);
create index stock_movements_order_idx on public.stock_movements (order_id) where order_id is not null;
create index stock_movements_type_idx on public.stock_movements (movement_type, created_at desc);

-- ---------------------------------------------------------------------
-- 4. DELIVERY ZONES
-- ---------------------------------------------------------------------
create table public.delivery_zones (
  id                uuid primary key default gen_random_uuid(),
  branch_id         uuid not null references public.branches (id) on delete cascade,
  name              text not null,
  -- GeoJSON-style ring: [[lng, lat], ...]. Null means use radius matching.
  polygon           jsonb,
  max_radius_km     numeric(6, 2) check (max_radius_km is null or max_radius_km > 0),
  fee_cents         bigint not null default 0 check (fee_cents >= 0),
  min_order_cents   bigint not null default 0 check (min_order_cents >= 0),
  free_over_cents   bigint check (free_over_cents is null or free_over_cents >= 0),
  eta_minutes       int not null default 60 check (eta_minutes > 0),
  priority          int not null default 100,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint delivery_zones_has_geometry check (polygon is not null or max_radius_km is not null),
  constraint delivery_zones_polygon_is_array check (polygon is null or jsonb_typeof(polygon) = 'array'),
  unique (branch_id, name)
);

create index delivery_zones_branch_idx on public.delivery_zones (branch_id, priority)
  where is_active;

-- Ray-casting point-in-polygon over a GeoJSON ring of [lng, lat] pairs.
create or replace function public.point_in_polygon(
  p_lat     double precision,
  p_lng     double precision,
  p_polygon jsonb
)
returns boolean
language plpgsql
immutable
as $fn$
declare
  v_n       int;
  v_i       int;
  v_j       int;
  v_xi      double precision;
  v_yi      double precision;
  v_xj      double precision;
  v_yj      double precision;
  v_inside  boolean := false;
begin
  if p_polygon is null or jsonb_typeof(p_polygon) <> 'array' then
    return false;
  end if;

  v_n := jsonb_array_length(p_polygon);
  if v_n < 3 then
    return false;
  end if;

  v_j := v_n - 1;
  for v_i in 0 .. v_n - 1 loop
    v_xi := (p_polygon -> v_i -> 0)::text::double precision;
    v_yi := (p_polygon -> v_i -> 1)::text::double precision;
    v_xj := (p_polygon -> v_j -> 0)::text::double precision;
    v_yj := (p_polygon -> v_j -> 1)::text::double precision;

    if ((v_yi > p_lat) <> (v_yj > p_lat))
       and (p_lng < (v_xj - v_xi) * (p_lat - v_yi) / nullif(v_yj - v_yi, 0) + v_xi) then
      v_inside := not v_inside;
    end if;

    v_j := v_i;
  end loop;

  return v_inside;
end;
$fn$;

-- Great-circle distance in kilometres.
create or replace function public.haversine_km(
  p_lat1 double precision,
  p_lng1 double precision,
  p_lat2 double precision,
  p_lng2 double precision
)
returns numeric
language sql
immutable
as $fn$
  select round(
    (6371 * 2 * asin(
      sqrt(
        power(sin(radians(p_lat2 - p_lat1) / 2), 2) +
        cos(radians(p_lat1)) * cos(radians(p_lat2)) *
        power(sin(radians(p_lng2 - p_lng1) / 2), 2)
      )
    ))::numeric,
    3
  );
$fn$;

-- Resolves the cheapest applicable zone for a drop point: polygon match wins
-- over radius match, then lowest priority value, then lowest fee.
create or replace function public.resolve_delivery_zone(
  p_branch_id uuid,
  p_lat       double precision,
  p_lng       double precision
)
returns table (
  zone_id         uuid,
  zone_name       text,
  fee_cents       bigint,
  min_order_cents bigint,
  free_over_cents bigint,
  eta_minutes     int,
  distance_km     numeric,
  matched_by      text
)
language sql
stable
as $fn$
  with branch as (
    select id, latitude, longitude from public.branches where id = p_branch_id
  ),
  candidates as (
    select
      z.id,
      z.name,
      z.fee_cents,
      z.min_order_cents,
      z.free_over_cents,
      z.eta_minutes,
      z.priority,
      public.haversine_km(b.latitude, b.longitude, p_lat, p_lng) as distance_km,
      case
        when z.polygon is not null and public.point_in_polygon(p_lat, p_lng, z.polygon) then 'POLYGON'
        when z.max_radius_km is not null
             and public.haversine_km(b.latitude, b.longitude, p_lat, p_lng) <= z.max_radius_km then 'RADIUS'
        else null
      end as matched_by
    from public.delivery_zones z
    join branch b on b.id = z.branch_id
    where z.is_active
  )
  select id, name, fee_cents, min_order_cents, free_over_cents, eta_minutes, distance_km, matched_by
  from candidates
  where matched_by is not null
  order by (matched_by = 'POLYGON') desc, priority asc, fee_cents asc
  limit 1;
$fn$;

-- ---------------------------------------------------------------------
-- 5. ORDERS
-- ---------------------------------------------------------------------
create sequence public.order_number_seq start 10001;

create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  order_number        text not null unique,
  channel             order_channel not null,
  status              order_status not null default 'DRAFT',
  fulfilment_type     fulfilment_type not null,

  branch_id           uuid not null references public.branches (id) on delete restrict,
  member_id           uuid references public.members (id) on delete set null,
  staff_id            uuid references public.staff_profiles (id) on delete set null,

  subtotal_cents      bigint not null default 0 check (subtotal_cents >= 0),
  discount_cents      bigint not null default 0 check (discount_cents >= 0),
  delivery_fee_cents  bigint not null default 0 check (delivery_fee_cents >= 0),
  total_cents         bigint not null default 0 check (total_cents >= 0),
  cost_cents          bigint not null default 0 check (cost_cents >= 0),
  points_earned       bigint not null default 0 check (points_earned >= 0),
  points_redeemed     bigint not null default 0 check (points_redeemed >= 0),

  -- Delivery
  delivery_zone_id    uuid references public.delivery_zones (id) on delete set null,
  delivery_address    text,
  delivery_suburb     text,
  delivery_lat        double precision,
  delivery_lng        double precision,
  delivery_distance_km numeric(6, 2),
  delivery_instructions text,
  driver_id           uuid references public.staff_profiles (id) on delete set null,

  -- Pickup
  pickup_slot_start   timestamptz,
  pickup_slot_end     timestamptz,

  referral_code       text,
  notes               text,
  cancelled_reason    text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  paid_at             timestamptz,
  completed_at        timestamptz,

  constraint orders_delivery_needs_address check (
    fulfilment_type <> 'DELIVERY'
    or (delivery_address is not null and delivery_lat is not null and delivery_lng is not null)
  ),
  constraint orders_pickup_needs_slot check (
    fulfilment_type <> 'PICKUP' or pickup_slot_start is not null
  ),
  constraint orders_pos_is_in_store_or_pickup check (
    channel <> 'POS' or fulfilment_type in ('IN_STORE', 'PICKUP')
  ),
  constraint orders_total_balances check (
    total_cents = subtotal_cents - discount_cents + delivery_fee_cents
  )
);

create index orders_member_idx on public.orders (member_id, created_at desc);
create index orders_branch_status_idx on public.orders (branch_id, status, created_at desc);
create index orders_channel_idx on public.orders (channel, created_at desc);
create index orders_driver_idx on public.orders (driver_id, status) where driver_id is not null;
create index orders_referral_idx on public.orders (referral_code) where referral_code is not null;

create table public.order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders (id) on delete cascade,
  product_id       uuid not null references public.products (id) on delete restrict,
  variant_id       uuid references public.product_variants (id) on delete set null,

  -- Snapshot so historic receipts survive catalogue edits.
  product_name     text not null,
  variant_label    text not null,
  base_uom         base_uom not null,
  base_qty         numeric(14, 3) not null check (base_qty > 0),
  quantity         int not null default 1 check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  line_total_cents bigint not null check (line_total_cents >= 0),
  cost_cents       bigint not null default 0 check (cost_cents >= 0),
  batch_allocation jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now(),
  constraint order_items_batch_allocation_is_array check (jsonb_typeof(batch_allocation) = 'array')
);

create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);

comment on column public.order_items.base_qty is
  'Total base units consumed by this line: variant.base_quantity * quantity, in the product base_uom.';
comment on column public.order_items.batch_allocation is
  'FIFO allocation actually deducted: [{batch_id, batch_code, base_qty, unit_cost_cents}].';

alter table public.stock_movements
  add constraint stock_movements_order_fk
  foreign key (order_id) references public.orders (id) on delete set null;

-- ---------------------------------------------------------------------
-- 6. PAYMENTS (provider-agnostic)
-- ---------------------------------------------------------------------
create table public.payments (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders (id) on delete cascade,
  method           payment_method not null,
  status           payment_status not null default 'PENDING',
  amount_cents     bigint not null check (amount_cents > 0),
  tendered_cents   bigint check (tendered_cents is null or tendered_cents >= 0),
  change_cents     bigint check (change_cents is null or change_cents >= 0),
  provider         text not null default 'INTERNAL',
  provider_ref     text,
  provider_payload jsonb not null default '{}'::jsonb,
  captured_at      timestamptz,
  failure_reason   text,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index payments_order_idx on public.payments (order_id);
create index payments_status_idx on public.payments (status, created_at desc);
create unique index payments_provider_ref_unique on public.payments (provider, provider_ref)
  where provider_ref is not null;

create table public.member_credit_ledger (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references public.members (id) on delete cascade,
  order_id       uuid references public.orders (id) on delete set null,
  delta_cents    bigint not null check (delta_cents <> 0),
  balance_after  bigint not null check (balance_after >= 0),
  reason         text not null,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index member_credit_ledger_member_idx on public.member_credit_ledger (member_id, created_at desc);

-- ---------------------------------------------------------------------
-- 7. LOYALTY & AFFILIATE (schema now, rules configured later)
-- ---------------------------------------------------------------------
create table public.loyalty_rules (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null unique,
  is_active              boolean not null default true,
  points_per_100_cents   numeric(10, 4) not null default 1 check (points_per_100_cents >= 0),
  point_value_cents      numeric(10, 4) not null default 1 check (point_value_cents >= 0),
  min_redeem_points      bigint not null default 100 check (min_redeem_points >= 0),
  rank_thresholds        jsonb not null default
    '{"INITIATE": 0, "SOLDIER": 250000, "CAPO": 1000000, "CONSIGLIERE": 5000000}'::jsonb,
  category_multipliers   jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on column public.loyalty_rules.rank_thresholds is
  'member_rank -> lifetime_value_cents required. Tunable without a migration.';

create table public.loyalty_ledger (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references public.members (id) on delete cascade,
  order_id       uuid references public.orders (id) on delete set null,
  points_delta   bigint not null check (points_delta <> 0),
  balance_after  bigint not null check (balance_after >= 0),
  reason         text not null,
  expires_at     timestamptz,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index loyalty_ledger_member_idx on public.loyalty_ledger (member_id, created_at desc);
create index loyalty_ledger_order_idx on public.loyalty_ledger (order_id) where order_id is not null;

create table public.affiliate_codes (
  id              uuid primary key default gen_random_uuid(),
  code            citext not null unique,
  owner_member_id uuid references public.members (id) on delete set null,
  label           text,
  commission_bps  int not null default 0 check (commission_bps between 0 and 10000),
  click_count     bigint not null default 0 check (click_count >= 0),
  signup_count    bigint not null default 0 check (signup_count >= 0),
  order_count     bigint not null default 0 check (order_count >= 0),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.affiliate_attributions (
  id                 uuid primary key default gen_random_uuid(),
  affiliate_code_id  uuid not null references public.affiliate_codes (id) on delete cascade,
  member_id          uuid references public.members (id) on delete set null,
  order_id           uuid references public.orders (id) on delete set null,
  commission_cents   bigint not null default 0 check (commission_cents >= 0),
  landing_path       text,
  created_at         timestamptz not null default now(),
  unique (affiliate_code_id, order_id)
);

create index affiliate_attributions_code_idx on public.affiliate_attributions (affiliate_code_id, created_at desc);

-- ---------------------------------------------------------------------
-- 8. HIGGSFIELD MEDIA JOBS
-- ---------------------------------------------------------------------
create table public.product_media_jobs (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products (id) on delete cascade,
  provider      text not null default 'HIGGSFIELD',
  provider_job_id text,
  kind          text not null default 'PROMO_REEL',
  prompt        text not null,
  params        jsonb not null default '{}'::jsonb,
  status        media_job_status not null default 'QUEUED',
  output_url    text,
  poster_url    text,
  duration_seconds numeric(6, 2),
  error_message text,
  attempts      int not null default 0 check (attempts >= 0),
  requested_by  uuid references public.staff_profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create index product_media_jobs_product_idx on public.product_media_jobs (product_id, created_at desc);
create index product_media_jobs_open_idx on public.product_media_jobs (status)
  where status in ('QUEUED', 'PROCESSING');
create unique index product_media_jobs_provider_unique
  on public.product_media_jobs (provider, provider_job_id)
  where provider_job_id is not null;

-- ---------------------------------------------------------------------
-- 9. GENERIC AUDIT LOG
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references auth.users (id) on delete set null,
  actor_role  text,
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  before_data jsonb,
  after_data  jsonb,
  ip_address  inet,
  created_at  timestamptz not null default now()
);

create index audit_logs_entity_idx on public.audit_logs (entity, entity_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

-- ---------------------------------------------------------------------
-- 10. updated_at TRIGGERS
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

do $do$
declare
  t text;
begin
  foreach t in array array[
    'branches', 'staff_profiles', 'members', 'products', 'product_variants',
    'master_batches', 'delivery_zones', 'orders', 'payments', 'loyalty_rules',
    'affiliate_codes', 'product_media_jobs'
  ]
  loop
    execute format(
      'create trigger %I_touch_updated_at before update on public.%I
         for each row execute function public.touch_updated_at()',
      t, t
    );
  end loop;
end;
$do$;
