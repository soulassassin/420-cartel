import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowUpRight, Clock, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Badge, Card, EmptyState, Eyebrow, Stat } from '@/components/ui/surfaces';
import { formatCents } from '@/lib/money';
import { RANK_LABEL } from '@/lib/loyalty';
import { LEGAL_AGE, ageInYears } from '@/lib/sa-id';
import { createCartelServerClient, getViewer } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import type { MemberRow, MemberStatus } from '@/types/database';

export const metadata: Metadata = {
  title: 'Member CRM',
  robots: { index: false, follow: false },
};

const STATUS_TONE: Record<MemberStatus, 'live' | 'warn' | 'gold' | 'danger'> = {
  ACTIVE_MEMBER: 'live',
  PENDING_KYC: 'warn',
  VIP: 'gold',
  SUSPENDED: 'danger',
};

const FILTERS: { key: string; label: string; status: MemberStatus | null }[] = [
  { key: 'all', label: 'All', status: null },
  { key: 'pending', label: 'Pending KYC', status: 'PENDING_KYC' },
  { key: 'active', label: 'Active', status: 'ACTIVE_MEMBER' },
  { key: 'vip', label: 'VIP', status: 'VIP' },
  { key: 'suspended', label: 'Suspended', status: 'SUSPENDED' },
];

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const viewer = await getViewer();

  // Middleware already bounced signed-out visitors; this covers a signed-in
  // member who guessed the URL.
  if (!viewer.isStaff) redirect('/');

  const params = await searchParams;
  const search = params.q?.trim() ?? '';
  const activeFilter = FILTERS.find((entry) => entry.key === params.filter) ?? FILTERS[0]!;

  const supabase = await createCartelServerClient();

  let query = supabase
    .from('members')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (activeFilter.status) query = query.eq('status', activeFilter.status);
  if (search.length > 0) {
    // Never search on sa_id_number — reviewers should not be able to fish for
    // an ID number they do not already have.
    query = query.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,member_code.ilike.%${search}%`,
    );
  }

  const { data: memberRows } = await query;
  const members: MemberRow[] = memberRows ?? [];

  const { count: pendingCount } = await supabase
    .from('members')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'PENDING_KYC');

  const { count: totalCount } = await supabase
    .from('members')
    .select('id', { count: 'exact', head: true });

  return (
    <main className="content-layer mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-14">
      {/* ---- Header ------------------------------------------------------ */}
      <header className="flex flex-col gap-5">
        <Eyebrow>Compliance Desk</Eyebrow>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h1 className="display-md">Member CRM</h1>
          <div className="flex gap-8">
            <Stat label="Members" value={totalCount ?? 0} />
            <Stat
              label="Awaiting Review"
              value={pendingCount ?? 0}
              tone={pendingCount && pendingCount > 0 ? 'gold' : 'muted'}
            />
          </div>
        </div>
      </header>

      {/* ---- Controls ---------------------------------------------------- */}
      <div className="flex flex-col gap-4">
        <form action="/admin/crm" className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input
            name="q"
            defaultValue={search}
            placeholder="Name, email, phone or member code"
            className="pl-11"
            aria-label="Search members"
          />
          {params.filter ? <input type="hidden" name="filter" value={params.filter} /> : null}
        </form>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((filter) => {
            const href =
              filter.key === 'all'
                ? `/admin/crm${search ? `?q=${encodeURIComponent(search)}` : ''}`
                : `/admin/crm?filter=${filter.key}${search ? `&q=${encodeURIComponent(search)}` : ''}`;
            return (
              <Button
                key={filter.key}
                asChild
                variant={filter.key === activeFilter.key ? 'active' : 'outline'}
                size="sm"
              >
                <Link href={href}>{filter.label}</Link>
              </Button>
            );
          })}
        </div>
      </div>

      {/* ---- Results ----------------------------------------------------- */}
      {members.length === 0 ? (
        <EmptyState
          title="No members found"
          description={
            search
              ? `Nothing matches "${search}". Try a member code or phone number.`
              : 'No members in this state yet.'
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {members.map((member) => {
            const age = ageInYears(new Date(`${member.date_of_birth}T00:00:00Z`));
            return (
              <Card key={member.id} interactive className="p-0">
                <Link
                  href={`/admin/crm/${member.id}`}
                  className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  {/* Identity */}
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-base uppercase tracking-[0.1em]">
                        {member.first_name} {member.last_name}
                      </span>
                      <Badge tone={STATUS_TONE[member.status]}>
                        {member.status.replace('_', ' ')}
                      </Badge>
                      {member.age_verified_at === null ? (
                        <Badge tone="danger">Age Unverified</Badge>
                      ) : null}
                      {member.agreement_signed_at === null ? (
                        <Badge tone="warn">Unsigned</Badge>
                      ) : null}
                    </div>
                    <span className="truncate font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground">
                      {member.member_code} · {member.phone} · {member.email}
                    </span>
                  </div>

                  {/* Standing */}
                  <div className="flex shrink-0 items-end gap-6">
                    <Stat
                      label="Age"
                      value={age}
                      unit="yrs"
                      tone={age < LEGAL_AGE ? 'gold' : 'muted'}
                    />
                    <Stat label="Rank" value={RANK_LABEL[member.rank]} tone="muted" />
                    <Stat label="LTV" value={formatCents(member.lifetime_value_cents)} />
                    <ArrowUpRight
                      className={cn('size-4 shrink-0 text-faint transition-colors')}
                      aria-hidden="true"
                    />
                  </div>
                </Link>
              </Card>
            );
          })}
        </div>
      )}

      {members.length === 100 ? (
        <p className="flex items-center gap-2 font-mono text-[0.5625rem] uppercase tracking-[0.2em] text-faint">
          <Clock className="size-3" />
          Showing the 100 most recent — narrow with search
        </p>
      ) : null}

      {!viewer.isManager ? (
        <p className="flex items-center gap-2 border-l-2 border-amber-500 bg-amber-500/5 px-4 py-3 text-xs text-amber-200">
          <Users className="size-3.5 shrink-0" />
          You have read access. Approving KYC, adjusting credit and changing status require
          owner or manager rights.
        </p>
      ) : null}
    </main>
  );
}
