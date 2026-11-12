-- =====================================================================
-- 420 CARTEL :: CORE SCHEMA
-- Multi-unit (g / ml / ea) inventory, private-club CRM, POS + online orders
-- =====================================================================

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "citext";

-- ---------------------------------------------------------------------
-- 1. ENUMS
-- ---------------------------------------------------------------------
create type base_uom as enum ('GRAMS', 'MILLILITERS', 'UNITS');

create type member_status as enum ('PENDING_KYC', 'ACTIVE_MEMBER', 'VIP', 'SUSPENDED');

create type member_rank as enum ('INITIATE', 'SOLDIER', 'CAPO', 'CONSIGLIERE');

create type id_document_type as enum ('SA_ID', 'PASSPORT');

create type kyc_document_type as enum (
  'ID_FRONT', 'ID_BACK', 'PASSPORT_PAGE', 'LIVE_SELFIE', 'PROOF_OF_ADDRESS', 'SIGNED_AGREEMENT'
);

create type kyc_review_status as enum ('PENDING', 'APPROVED', 'REJECTED');

create type product_category as enum (
  'FLOWER', 'HASH_EXTRACT', 'ELIXIR_OIL', 'DISTILLATE', 'PRE_ROLL',
  'EDIBLE', 'VAPE', 'MERCH', 'ACCESSORY'
);

create type strain_type as enum ('INDICA', 'SATIVA', 'HYBRID', 'CBD', 'NOT_APPLICABLE');

create type staff_role as enum ('OWNER', 'MANAGER', 'BUDTENDER', 'DRIVER');

create type order_channel as enum ('POS', 'ONLINE');

create type fulfilment_type as enum ('IN_STORE', 'PICKUP', 'DELIVERY');

create type order_status as enum (
  'DRAFT', 'AWAITING_PAYMENT', 'PAID', 'PREPARING', 'READY',
  'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED', 'REFUNDED'
);

create type payment_method as enum (
  'CASH', 'CARD_TERMINAL', 'EFT_INSTANT', 'MANUAL_EFT',
  'MEMBER_CREDIT', 'PAY_ON_COLLECTION', 'FUTURE_GATEWAY'
);

create type payment_status as enum ('PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED');

create type stock_movement_type as enum (
  'INTAKE', 'SALE', 'RETURN', 'WASTE', 'SPILLAGE', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN'
);

create type media_job_status as enum ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- ---------------------------------------------------------------------
-- 2. SOUTH AFRICAN ID VALIDATION (Luhn + DOB + metadata)
-- ---------------------------------------------------------------------

-- Luhn (mod 10) checksum over the 13-digit SA ID number.
create or replace function public.sa_id_luhn_valid(p_id text)
returns boolean
language plpgsql
immutable
as $fn$
declare
  v_clean text;
  v_sum   int := 0;
  v_digit int;
  v_pos   int;
  v_len   int;
begin
  v_clean := regexp_replace(coalesce(p_id, ''), '[^0-9]', '', 'g');
  if length(v_clean) <> 13 then
    return false;
  end if;

  v_len := length(v_clean);
  -- Walk right-to-left, doubling every second digit.
  for v_pos in 1 .. v_len loop
    v_digit := substr(v_clean, v_len - v_pos + 1, 1)::int;
    if v_pos % 2 = 0 then
      v_digit := v_digit * 2;
      if v_digit > 9 then
        v_digit := v_digit - 9;
      end if;
    end if;
    v_sum := v_sum + v_digit;
  end loop;

  return v_sum % 10 = 0;
end;
$fn$;

comment on function public.sa_id_luhn_valid is
  'Luhn (mod 10) checksum validation for a 13-digit South African ID number.';

-- Date of birth from the YYMMDD prefix. Pivots on the current year so a
-- two-digit year that would place the person in the future reads as 19YY.
create or replace function public.sa_id_to_dob(p_id text)
returns date
language plpgsql
immutable
as $fn$
declare
  v_clean text;
  v_yy    int;
  v_mm    int;
  v_dd    int;
  v_year  int;
  v_pivot int;
