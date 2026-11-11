-- Members enter the Vault as soon as onboarding completes.
--
-- A new applicant stays PENDING_KYC, so they remain in the staff review queue,
-- but counts as active once their age is verified. Rejection records a
-- suspended_reason, which members cannot edit, and that removes access again.

create or replace function public.is_active_member(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.members m
    where m.id = p_user
      and m.age_verified_at is not null
      and (
        m.status in ('ACTIVE_MEMBER', 'VIP')
        or (m.status = 'PENDING_KYC' and m.suspended_reason is null)
      )
  );
$fn$;
