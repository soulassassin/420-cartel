-- =====================================================================
-- 420 CARTEL :: the three trading branches
--
-- The storefront seed created two placeholder branches (Rosebank, Sandton).
-- The collective actually trades from Norwood, Rivonia and Kibler Park, as
-- listed on the website. The placeholders are converted in place so their
-- delivery rings carry over, and Kibler Park is added with the same rings.
--
-- Coordinates are approximate street-level positions; correct them from
-- the Google Business listings if delivery distances look off.
-- =====================================================================

update public.branches
   set name = 'Norwood',
       slug = 'norwood',
       address_line = '62 Grant Ave',
       suburb = 'Norwood',
       city = 'Johannesburg',
       province = 'Gauteng',
       postal_code = '2192',
       latitude = -26.1585,
       longitude = 28.0760,
       phone = '072 333 0854',
       opens_at = '09:00',
       closes_at = '20:00',
       updated_at = now()
 where slug = 'rosebank-dispensary';

update public.branches
   set name = 'Rivonia',
       slug = 'rivonia',
       address_line = '353 Rivonia Blvd, Edenburg',
       suburb = 'Rivonia',
       city = 'Sandton',
       province = 'Gauteng',
       postal_code = '2128',
       latitude = -26.0560,
       longitude = 28.0600,
       phone = '067 755 1674',
       opens_at = '09:00',
       closes_at = '20:00',
       updated_at = now()
 where slug = 'sandton-vault-lounge';

insert into public.branches (
  name, slug, address_line, suburb, city, province, postal_code,
  latitude, longitude, phone, timezone, pickup_slot_minutes,
  opens_at, closes_at, delivery_enabled
)
values
  ('Kibler Park', 'kibler-park',
   'Shop 9, 14 Stanmore Cres', 'Kibler Park', 'Johannesburg', 'Gauteng', '2091',
   -26.3170, 27.9880, '082 886 7014', 'Africa/Johannesburg', 30,
   '09:00', '20:00', true)
on conflict (slug) do nothing;

-- Kibler Park gets the same delivery rings as Norwood.
insert into public.delivery_zones (
  branch_id, name, max_radius_km, fee_cents, min_order_cents, free_over_cents,
  eta_minutes, priority
)
select k.id, z.name, z.max_radius_km, z.fee_cents, z.min_order_cents,
       z.free_over_cents, z.eta_minutes, z.priority
  from public.branches k
  join public.branches n on n.slug = 'norwood'
  join public.delivery_zones z on z.branch_id = n.id
 where k.slug = 'kibler-park'
on conflict (branch_id, name) do nothing;

-- The affiliate commission ledger was readable by any signed-in member.
-- Only staff may read it.
drop policy if exists "Staff view commission ledger" on public.affiliate_commission_ledger;
create policy "Staff view commission ledger"
  on public.affiliate_commission_ledger
  for select
  using (public.is_staff());