begin
  v_clean := regexp_replace(coalesce(p_id, ''), '[^0-9]', '', 'g');
  if length(v_clean) <> 13 then
    return null;
  end if;

  v_yy := substr(v_clean, 1, 2)::int;
  v_mm := substr(v_clean, 3, 2)::int;
  v_dd := substr(v_clean, 5, 2)::int;

  if v_mm < 1 or v_mm > 12 or v_dd < 1 or v_dd > 31 then
    return null;
  end if;

  v_pivot := extract(year from current_date)::int % 100;
  v_year := case when v_yy <= v_pivot then 2000 + v_yy else 1900 + v_yy end;

  -- Reject impossible calendar dates (e.g. 31 February) rather than raising.
  begin
    return make_date(v_year, v_mm, v_dd);
  exception
    when others then
      return null;
  end;
end;
$fn$;

comment on function public.sa_id_to_dob is
  'Extracts date of birth from the YYMMDD prefix of a 13-digit SA ID number.';

-- Citizenship digit (position 11): 0 = SA citizen, 1 = permanent resident.
create or replace function public.sa_id_citizenship(p_id text)
returns text
language sql
immutable
as $fn$
  select case
    when length(regexp_replace(coalesce(p_id, ''), '[^0-9]', '', 'g')) <> 13 then null
    when substr(regexp_replace(p_id, '[^0-9]', '', 'g'), 11, 1) = '0' then 'SA_CITIZEN'
    when substr(regexp_replace(p_id, '[^0-9]', '', 'g'), 11, 1) = '1' then 'PERMANENT_RESIDENT'
    else null
  end;
$fn$;

-- Gender block (positions 7-10): 0000-4999 female, 5000-9999 male.
create or replace function public.sa_id_gender(p_id text)
returns text
language sql
immutable
as $fn$
  select case
    when length(regexp_replace(coalesce(p_id, ''), '[^0-9]', '', 'g')) <> 13 then null
    when substr(regexp_replace(p_id, '[^0-9]', '', 'g'), 7, 4)::int < 5000 then 'FEMALE'
    else 'MALE'
  end;
$fn$;

create or replace function public.age_years(p_dob date)
returns int
language sql
immutable
as $fn$
  select case
    when p_dob is null then null
    else extract(year from age(current_date, p_dob))::int
  end;
$fn$;

create or replace function public.is_of_legal_age(p_dob date)
returns boolean
language sql
immutable
as $fn$
  select coalesce(public.age_years(p_dob) >= 18, false);
$fn$;

-- ---------------------------------------------------------------------
-- 3. BRANCHES & STAFF
-- ---------------------------------------------------------------------
create table public.branches (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  slug                citext not null unique,
  address_line        text not null,
  suburb              text,
  city                text,
  province            text,
  postal_code         text,
  latitude            double precision not null,
  longitude           double precision not null,
  phone               text,
  is_active           boolean not null default true,
  timezone            text not null default 'Africa/Johannesburg',
  pickup_slot_minutes int not null default 30 check (pickup_slot_minutes between 5 and 240),
  opens_at            time not null default '09:00',
  closes_at           time not null default '20:00',
  delivery_enabled    boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.staff_profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  branch_id     uuid references public.branches (id) on delete set null,
  role          staff_role not null default 'BUDTENDER',
  display_name  text not null,
  pos_pin_hash  text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index staff_profiles_branch_idx on public.staff_profiles (branch_id) where is_active;

-- Security-definer helpers used inside RLS predicates. They must not be
-- RLS-filtered themselves, hence security definer with a pinned search_path.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.staff_profiles s
    where s.id = auth.uid() and s.is_active
  );
$fn$;

create or replace function public.staff_role_of(p_user uuid default auth.uid())
returns staff_role
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select s.role from public.staff_profiles s
  where s.id = p_user and s.is_active;
$fn$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select public.staff_role_of() in ('OWNER', 'MANAGER');
$fn$;

