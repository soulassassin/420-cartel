-- =====================================================================
-- 420 CARTEL :: ROW LEVEL SECURITY, COLUMN GUARDS, STORAGE, SEED
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. COLUMN GUARD: members may edit their own profile but never their
--    own status, balances, rank or verification flags.
-- ---------------------------------------------------------------------
create or replace function public.guard_member_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- Staff and SECURITY DEFINER routines (which run with no JWT claim for
  -- service-role calls) are allowed through untouched.
  if public.is_staff() or auth.uid() is null then
    return new;
  end if;

  new.status               := old.status;
  new.rank                 := old.rank;
  new.member_code          := old.member_code;
  new.lifetime_value_cents := old.lifetime_value_cents;
  new.order_count          := old.order_count;
  new.credit_balance_cents := old.credit_balance_cents;
  new.points_balance       := old.points_balance;
  new.age_verified_at      := old.age_verified_at;
  new.kyc_approved_at      := old.kyc_approved_at;
  new.kyc_approved_by      := old.kyc_approved_by;
  new.referral_code        := old.referral_code;
  new.suspended_reason     := old.suspended_reason;
  new.internal_notes       := old.internal_notes;
  new.date_of_birth        := old.date_of_birth;
  new.sa_id_number         := old.sa_id_number;
  new.passport_number      := old.passport_number;
  new.id_document_type     := old.id_document_type;

  return new;
end;
$fn$;

create trigger members_guard_privileged_columns
  before update on public.members
  for each row execute function public.guard_member_privileged_columns();

-- Orders are append-only for members: only staff may move status/pricing.
create or replace function public.guard_order_mutations()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if public.is_staff() or auth.uid() is null then
    return new;
  end if;

  -- A member may only cancel their own order while it is still unfulfilled,
  -- or append delivery instructions. Everything else is frozen.
  if new.status <> old.status and new.status <> 'CANCELLED' then
    raise exception 'CARTEL_FORBIDDEN: members cannot move an order to %', new.status
      using errcode = '42501';
  end if;

  if old.status not in ('DRAFT', 'AWAITING_PAYMENT') and new.status = 'CANCELLED' then
    raise exception 'CARTEL_TOO_LATE: % is already in preparation, contact the branch',
      old.order_number
      using errcode = '42501';
  end if;

  new.subtotal_cents     := old.subtotal_cents;
  new.discount_cents     := old.discount_cents;
  new.delivery_fee_cents := old.delivery_fee_cents;
  new.total_cents        := old.total_cents;
  new.cost_cents         := old.cost_cents;
  new.points_earned      := old.points_earned;
  new.points_redeemed    := old.points_redeemed;
  new.member_id          := old.member_id;
  new.branch_id          := old.branch_id;
  new.staff_id           := old.staff_id;
  new.paid_at            := old.paid_at;

  return new;
end;
$fn$;

create trigger orders_guard_mutations
  before update on public.orders
  for each row execute function public.guard_order_mutations();

-- ---------------------------------------------------------------------
-- 2. ENABLE RLS EVERYWHERE
-- ---------------------------------------------------------------------
alter table public.branches               enable row level security;
alter table public.staff_profiles         enable row level security;
alter table public.members                enable row level security;
alter table public.kyc_documents          enable row level security;
alter table public.products               enable row level security;
alter table public.product_variants       enable row level security;
alter table public.master_batches         enable row level security;
alter table public.stock_movements        enable row level security;
alter table public.delivery_zones         enable row level security;
alter table public.orders                 enable row level security;
alter table public.order_items            enable row level security;
alter table public.payments               enable row level security;
alter table public.member_credit_ledger   enable row level security;
alter table public.loyalty_rules          enable row level security;
alter table public.loyalty_ledger         enable row level security;
alter table public.affiliate_codes        enable row level security;
alter table public.affiliate_attributions enable row level security;
alter table public.product_media_jobs     enable row level security;
alter table public.audit_logs             enable row level security;

-- ---------------------------------------------------------------------
-- 3. BRANCHES & STAFF
-- ---------------------------------------------------------------------
create policy branches_public_read on public.branches
  for select using (is_active or public.is_staff());

create policy branches_manager_write on public.branches
  for all using (public.is_manager()) with check (public.is_manager());

create policy staff_read_self_and_colleagues on public.staff_profiles
  for select using (id = auth.uid() or public.is_staff());

create policy staff_manager_write on public.staff_profiles
  for all using (public.is_manager()) with check (public.is_manager());

-- ---------------------------------------------------------------------
-- 4. MEMBERS & KYC
-- ---------------------------------------------------------------------
create policy members_read_self on public.members
  for select using (id = auth.uid() or public.is_staff());

create policy members_insert_self on public.members
  for insert with check (id = auth.uid());

