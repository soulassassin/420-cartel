-- =====================================================================
-- 420 CARTEL :: ENTERPRISE COLLECTIVE CRM SYSTEM
-- Member tags, staff interaction timeline, follow-up queue & QR rotation
-- =====================================================================

-- 1. Member segmentation tags
alter table public.members
  add column if not exists crm_tags text[] not null default '{}';

create index if not exists members_crm_tags_idx
  on public.members using gin (crm_tags);

-- 2. CRM interaction channels
do $$
begin
  if not exists (select 1 from pg_type where typname = 'crm_interaction_channel') then
    create type crm_interaction_channel as enum (
      'IN_STORE',
      'WHATSAPP',
      'PHONE',
      'EMAIL',
      'COMPLIANCE',
      'VIP_CONCIERGE'
    );
  end if;
end $$;

-- 3. Staff-to-member CRM touchpoint & follow-up timeline
create table if not exists public.crm_interactions (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references public.members (id) on delete cascade,
  branch_id      uuid references public.branches (id) on delete set null,
  staff_id       uuid references public.staff_profiles (id) on delete set null,
  channel        crm_interaction_channel not null default 'IN_STORE',
  summary        text not null,
  follow_up_at   timestamptz,
  follow_up_done boolean not null default false,
  created_at     timestamptz not null default now()
);

create index if not exists crm_interactions_member_idx
  on public.crm_interactions (member_id, created_at desc);

create index if not exists crm_interactions_open_followups_idx
  on public.crm_interactions (follow_up_at)
  where follow_up_done = false and follow_up_at is not null;

alter table public.crm_interactions enable row level security;

create policy crm_interactions_staff_all on public.crm_interactions
  for all using (public.is_staff()) with check (public.is_staff());

-- 4. Staff-initiated wallet QR pass rotation (for lost/shared passes at desk)
create or replace function public.staff_rotate_member_qr_token(p_member_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_token uuid;
begin
  if not public.is_staff() then
    raise exception 'CARTEL_FORBIDDEN: staff access required' using errcode = '42501';
  end if;

  update public.members
     set qr_token = gen_random_uuid(),
         updated_at = now()
   where id = p_member_id
   returning qr_token into v_token;

  if v_token is null then
    raise exception 'CARTEL_NOT_FOUND: member % not found', p_member_id using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, after_data)
  values (
    auth.uid(),
    public.staff_role_of(auth.uid())::text,
    'MEMBER_QR_ROTATED',
    'members',
    p_member_id,
    jsonb_build_object('qr_token', v_token::text)
  );

  return v_token::text;
end;
$fn$;

grant execute on function public.staff_rotate_member_qr_token(uuid) to authenticated;

