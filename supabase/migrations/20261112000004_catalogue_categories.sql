-- =====================================================================
-- 420 CARTEL :: managed catalogue categories
--
-- `products.category` (the enum) stays as the product TYPE: it drives the
-- unit of measure and the loyalty multipliers and never changes at runtime.
--
-- `catalogue_categories` is the list managers edit from the inventory
-- screen: flower grades such as Greenhouse, Indoor and Hydro, or any other
-- shelf grouping. A product points at one through `products.category_id`.
-- Removing a category leaves its products in place, uncategorised.
-- =====================================================================

create table if not exists public.catalogue_categories (
  id            uuid primary key default gen_random_uuid(),
  name          citext not null unique,
  product_type  product_category not null default 'FLOWER',
  sort_order    int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

comment on table public.catalogue_categories is
  'Manager-editable shelf categories (e.g. flower grades). Distinct from the fixed products.category type enum.';

alter table public.products
  add column if not exists category_id uuid
    references public.catalogue_categories (id) on delete set null;

create index if not exists products_category_id_idx on public.products (category_id);

alter table public.catalogue_categories enable row level security;

drop policy if exists catalogue_categories_public_read on public.catalogue_categories;
create policy catalogue_categories_public_read on public.catalogue_categories
  for select using (is_active or public.is_staff());

drop policy if exists catalogue_categories_manager_write on public.catalogue_categories;
create policy catalogue_categories_manager_write on public.catalogue_categories
  for all using (public.is_manager()) with check (public.is_manager());

grant select on public.catalogue_categories to anon, authenticated;
grant insert, update, delete on public.catalogue_categories to authenticated;

insert into public.catalogue_categories (name, product_type, sort_order)
values
  ('Greenhouse', 'FLOWER', 1),
  ('Indoor',     'FLOWER', 2),
  ('Hydro',      'FLOWER', 3)
on conflict (name) do nothing;

-- The POS and the shop refetch when the catalogue changes, so a product or
-- category added in the back office appears on the tills without a reload.
do $$
begin
  alter publication supabase_realtime add table public.products;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.product_variants;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.catalogue_categories;
exception when duplicate_object then null;
end $$;
