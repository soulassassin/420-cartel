-- =====================================================================
-- 420 CARTEL :: PART 2 SCHEMA
--
-- Everything Modules 4-7 need that Part 1 did not already carry:
--   1. Per-batch Higgsfield promo reel columns.
--   2. A member-safe, realtime storefront stock board. `master_batches` is
--      staff-only under RLS (it carries cost prices), so the online shop
--      cannot subscribe to it directly. This board is the projection the
--      storefront reads and subscribes to: sellable quantity in the native
--      unit, the live batch's code / THC / CBD / terpenes and its promo reel,
--      and nothing commercially sensitive.
--   3. `inventory_ledger` -- the named view over `stock_movements`.
--   4. Affiliate payout settlement (unpaid commission -> member credit).
--   5. Tunable loyalty & affiliate rule parameters (no schema change to tune).
--   6. The Johannesburg hub seed: two branches and the four delivery rings.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PER-BATCH HIGGSFIELD PROMO REELS
-- ---------------------------------------------------------------------
alter table public.master_batches
  add column if not exists higgsfield_job_id          text,
  add column if not exists higgsfield_promo_video_url text,
  add column if not exists higgsfield_poster_url      text,
  add column if not exists higgsfield_generated_at    timestamptz;

comment on column public.master_batches.higgsfield_promo_video_url is
  'Monochrome-and-gold promo reel generated for THIS batch by the Higgsfield MCP pipeline. Played as the hover preview on the storefront product card.';

create index if not exists master_batches_higgsfield_job_idx
  on public.master_batches (higgsfield_job_id)
  where higgsfield_job_id is not null;

-- ---------------------------------------------------------------------
-- 2. STOREFRONT STOCK BOARD (member-safe projection of master_batches)
-- ---------------------------------------------------------------------
create table if not exists public.product_stock_board (
  product_id          uuid not null references public.products (id) on delete cascade,
  branch_id           uuid not null references public.branches (id) on delete cascade,
  base_uom            base_uom not null,

  remaining_base_qty  numeric(14, 3) not null default 0,
  reserved_base_qty   numeric(14, 3) not null default 0,
  available_base_qty  numeric(14, 3) not null default 0,
  open_batch_count    int not null default 0,
  low_stock_threshold numeric(14, 3) not null default 0,
  is_low_stock        boolean not null default false,

  -- The FIFO-oldest open batch: the one a shopper is actually buying from.
  featured_batch_id   uuid references public.master_batches (id) on delete set null,
  featured_batch_code text,
  lab_thc_pct         numeric(5, 2),
  lab_cbd_pct         numeric(5, 2),
  terpene_profile     jsonb not null default '{}'::jsonb,
  expiry_date         date,
  promo_video_url     text,
  promo_poster_url    text,

  updated_at          timestamptz not null default now(),
  primary key (product_id, branch_id)
);

comment on table public.product_stock_board is
  'Realtime storefront projection of master_batches. Written only by trigger. Carries no cost price, so it is safe for anon and member subscribers: a POS sale of the last 3.5g updates every open shop tab through this table.';

create index if not exists product_stock_board_branch_idx
  on public.product_stock_board (branch_id)
  where available_base_qty > 0;