create or replace function public.staff_branch()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select s.branch_id from public.staff_profiles s
  where s.id = auth.uid() and s.is_active;
$fn$;

-- ---------------------------------------------------------------------
-- 4. MEMBERS (CRM)
-- ---------------------------------------------------------------------
create sequence public.member_code_seq start 1001;

create or replace function public.next_member_code()
returns text
language sql
volatile
as $fn$
  select 'CARTEL-' || lpad(nextval('public.member_code_seq')::text, 6, '0');
$fn$;

create table public.members (
  id                       uuid primary key references auth.users (id) on delete cascade,
  member_code              text not null unique default public.next_member_code(),
  qr_token                 uuid not null unique default gen_random_uuid(),
  status                   member_status not null default 'PENDING_KYC',
  rank                     member_rank not null default 'INITIATE',

  first_name               text not null,
  last_name                text not null,
  email                    citext not null,
  phone                    text not null,

  id_document_type         id_document_type not null,
  sa_id_number             text,
  passport_number          text,
  passport_country         text,
  date_of_birth            date not null,
  nationality              text,
  gender                   text,

  age_verified_at          timestamptz,
  kyc_submitted_at         timestamptz,
  kyc_approved_at          timestamptz,
  kyc_approved_by          uuid references public.staff_profiles (id) on delete set null,
  agreement_signed_at      timestamptz,
  agreement_version        text,
  agreement_signature_path text,

  preferred_uom            base_uom not null default 'GRAMS',
  marketing_opt_in         boolean not null default false,
  home_branch_id           uuid references public.branches (id) on delete set null,

  lifetime_value_cents     bigint not null default 0 check (lifetime_value_cents >= 0),
  order_count              int not null default 0 check (order_count >= 0),
  credit_balance_cents     bigint not null default 0 check (credit_balance_cents >= 0),
  points_balance           bigint not null default 0 check (points_balance >= 0),

  referral_code            text not null unique
                             default 'CARTEL-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6)),
  referred_by_code         text,

  suspended_reason         text,
  internal_notes           text,
  last_seen_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint members_legal_age check (public.is_of_legal_age(date_of_birth)),
  constraint members_sa_id_shape check (
    id_document_type <> 'SA_ID'
    or (sa_id_number is not null and public.sa_id_luhn_valid(sa_id_number))
  ),
  constraint members_sa_id_dob_match check (
    id_document_type <> 'SA_ID'
    or public.sa_id_to_dob(sa_id_number) = date_of_birth
  ),
  constraint members_passport_shape check (
    id_document_type <> 'PASSPORT'
    or (passport_number is not null and passport_country is not null)
  )
);

create unique index members_sa_id_unique on public.members (sa_id_number)
  where sa_id_number is not null;
create unique index members_passport_unique on public.members (passport_country, passport_number)
  where passport_number is not null;
create index members_status_idx on public.members (status);
create index members_phone_idx on public.members (phone);
create index members_email_idx on public.members (email);
create index members_referred_by_idx on public.members (referred_by_code)
  where referred_by_code is not null;

comment on column public.members.qr_token is
  'Opaque token encoded into the Black and Gold wallet pass QR. Rotatable without changing member_code.';

create table public.kyc_documents (
  id               uuid primary key default gen_random_uuid(),
  member_id        uuid not null references public.members (id) on delete cascade,
  doc_type         kyc_document_type not null,
  storage_path     text not null,
  mime_type        text,
  byte_size        bigint,
  review_status    kyc_review_status not null default 'PENDING',
  reviewed_by      uuid references public.staff_profiles (id) on delete set null,
  reviewed_at      timestamptz,
  rejection_reason text,
  created_at       timestamptz not null default now(),
  unique (member_id, doc_type)
);

create index kyc_documents_member_idx on public.kyc_documents (member_id);
create index kyc_documents_pending_idx on public.kyc_documents (review_status)
  where review_status = 'PENDING';

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
      and m.status in ('ACTIVE_MEMBER', 'VIP')
      and m.age_verified_at is not null
  );
$fn$;