create policy members_update_self on public.members
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy members_staff_write on public.members
  for all using (public.is_staff()) with check (public.is_staff());

create policy kyc_read_self on public.kyc_documents
  for select using (member_id = auth.uid() or public.is_staff());

create policy kyc_insert_self on public.kyc_documents
  for insert with check (member_id = auth.uid());

-- Members may replace a rejected document; they may never mark one approved.
create policy kyc_update_self_pending on public.kyc_documents
  for update
  using (member_id = auth.uid() and review_status <> 'APPROVED')
  with check (member_id = auth.uid() and review_status = 'PENDING');

create policy kyc_staff_review on public.kyc_documents
  for all using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------
-- 5. CATALOGUE — public sees the story, members see the pricing
-- ---------------------------------------------------------------------
create policy products_public_read on public.products
  for select using (is_active or public.is_staff());

create policy products_manager_write on public.products
  for all using (public.is_manager()) with check (public.is_manager());

-- Pricing is gated: only verified members and staff resolve variants.
create policy variants_member_read on public.product_variants
  for select using (
    is_active and (public.is_active_member() or public.is_staff())
  );

create policy variants_manager_write on public.product_variants
  for all using (public.is_manager()) with check (public.is_manager());

-- ---------------------------------------------------------------------
-- 6. INVENTORY — staff only
-- ---------------------------------------------------------------------
create policy batches_staff_read on public.master_batches
  for select using (public.is_staff());

create policy batches_manager_write on public.master_batches
  for all using (public.is_manager()) with check (public.is_manager());

create policy movements_staff_read on public.stock_movements
  for select using (public.is_staff());

create policy movements_staff_insert on public.stock_movements
  for insert with check (public.is_staff());

-- ---------------------------------------------------------------------
-- 7. DELIVERY ZONES
-- ---------------------------------------------------------------------
create policy zones_public_read on public.delivery_zones
  for select using (is_active or public.is_staff());

create policy zones_manager_write on public.delivery_zones
  for all using (public.is_manager()) with check (public.is_manager());

-- ---------------------------------------------------------------------
-- 8. ORDERS
-- ---------------------------------------------------------------------
create policy orders_read_own_or_staff on public.orders
  for select using (
    member_id = auth.uid()
    or public.is_staff()
    or driver_id = auth.uid()
  );

create policy orders_member_insert on public.orders
  for insert with check (
    (member_id = auth.uid() and public.is_active_member()) or public.is_staff()
  );

create policy orders_update_own_or_staff on public.orders
  for update using (member_id = auth.uid() or public.is_staff())
  with check (member_id = auth.uid() or public.is_staff());

create policy order_items_read on public.order_items
  for select using (
    public.is_staff()
    or exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and o.member_id = auth.uid()
    )
  );

create policy order_items_staff_write on public.order_items
  for all using (public.is_staff()) with check (public.is_staff());

create policy payments_read on public.payments
  for select using (
    public.is_staff()
    or exists (
      select 1 from public.orders o
      where o.id = payments.order_id and o.member_id = auth.uid()
    )
  );

create policy payments_staff_write on public.payments
  for all using (public.is_staff()) with check (public.is_staff());

create policy credit_ledger_read on public.member_credit_ledger
  for select using (member_id = auth.uid() or public.is_staff());

-- ---------------------------------------------------------------------
-- 9. LOYALTY & AFFILIATE
-- ---------------------------------------------------------------------
create policy loyalty_rules_read on public.loyalty_rules
  for select using (is_active or public.is_staff());

create policy loyalty_rules_manager_write on public.loyalty_rules
  for all using (public.is_manager()) with check (public.is_manager());

create policy loyalty_ledger_read on public.loyalty_ledger
  for select using (member_id = auth.uid() or public.is_staff());

create policy affiliate_codes_read on public.affiliate_codes
  for select using (owner_member_id = auth.uid() or public.is_staff());

create policy affiliate_codes_manager_write on public.affiliate_codes
  for all using (public.is_manager()) with check (public.is_manager());

create policy affiliate_attr_read on public.affiliate_attributions
  for select using (
    public.is_staff()
    or exists (
      select 1 from public.affiliate_codes c
      where c.id = affiliate_attributions.affiliate_code_id
        and c.owner_member_id = auth.uid()
    )
  );

create policy affiliate_attr_manager_write on public.affiliate_attributions
  for all using (public.is_manager()) with check (public.is_manager());

-- ---------------------------------------------------------------------
-- 10. MEDIA JOBS & AUDIT
-- ---------------------------------------------------------------------
create policy media_jobs_staff_read on public.product_media_jobs
  for select using (public.is_staff());

create policy media_jobs_staff_write on public.product_media_jobs
  for all using (public.is_staff()) with check (public.is_staff());