create or replace function public.refresh_product_stock_board(
  p_product_id uuid,
  p_branch_id  uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uom       base_uom;
  v_agg       record;
  v_featured  record;
  v_any_batch boolean;
begin
  select base_uom into v_uom from public.products where id = p_product_id;

  -- Product gone: the board row has nothing left to describe.
  if v_uom is null then
    delete from public.product_stock_board
    where product_id = p_product_id and branch_id = p_branch_id;
    return;
  end if;

  select exists (
    select 1 from public.master_batches
    where product_id = p_product_id and branch_id = p_branch_id
  ) into v_any_batch;

  -- No batch has ever been received here: drop the row rather than publish
  -- a phantom zero-stock listing.
  if not v_any_batch then
    delete from public.product_stock_board
    where product_id = p_product_id and branch_id = p_branch_id;
    return;
  end if;

  select
    coalesce(sum(remaining_base_qty), 0)                               as remaining,
    coalesce(sum(reserved_base_qty), 0)                                as reserved,
    coalesce(sum(remaining_base_qty - reserved_base_qty), 0)           as available,
    coalesce(max(low_stock_threshold), 0)                              as threshold,
    count(*) filter (where remaining_base_qty - reserved_base_qty > 0) as open_batches
  into v_agg
  from public.master_batches
  where product_id = p_product_id and branch_id = p_branch_id and is_active;

  select
    b.id, b.batch_code, b.lab_thc_pct, b.lab_cbd_pct, b.terpene_profile, b.expiry_date,
    b.higgsfield_promo_video_url, b.higgsfield_poster_url
  into v_featured
  from public.master_batches b
  where b.product_id = p_product_id
    and b.branch_id = p_branch_id
    and b.is_active
    and b.remaining_base_qty - b.reserved_base_qty > 0
  order by b.received_at asc, b.created_at asc
  limit 1;

  insert into public.product_stock_board (
    product_id, branch_id, base_uom,
    remaining_base_qty, reserved_base_qty, available_base_qty,
    open_batch_count, low_stock_threshold, is_low_stock,
    featured_batch_id, featured_batch_code, lab_thc_pct, lab_cbd_pct,
    terpene_profile, expiry_date, promo_video_url, promo_poster_url, updated_at
  )
  values (
    p_product_id, p_branch_id, v_uom,
    coalesce(v_agg.remaining, 0), coalesce(v_agg.reserved, 0),
    greatest(coalesce(v_agg.available, 0), 0),
    coalesce(v_agg.open_batches, 0), coalesce(v_agg.threshold, 0),
    greatest(coalesce(v_agg.available, 0), 0) <= coalesce(v_agg.threshold, 0),
    v_featured.id, v_featured.batch_code, v_featured.lab_thc_pct, v_featured.lab_cbd_pct,
    coalesce(v_featured.terpene_profile, '{}'::jsonb), v_featured.expiry_date,
    v_featured.higgsfield_promo_video_url, v_featured.higgsfield_poster_url, now()
  )
  on conflict (product_id, branch_id) do update
  set base_uom            = excluded.base_uom,
      remaining_base_qty  = excluded.remaining_base_qty,
      reserved_base_qty   = excluded.reserved_base_qty,
      available_base_qty  = excluded.available_base_qty,
      open_batch_count    = excluded.open_batch_count,
      low_stock_threshold = excluded.low_stock_threshold,
      is_low_stock        = excluded.is_low_stock,
      featured_batch_id   = excluded.featured_batch_id,
      featured_batch_code = excluded.featured_batch_code,
      lab_thc_pct         = excluded.lab_thc_pct,
      lab_cbd_pct         = excluded.lab_cbd_pct,
      terpene_profile     = excluded.terpene_profile,
      expiry_date         = excluded.expiry_date,
      promo_video_url     = excluded.promo_video_url,
      promo_poster_url    = excluded.promo_poster_url,
      updated_at          = now();
end;
$fn$;

create or replace function public.master_batches_board_sync()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_product_stock_board(old.product_id, old.branch_id);
    return old;
  end if;

  perform public.refresh_product_stock_board(new.product_id, new.branch_id);

  -- A batch moved between products or branches leaves two boards stale.
  if tg_op = 'UPDATE'
     and (old.product_id <> new.product_id or old.branch_id <> new.branch_id) then
    perform public.refresh_product_stock_board(old.product_id, old.branch_id);
  end if;

  return new;
end;
$fn$;

drop trigger if exists master_batches_board_sync_trg on public.master_batches;
create trigger master_batches_board_sync_trg
after insert or update or delete on public.master_batches
for each row execute function public.master_batches_board_sync();

create or replace function public.products_board_sync()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_branch uuid;
begin
  for v_branch in
    select distinct branch_id from public.master_batches where product_id = new.id
  loop
    perform public.refresh_product_stock_board(new.id, v_branch);
  end loop;
  return new;
end;
$fn$;

drop trigger if exists products_board_sync_trg on public.products;
create trigger products_board_sync_trg
after update of base_uom, is_active on public.products
for each row execute function public.products_board_sync();

-- Backfill whatever stock already exists.
select public.refresh_product_stock_board(s.product_id, s.branch_id)
from (select distinct product_id, branch_id from public.master_batches) s;

alter table public.product_stock_board enable row level security;

drop policy if exists stock_board_public_read on public.product_stock_board;
create policy stock_board_public_read on public.product_stock_board
  for select using (true);

-- Writes happen only inside the security-definer trigger, which runs as the
-- table owner. No client role is granted insert / update / delete.
grant select on public.product_stock_board to anon, authenticated;

alter table public.product_stock_board replica identity full;

do $pub$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'product_stock_board'
  ) then
    alter publication supabase_realtime add table public.product_stock_board;
  end if;
