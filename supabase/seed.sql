-- ---------------------------------------------------------------------
-- 420 CARTEL :: LOCAL DEVELOPMENT SEED
--
-- !! LOCAL ONLY !!
--
-- This file creates auth users with known, hardcoded passwords so the staff
-- gate, the POS PIN and the role split can be exercised on a developer
-- machine. It runs automatically on `supabase start` and `supabase db reset`
-- against the local stack.
--
-- It must NEVER be run against a hosted project. `supabase db push` does not
-- send seed files, so the only way that happens is someone deliberately
-- running `supabase db reset --linked`. Don't.
--
-- Credentials live here, in the repo, on purpose: they are fixtures for a
-- throwaway local database, not secrets. Anything resembling a real
-- credential belongs in .env.local, which is gitignored.
-- ---------------------------------------------------------------------

-- Guard: refuse to run anywhere that does not look like the local stack.
do $$
begin
  if current_database() <> 'postgres'
     or current_setting('server_version_num')::int < 150000 then
    raise exception 'Seed aborted: unexpected database.';
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- Auth users
-- ---------------------------------------------------------------------
-- GoTrue normally owns this table. Inserting directly is the standard local
-- seeding approach; `crypt(..., gen_salt('bf'))` matches how GoTrue hashes.

insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-4111-8111-111111111111',
    'authenticated', 'authenticated', 'owner@420cartel.test',
    crypt('DevOwner!2026', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"display_name":"Dev Owner"}',
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-4222-8222-222222222222',
    'authenticated', 'authenticated', 'budtender@420cartel.test',
    crypt('DevBud!2026', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"display_name":"Dev Budtender"}',
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '33333333-3333-4333-8333-333333333333',
    'authenticated', 'authenticated', 'member@420cartel.test',
    crypt('DevMember!2026', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"display_name":"Dev Member"}',
    now(), now()
  )
on conflict (id) do nothing;

-- Identity rows, or password sign-in rejects the account.
insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at,
  created_at, updated_at
)
select
  gen_random_uuid(), u.id, u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.email in (
  'owner@420cartel.test',
  'budtender@420cartel.test',
  'member@420cartel.test'
)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Staff profiles
-- ---------------------------------------------------------------------
-- Two of the three users get a staff profile. The third does NOT — it exists
-- precisely so the "signed in but not staff" path can be tested, which is the
-- hole the lockdown was built to close.

insert into public.staff_profiles (id, branch_id, role, display_name, is_active)
values
  ('11111111-1111-4111-8111-111111111111', null, 'OWNER',     'Dev Owner',     true),
  ('22222222-2222-4222-8222-222222222222', null, 'BUDTENDER', 'Dev Budtender', true)
on conflict (id) do update
  set role = excluded.role,
      display_name = excluded.display_name,
      is_active = excluded.is_active;

-- Counter PINs. Written through crypt() directly rather than set_pos_pin(),
-- because that function resolves the operator from auth.uid() and there is no
-- session during seeding.
update public.staff_profiles
   set pos_pin_hash = crypt('4209', gen_salt('bf', 10))
 where id = '11111111-1111-4111-8111-111111111111';

update public.staff_profiles
   set pos_pin_hash = crypt('7781', gen_salt('bf', 10))
 where id = '22222222-2222-4222-8222-222222222222';