create policy audit_logs_manager_read on public.audit_logs
  for select using (public.is_manager());

-- ---------------------------------------------------------------------
-- 11. GRANTS — execute rights on the business functions
-- ---------------------------------------------------------------------
revoke all on function public.process_cartel_order(jsonb) from public;
grant execute on function public.process_cartel_order(jsonb) to authenticated;

revoke all on function public.cancel_cartel_order(uuid, text, boolean) from public;
grant execute on function public.cancel_cartel_order(uuid, text, boolean) to authenticated;

revoke all on function public.submit_member_kyc(jsonb) from public;
grant execute on function public.submit_member_kyc(jsonb) to authenticated;

revoke all on function public.sign_membership_agreement(text, text) from public;
grant execute on function public.sign_membership_agreement(text, text) to authenticated;

revoke all on function public.review_member_kyc(uuid, boolean, text) from public;
grant execute on function public.review_member_kyc(uuid, boolean, text) to authenticated;

revoke all on function public.lookup_member_for_pos(text) from public;
grant execute on function public.lookup_member_for_pos(text) to authenticated;

revoke all on function public.rotate_member_qr_token() from public;
grant execute on function public.rotate_member_qr_token() to authenticated;

revoke all on function public.adjust_batch_stock(uuid, stock_movement_type, numeric, text, jsonb) from public;
grant execute on function public.adjust_batch_stock(uuid, stock_movement_type, numeric, text, jsonb) to authenticated;

revoke all on function public.adjust_member_credit(uuid, bigint, text) from public;
grant execute on function public.adjust_member_credit(uuid, bigint, text) to authenticated;

revoke all on function public.reserve_product_stock(uuid, uuid, numeric) from public;
grant execute on function public.reserve_product_stock(uuid, uuid, numeric) to authenticated;

revoke all on function public.release_product_reservation(jsonb) from public;
grant execute on function public.release_product_reservation(jsonb) to authenticated;

grant execute on function public.resolve_delivery_zone(uuid, double precision, double precision) to anon, authenticated;
grant execute on function public.sa_id_luhn_valid(text) to anon, authenticated;
grant execute on function public.sa_id_to_dob(text) to anon, authenticated;
grant execute on function public.is_of_legal_age(date) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 12. STORAGE BUCKETS
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('kyc-documents', 'kyc-documents', false, 15728640,
   array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']),
  ('member-passes', 'member-passes', false, 2097152,
   array['image/png', 'image/svg+xml', 'application/pdf']),
  ('product-media', 'product-media', true, 104857600,
   array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm']),
  ('lab-reports', 'lab-reports', true, 20971520,
   array['application/pdf', 'image/jpeg', 'image/png']),
  ('model-assets', 'model-assets', true, 52428800,
   array['model/gltf-binary', 'model/gltf+json', 'application/octet-stream', 'image/ktx2'])
on conflict (id) do nothing;

-- KYC: a member may only ever touch their own <uid>/ prefix, and may never read
-- back an approved document. Staff read all; only managers delete.
create policy kyc_bucket_member_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'kyc-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy kyc_bucket_member_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'kyc-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_staff()
    )
  );

create policy kyc_bucket_member_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'kyc-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'kyc-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy kyc_bucket_manager_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'kyc-documents' and public.is_manager());

create policy passes_bucket_read_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'member-passes'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_staff()
    )
  );

create policy passes_bucket_staff_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'member-passes' and public.is_staff());

create policy product_media_public_read on storage.objects
  for select using (bucket_id in ('product-media', 'lab-reports', 'model-assets'));

create policy product_media_staff_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('product-media', 'lab-reports', 'model-assets')
    and public.is_staff()
  );

create policy product_media_manager_modify on storage.objects
  for update to authenticated
  using (bucket_id in ('product-media', 'lab-reports', 'model-assets') and public.is_manager())
  with check (bucket_id in ('product-media', 'lab-reports', 'model-assets') and public.is_manager());

create policy product_media_manager_delete on storage.objects
  for delete to authenticated
  using (bucket_id in ('product-media', 'lab-reports', 'model-assets') and public.is_manager());

-- ---------------------------------------------------------------------
-- 13. REALTIME — live POS <-> online stock sync
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.master_batches;
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_items;
alter publication supabase_realtime add table public.product_media_jobs;

-- Realtime sends full rows on update, which RLS still filters per subscriber.
alter table public.master_batches replica identity full;
alter table public.orders replica identity full;

-- ---------------------------------------------------------------------
-- 14. SEED — default loyalty rules
-- ---------------------------------------------------------------------
insert into public.loyalty_rules (
  name, is_active, points_per_100_cents, point_value_cents, min_redeem_points
)
values ('CARTEL_DEFAULT', true, 1, 1, 100)
on conflict (name) do nothing;