end;
$pub$;

-- ---------------------------------------------------------------------
-- 3. INVENTORY LEDGER VIEW
-- ---------------------------------------------------------------------
-- The named ledger surface over stock_movements. security_invoker keeps the
-- staff-only RLS on stock_movements in charge of who sees a row.
create or replace view public.inventory_ledger
with (security_invoker = true) as
select
  sm.id,
  sm.created_at,
  sm.movement_type,
  sm.base_uom,
  sm.base_qty_delta,
  sm.balance_after,
  sm.unit_cost_cents,
  sm.reason,
  sm.metadata,
  sm.order_id,
  o.order_number,
  sm.master_batch_id,
  mb.batch_code,
  sm.product_id,
  p.name                             as product_name,
  p.sku,
  sm.branch_id,
  br.name                            as branch_name,
  sm.performed_by,
  sp.display_name                    as performed_by_name
from public.stock_movements sm
join public.master_batches mb       on mb.id = sm.master_batch_id
join public.products p              on p.id = sm.product_id
join public.branches br             on br.id = sm.branch_id
left join public.orders o           on o.id = sm.order_id
left join public.staff_profiles sp  on sp.id = sm.performed_by;

comment on view public.inventory_ledger is
  'Human-readable stock movement ledger: every intake, sale, waste, spillage and correction in g / ml / units, with batch code, product and operator resolved.';

grant select on public.inventory_ledger to authenticated;

-- ---------------------------------------------------------------------
-- 4. AFFILIATE PAYOUT SETTLEMENT
-- ---------------------------------------------------------------------
alter table public.affiliate_attributions
  add column if not exists paid_at          timestamptz,
  add column if not exists payout_reference text;

create index if not exists affiliate_attr_unpaid_idx
  on public.affiliate_attributions (affiliate_code_id)
  where paid_at is null and commission_cents > 0;

create or replace function public.settle_affiliate_commissions(
  p_affiliate_code_id uuid,
  p_reference         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_code    public.affiliate_codes;
  v_total   bigint := 0;
  v_count   int := 0;
  v_balance bigint;
  v_ref     text;
begin
  if not public.is_manager() then
    raise exception 'CARTEL_FORBIDDEN: only owners and managers may settle affiliate commission'
      using errcode = '42501';
  end if;

  select * into v_code from public.affiliate_codes where id = p_affiliate_code_id for update;
  if not found then
    raise exception 'CARTEL_AFFILIATE_NOT_FOUND: %', p_affiliate_code_id using errcode = 'P0002';
  end if;

  if v_code.owner_member_id is null then
    raise exception 'CARTEL_NO_PAYEE: % has no owning member to credit', v_code.code
      using errcode = '22023';
  end if;

  select coalesce(sum(commission_cents), 0), count(*)
  into v_total, v_count
  from public.affiliate_attributions
  where affiliate_code_id = p_affiliate_code_id
    and paid_at is null
    and commission_cents > 0;

  if v_total <= 0 then
    return jsonb_build_object(
      'affiliate_code', v_code.code,
      'settled_cents', 0,
      'attribution_count', 0,
      'credit_balance_cents',
        (select credit_balance_cents from public.members where id = v_code.owner_member_id),
      'payout_reference', null
    );
  end if;

  v_ref := coalesce(
    nullif(trim(p_reference), ''),
    'CARTEL-PAYOUT-' || to_char(now(), 'YYYYMMDD') || '-' || upper(right(v_code.code::text, 6))
  );

  update public.members
  set credit_balance_cents = credit_balance_cents + v_total
  where id = v_code.owner_member_id
  returning credit_balance_cents into v_balance;

  insert into public.member_credit_ledger (member_id, delta_cents, balance_after, reason, created_by)
  values (
    v_code.owner_member_id, v_total, v_balance,
    format('Affiliate commission payout %s (%s attributions on %s)', v_ref, v_count, v_code.code),
    auth.uid()
  );

  update public.affiliate_attributions
  set paid_at = now(), payout_reference = v_ref
  where affiliate_code_id = p_affiliate_code_id
    and paid_at is null
    and commission_cents > 0;

  insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, after_data)
  values (
    auth.uid(), public.staff_role_of()::text, 'AFFILIATE_PAYOUT',
    'affiliate_codes', p_affiliate_code_id,
    jsonb_build_object('settled_cents', v_total, 'attributions', v_count, 'reference', v_ref)
  );

  return jsonb_build_object(
    'affiliate_code', v_code.code,
    'settled_cents', v_total,
    'attribution_count', v_count,
    'credit_balance_cents', v_balance,
    'payout_reference', v_ref
  );
