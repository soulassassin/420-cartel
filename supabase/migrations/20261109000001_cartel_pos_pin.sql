-- ---------------------------------------------------------------------
-- 420 CARTEL :: POS counter PIN
--
-- `staff_profiles.pos_pin_hash` has existed since the core migration but
-- nothing ever read or wrote it. These three functions close that gap.
--
-- The PIN is a SECOND factor at the counter, not a login. A budtender signs
-- in once with email + password (Supabase auth, the real identity boundary);
-- the PIN then re-confirms who is physically standing at a terminal that may
-- stay signed in all shift. It is deliberately short, so it is only ever
-- meaningful on top of an authenticated staff session — every function below
-- resolves the operator from auth.uid() and never from an argument.
-- ---------------------------------------------------------------------

-- `crypt` and `gen_salt` live in the `extensions` schema on Supabase, so the
-- pinned search_path has to include it or these bodies fail to resolve.

create or replace function public.verify_pos_pin(p_pin text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $fn$
  select exists (
    select 1
    from public.staff_profiles s
    where s.id = auth.uid()
      and s.is_active
      and s.pos_pin_hash is not null
      and s.pos_pin_hash = crypt(p_pin, s.pos_pin_hash)
  );
$fn$;

comment on function public.verify_pos_pin(text) is
  'True when the PIN matches the calling staff member''s stored hash. Resolves the operator from auth.uid(); never trusts a caller-supplied id.';

-- Lets the terminal decide between "ask for a PIN" and "no PIN configured
-- yet, send them to set one" without leaking whether a guess was close.
create or replace function public.has_pos_pin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
    from public.staff_profiles s
    where s.id = auth.uid()
      and s.is_active
      and s.pos_pin_hash is not null
  );
$fn$;

create or replace function public.set_pos_pin(p_staff_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
begin
  if not public.is_staff() then
    raise exception 'CARTEL_FORBIDDEN: Active staff credentials are required.';
  end if;

  -- An operator may rotate their own PIN; only a manager may set anyone else's.
  if p_staff_id <> auth.uid() and not public.is_manager() then
    raise exception 'CARTEL_FORBIDDEN: Only an owner or manager may set another operator''s PIN.';
  end if;

  if p_pin !~ '^[0-9]{4,8}$' then
    raise exception 'CARTEL_INVALID_PIN: The counter PIN must be 4 to 8 digits.';
  end if;

  -- Reject the handful of PINs that are guessed first in any real attack.
  if p_pin in ('0000', '1111', '1234', '4321', '2580', '1212', '0420') then
    raise exception 'CARTEL_INVALID_PIN: That PIN is too common. Choose another.';
  end if;

  update public.staff_profiles
     set pos_pin_hash = crypt(p_pin, gen_salt('bf', 10)),
         updated_at   = now()
   where id = p_staff_id
     and is_active;

  if not found then
    raise exception 'CARTEL_NOT_FOUND: No active staff profile for that id.';
  end if;
end;
$fn$;

revoke all on function public.verify_pos_pin(text) from public, anon;
revoke all on function public.has_pos_pin() from public, anon;
revoke all on function public.set_pos_pin(uuid, text) from public, anon;

grant execute on function public.verify_pos_pin(text) to authenticated;
grant execute on function public.has_pos_pin() to authenticated;
grant execute on function public.set_pos_pin(uuid, text) to authenticated;