end;
$fn$;

revoke all on function public.settle_affiliate_commissions(uuid, text) from public;
grant execute on function public.settle_affiliate_commissions(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. TUNABLE LOYALTY & AFFILIATE RULE PARAMETERS
-- ---------------------------------------------------------------------
-- Module 7 keeps every business rule in this one row. Recalibrating the
-- programme is an UPDATE, never a migration.
alter table public.loyalty_rules
  add column if not exists default_commission_bps int    not null default 500,
  add column if not exists referral_window_days    int    not null default 30,
  add column if not exists signup_bonus_points     bigint not null default 0,
  add column if not exists referrer_bonus_points   bigint not null default 0,
  add column if not exists rank_labels             jsonb  not null default
    '{"INITIATE": "ASSOCIATE", "SOLDIER": "SOLDIER", "CAPO": "CAPOREGIME", "CONSIGLIERE": "DON"}'::jsonb;

do $cfg$
begin
  if not exists (select 1 from pg_constraint where conname = 'loyalty_rules_commission_range') then
    alter table public.loyalty_rules
      add constraint loyalty_rules_commission_range
      check (default_commission_bps between 0 and 10000);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'loyalty_rules_referral_window') then
    alter table public.loyalty_rules
      add constraint loyalty_rules_referral_window
      check (referral_window_days between 1 and 365);
  end if;
end;
$cfg$;

comment on column public.loyalty_rules.rank_labels is
  'member_rank -> the street name shown to members. The enum never changes; the badge wording is calibrated here.';
comment on column public.loyalty_rules.default_commission_bps is
  'Commission applied to new affiliate codes, in basis points. 500 = 5%.';

-- ---------------------------------------------------------------------
-- 6. JOHANNESBURG HUB SEED -- branches and the four delivery rings
-- ---------------------------------------------------------------------
insert into public.branches (
  name, slug, address_line, suburb, city, province, postal_code,
  latitude, longitude, phone, timezone, pickup_slot_minutes,
  opens_at, closes_at, delivery_enabled
)
values
  ('Rosebank Dispensary', 'rosebank-dispensary',
   'The Vault, Cradock Avenue', 'Rosebank', 'Johannesburg', 'Gauteng', '2196',
   -26.1467, 28.0436, '+27 10 000 0420', 'Africa/Johannesburg', 30,
   '09:00', '21:00', true),
  ('Sandton Vault Lounge', 'sandton-vault-lounge',
   'Lower Level, Maude Street', 'Sandton', 'Johannesburg', 'Gauteng', '2196',
   -26.1070, 28.0567, '+27 10 000 0421', 'Africa/Johannesburg', 30,
   '10:00', '22:00', true)
on conflict (slug) do nothing;

-- Radius rings, cheapest first. resolve_delivery_zone prefers an explicit
-- suburb polygon, then the lowest priority that contains the drop point, so
-- the 10 km ring always beats the 25 km ring for an address inside both.
insert into public.delivery_zones (
  branch_id, name, max_radius_km, fee_cents, min_order_cents, free_over_cents,
  eta_minutes, priority
)
select b.id, z.name, z.radius, z.fee, z.min_order, z.free_over, z.eta, z.priority
from public.branches b
cross join (values
  ('Zone 1 - Express Delivery',            10.00::numeric,   6000::bigint,  35000::bigint,  100000::bigint,   45, 100),
  ('Zone 2 - Gauteng Metro Courier',       25.00::numeric,  12000::bigint,  50000::bigint,  180000::bigint,   90, 200),
  ('Zone 3 - Extended Vault Courier',      50.00::numeric,  19500::bigint,  75000::bigint,    null::bigint,  180, 300),
  ('National Overnight Armoured Courier', 1200.00::numeric, 25000::bigint, 100000::bigint,    null::bigint, 1440, 400)
) as z(name, radius, fee, min_order, free_over, eta, priority)
where b.slug in ('rosebank-dispensary', 'sandton-vault-lounge')
on conflict (branch_id, name) do nothing;
