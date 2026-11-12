'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  BellRing,
  Building2,
  CheckCircle2,
  Download,
  Filter,
  Loader2,
  Plus,
  ScanLine,
  Search,
  Sparkles,
  Tag,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { Badge, Card, EmptyState, Eyebrow, Separator, Stat } from '@/components/ui/surfaces';
import {
  createMember,
  listBranches,
  listCrmInteractions,
  listMembers,
  subscribeToData,
  toggleCrmFollowUp,
} from '@/lib/data/source';
import { useCartelQuery } from '@/lib/data/useCartelQuery';
import { DEFAULT_BRANCH_ID } from '@/lib/demo/fixtures';
import { RANK_LABEL } from '@/lib/loyalty';
import { formatCents } from '@/lib/money';
import { LEGAL_AGE, ageInYears, maskSaId, parseSaId } from '@/lib/sa-id';
import { cn } from '@/lib/utils';
import type {
  BaseUom,
  IdDocumentType,
  MemberRank,
  MemberRow,
  MemberStatus,
} from '@/types/database';

type CrmTab = 'DIRECTORY' | 'FOLLOW_UPS';
type SmartSegment =
  | 'ALL'
  | 'HIGH_LTV'
  | 'MARKETING_OPT_IN'
  | 'AFFILIATE_REFERRERS'
  | 'OPEN_FOLLOW_UPS'
  | 'UNSIGNED_AGREEMENT';
type SortMode = 'RECENT' | 'LTV_DESC' | 'ORDERS_DESC' | 'POINTS_DESC' | 'CREDIT_DESC';

const STATUS_TONE: Record<MemberStatus, 'live' | 'warn' | 'gold' | 'danger'> = {
  ACTIVE_MEMBER: 'live',
  PENDING_KYC: 'warn',
  VIP: 'gold',
  SUSPENDED: 'danger',
};

const STATUS_FILTERS: { key: 'ALL' | MemberStatus; label: string }[] = [
  { key: 'ALL', label: 'All Members' },
  { key: 'PENDING_KYC', label: 'Pending KYC' },
  { key: 'ACTIVE_MEMBER', label: 'Active' },
  { key: 'VIP', label: 'VIP' },
  { key: 'SUSPENDED', label: 'Suspended' },
];

const RANK_FILTERS: ('ALL' | MemberRank)[] = ['ALL', 'INITIATE', 'SOLDIER', 'CAPO', 'CONSIGLIERE'];

const PRESET_TAGS = [
  'VIP_CONCIERGE',
  'SOLVENTLESS_FAN',
  'FLOWER_CONNOISSEUR',
  'EDIBLE_PREF',
  'ELIXIR_PREF',
  'DELIVERY_PREF',
  'BRAND_AMBASSADOR',
];

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function CrmDirectoryView() {
  const membersQuery = useCartelQuery(() => listMembers(), []);
  const branchesQuery = useCartelQuery(() => listBranches(), []);
  const interactionsQuery = useCartelQuery(() => listCrmInteractions(), []);

  useEffect(() => {
    return subscribeToData(() => {
      membersQuery.refresh();
      interactionsQuery.refresh();
    });
  }, [membersQuery, interactionsQuery]);

  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
  const branches = useMemo(() => branchesQuery.data ?? [], [branchesQuery.data]);
  const interactions = useMemo(() => interactionsQuery.data ?? [], [interactionsQuery.data]);

  const branchNameById = useMemo(
    () => new Map(branches.map((b) => [b.id, b.name])),
    [branches],
  );
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  // Filters & view state
  const [tab, setTab] = useState<CrmTab>('DIRECTORY');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | MemberStatus>('ALL');
  const [branchFilter, setBranchFilter] = useState<string>('ALL');
  const [rankFilter, setRankFilter] = useState<'ALL' | MemberRank>('ALL');
  const [segmentFilter, setSegmentFilter] = useState<SmartSegment>('ALL');
  const [sortBy, setSortBy] = useState<SortMode>('RECENT');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Onboard Member modal state
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [docType, setDocType] = useState<IdDocumentType>('SA_ID');
  const [saIdNumber, setSaIdNumber] = useState('');
  const [passportNumber, setPassportNumber] = useState('');
  const [passportCountry, setPassportCountry] = useState('');
  const [passportDob, setPassportDob] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [homeBranchId, setHomeBranchId] = useState<string>(DEFAULT_BRANCH_ID);
  const [preferredUom, setPreferredUom] = useState<BaseUom>('GRAMS');
  const [marketingOptIn, setMarketingOptIn] = useState(true);
  const [referredByCode, setReferredByCode] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>(['VIP_CONCIERGE']);
  const [internalNotes, setInternalNotes] = useState('');
  const [autoApprove, setAutoApprove] = useState(true);
  const [creating, setCreating] = useState(false);

  const openFollowUps = useMemo(
    () =>
      interactions
        .filter((item) => Boolean(item.follow_up_at) && !item.follow_up_done)
        .sort((a, b) => (a.follow_up_at ?? '').localeCompare(b.follow_up_at ?? '')),
    [interactions],
  );

  const openFollowUpCountByMember = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of openFollowUps) {
      counts.set(item.member_id, (counts.get(item.member_id) ?? 0) + 1);
    }
    return counts;
  }, [openFollowUps]);

  const referredCountByCode = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of members) {
      if (m.referred_by_code) {
        counts.set(m.referred_by_code, (counts.get(m.referred_by_code) ?? 0) + 1);
      }
    }
    return counts;
  }, [members]);

  const kpis = useMemo(() => {
    const pendingKyc = members.filter((m) => m.status === 'PENDING_KYC').length;
    const vipCount = members.filter((m) => m.status === 'VIP').length;
    const activeCount = members.filter((m) => m.status === 'ACTIVE_MEMBER' || m.status === 'VIP').length;
    const totalLtvCents = members.reduce((sum, m) => sum + m.lifetime_value_cents, 0);
    const totalCreditCents = members.reduce((sum, m) => sum + m.credit_balance_cents, 0);
    return {
      total: members.length,
      pendingKyc,
      vipCount,
      activeCount,
      totalLtvCents,
      totalCreditCents,
      openFollowUps: openFollowUps.length,
    };
  }, [members, openFollowUps]);

  const filteredMembers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const list = members.filter((member) => {
      if (statusFilter !== 'ALL' && member.status !== statusFilter) return false;
      if (branchFilter !== 'ALL' && member.home_branch_id !== branchFilter) return false;
      if (rankFilter !== 'ALL' && member.rank !== rankFilter) return false;

      if (segmentFilter === 'HIGH_LTV' && member.lifetime_value_cents < 500_000) return false;
      if (segmentFilter === 'MARKETING_OPT_IN' && !member.marketing_opt_in) return false;
      if (
        segmentFilter === 'AFFILIATE_REFERRERS' &&
        (referredCountByCode.get(member.referral_code) ?? 0) === 0
      ) {
        return false;
      }
      if (
        segmentFilter === 'OPEN_FOLLOW_UPS' &&
        (openFollowUpCountByMember.get(member.id) ?? 0) === 0
      ) {
        return false;
      }
      if (segmentFilter === 'UNSIGNED_AGREEMENT' && member.agreement_signed_at !== null) {
        return false;
      }

      if (!needle) return true;
      // Never search raw SA ID numbers in the directory to prevent ID fishing.
      const fullName = `${member.first_name} ${member.last_name}`.toLowerCase();
      const tagMatch = (member.crm_tags ?? []).some((t) => t.toLowerCase().includes(needle));
      return (
        fullName.includes(needle) ||
        member.member_code.toLowerCase().includes(needle) ||
        member.email.toLowerCase().includes(needle) ||
        member.phone.toLowerCase().includes(needle) ||
        member.referral_code.toLowerCase().includes(needle) ||
        tagMatch
      );
    });

    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sortBy === 'LTV_DESC') return b.lifetime_value_cents - a.lifetime_value_cents;
      if (sortBy === 'ORDERS_DESC') return b.order_count - a.order_count;
      if (sortBy === 'POINTS_DESC') return b.points_balance - a.points_balance;
      if (sortBy === 'CREDIT_DESC') return b.credit_balance_cents - a.credit_balance_cents;
      return b.created_at.localeCompare(a.created_at);
    });
    return sorted;
  }, [
    members,
    search,
    statusFilter,
    branchFilter,
    rankFilter,
    segmentFilter,
    sortBy,
    referredCountByCode,
    openFollowUpCountByMember,
  ]);

  const parsedSaId = useMemo(() => {
    if (docType !== 'SA_ID') return null;
    const digits = saIdNumber.replace(/\D/g, '');
    if (digits.length === 0) return null;
    return parseSaId(digits);
  }, [docType, saIdNumber]);

  const handleToggleFollowUp = useCallback(
    async (interactionId: string, done: boolean) => {
      setError(null);
      try {
        await toggleCrmFollowUp(interactionId, done);
        setNotice(done ? 'Follow-up marked complete.' : 'Follow-up reopened.');
        interactionsQuery.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not update follow-up.');
      }
    },
    [interactionsQuery],
  );

  const handleExportCsv = useCallback(() => {
    const header = [
      'Member Code',
      'First Name',
      'Last Name',
      'Status',
      'Rank',
      'Home Branch',
      'Email',
      'Phone',
      'Masked ID',
      'Preferred UOM',
      'Marketing Opt-In',
      'Orders',
      'LTV (ZAR)',
      'Points',
      'Store Credit (ZAR)',
      'Referral Code',
      'CRM Tags',
    ];
    const rows = filteredMembers.map((m) => [
      m.member_code,
      m.first_name,
      m.last_name,
      m.status,
      RANK_LABEL[m.rank],
      branchNameById.get(m.home_branch_id ?? '') ?? 'Unassigned',
      m.email,
      m.phone,
      m.id_document_type === 'SA_ID'
        ? maskSaId(m.sa_id_number ?? '')
        : `${m.passport_country ?? ''} ${m.passport_number ?? ''}`.trim(),
      m.preferred_uom,
      m.marketing_opt_in ? 'YES' : 'NO',
      String(m.order_count),
      (m.lifetime_value_cents / 100).toFixed(2),
      String(m.points_balance),
      (m.credit_balance_cents / 100).toFixed(2),
      m.referral_code,
      (m.crm_tags ?? []).join(' | '),
    ]);

    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cartel-crm-segment-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice(`Exported ${filteredMembers.length} member records (SA IDs masked).`);
  }, [filteredMembers, branchNameById]);

  const handleCreateMember = useCallback(async () => {
    setError(null);
    setCreating(true);
    try {
      let dob = passportDob;
      let cleanSaId: string | null = null;
      let nationality: string | null = null;
      let gender: string | null = null;

      if (docType === 'SA_ID') {
        const parsed = parseSaId(saIdNumber);
        if (!parsed.valid) {
          throw new Error(parsed.message || 'Enter a valid 13-digit South African ID number.');
        }
        if (!parsed.isOfLegalAge) {
          throw new Error(`Collective membership is restricted to adults aged ${LEGAL_AGE}+.`);
        }
        dob = parsed.dateOfBirth;
        cleanSaId = parsed.normalized;
        nationality = parsed.citizenship ?? 'SA_CITIZEN';
        gender = parsed.genderMarker ?? null;
      } else {
        if (!passportNumber.trim() || !passportCountry.trim() || !passportDob) {
          throw new Error('Passport number, issuing country, and date of birth are required.');
        }
        const age = ageInYears(new Date(`${passportDob}T00:00:00Z`));
        if (age < LEGAL_AGE) {
          throw new Error(`Collective membership is restricted to adults aged ${LEGAL_AGE}+.`);
        }
      }

      if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()) {
        throw new Error('First name, last name, email, and phone are required.');
      }

      const created = await createMember({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        idDocumentType: docType,
        saIdNumber: cleanSaId,
        passportNumber: docType === 'PASSPORT' ? passportNumber.trim() : null,
        passportCountry: docType === 'PASSPORT' ? passportCountry.trim().toUpperCase() : null,
        dateOfBirth: dob,
        nationality,
        gender,
        preferredUom,
        marketingOptIn,
        homeBranchId: homeBranchId || null,
        referredByCode: referredByCode.trim().toUpperCase() || null,
        crmTags: selectedTags,
        internalNotes: internalNotes.trim() || null,
        autoApprove,
      });

      setNotice(
        `Member ${created.first_name} ${created.last_name} (${created.member_code}) added to CRM.`,
      );
      setOnboardOpen(false);
      setFirstName('');
      setLastName('');
      setEmail('');
      setPhone('');
      setSaIdNumber('');
      setPassportNumber('');
      setPassportCountry('');
      setPassportDob('');
      setReferredByCode('');
      setInternalNotes('');
      membersQuery.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to create member.');
    } finally {
      setCreating(false);
    }
  }, [
    docType,
    saIdNumber,
    passportNumber,
    passportCountry,
    passportDob,
    firstName,
    lastName,
    email,
    phone,
    preferredUom,
    marketingOptIn,
    homeBranchId,
    referredByCode,
    selectedTags,
    internalNotes,
    autoApprove,
    membersQuery,
  ]);

  return (
    <main className="min-h-screen bg-void pb-28 pt-12">
      <div className="container max-w-6xl space-y-8">
        {/* ---- Header & Actions ------------------------------------------ */}
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Eyebrow>Collective Relationship Engine · CRM</Eyebrow>
            <h1 className="mt-2 display-md text-white">
              Member <span className="text-gold">CRM &amp; Compliance</span>
            </h1>
            <p className="mt-2 max-w-2xl type-ui text-ash">
              18+ SA ID &amp; passport compliance desk, branch-routed member directory, strain &amp;
              UOM preferences, affiliate attribution, and concierge follow-up ledger.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="gold" size="sm" onClick={() => setOnboardOpen(true)}>
              <Plus className="size-3.5" />
              Onboard Member
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCsv}>
              <Download className="size-3.5" />
              Export Segment CSV
            </Button>
            <Button
              variant={tab === 'DIRECTORY' ? 'active' : 'outline'}
              size="sm"
              onClick={() => setTab('DIRECTORY')}
            >
              <Users className="size-3.5" />
              Directory ({members.length})
            </Button>
            <Button
              variant={tab === 'FOLLOW_UPS' ? 'active' : 'outline'}
              size="sm"
              onClick={() => setTab('FOLLOW_UPS')}
            >
              <BellRing className="size-3.5" />
              Follow-Ups ({openFollowUps.length})
            </Button>
          </div>
        </header>

        {/* ---- Collective CRM KPIs --------------------------------------- */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Card className="p-4">
            <Stat label="Members" value={kpis.total} />
          </Card>
          <Card
            interactive
            className="cursor-pointer p-4"
            onClick={() => {
              setTab('DIRECTORY');
              setStatusFilter(statusFilter === 'PENDING_KYC' ? 'ALL' : 'PENDING_KYC');
            }}
          >
            <Stat
              label="KYC Queue"
              value={kpis.pendingKyc}
              tone={kpis.pendingKyc > 0 ? 'gold' : 'muted'}
            />
          </Card>
          <Card className="p-4">
            <Stat label="VIP Standing" value={kpis.vipCount} tone="gold" />
          </Card>
          <Card className="p-4">
            <Stat label="Collective LTV" value={formatCents(kpis.totalLtvCents)} tone="gold" />
          </Card>
          <Card className="p-4">
            <Stat label="Store Credit Held" value={formatCents(kpis.totalCreditCents)} />
          </Card>
          <Card
            interactive
            className="cursor-pointer p-4"
            onClick={() => setTab('FOLLOW_UPS')}
          >
            <Stat
              label="Open Follow-Ups"
              value={kpis.openFollowUps}
              tone={kpis.openFollowUps > 0 ? 'gold' : 'muted'}
            />
          </Card>
        </section>

        {/* ---- Feedback banners ------------------------------------------ */}
        {notice ? (
          <Card className="flex items-center justify-between border-gold/60 bg-surface-raised p-4">
            <span className="font-mono type-ui text-white">{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-ash hover:text-white"
              aria-label="Dismiss notification"
            >
              <X className="size-4" />
            </button>
          </Card>
        ) : null}

        {error ? (
          <Card role="alert" className="flex items-center justify-between border-white/40 p-4">
            <span className="font-mono type-ui text-white">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-ash hover:text-white"
              aria-label="Dismiss error"
            >
              <X className="size-4" />
            </button>
          </Card>
        ) : null}

        {tab === 'DIRECTORY' ? (
          <>
            {/* ---- Filter Bar -------------------------------------------- */}
            <Card className="flex flex-col gap-4 p-5">
              <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ash" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name, CARTEL-code, email, phone, or tag..."
                    className="pl-10"
                    aria-label="Search collective members"
                  />
                </div>

                <label className="flex items-center gap-2 border border-[color:var(--border-subtle)] bg-void px-3 font-mono type-ui text-white">
                  <Building2 className="size-3.5 shrink-0 text-ash" />
                  <select
                    aria-label="Filter by home branch"
                    value={branchFilter}
                    onChange={(e) => setBranchFilter(e.target.value)}
                    className="w-full bg-transparent py-2 font-mono type-ui text-white focus:outline-none"
                  >
                    <option value="ALL" className="bg-surface text-white">
                      All Branches
                    </option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id} className="bg-surface text-white">
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-2 border border-[color:var(--border-subtle)] bg-void px-3 font-mono type-ui text-white">
                  <Filter className="size-3.5 shrink-0 text-ash" />
                  <select
                    aria-label="Filter by CRM segment"
                    value={segmentFilter}
                    onChange={(e) => setSegmentFilter(e.target.value as SmartSegment)}
                    className="w-full bg-transparent py-2 font-mono type-ui text-white focus:outline-none"
                  >
                    <option value="ALL" className="bg-surface text-white">
                      All Segments
                    </option>
                    <option value="HIGH_LTV" className="bg-surface text-white">
                      High LTV (R5,000+)
                    </option>
                    <option value="OPEN_FOLLOW_UPS" className="bg-surface text-white">
                      Has Open Follow-Up
                    </option>
                    <option value="AFFILIATE_REFERRERS" className="bg-surface text-white">
                      Active Affiliate Referrers
                    </option>
                    <option value="MARKETING_OPT_IN" className="bg-surface text-white">
                      Marketing Opt-In
                    </option>
                    <option value="UNSIGNED_AGREEMENT" className="bg-surface text-white">
                      Unsigned Agreement
                    </option>
                  </select>
                </label>

                <label className="flex items-center gap-2 border border-[color:var(--border-subtle)] bg-void px-3 font-mono type-ui text-white">
                  <Sparkles className="size-3.5 shrink-0 text-ash" />
                  <select
                    aria-label="Sort members"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortMode)}
                    className="w-full bg-transparent py-2 font-mono type-ui text-white focus:outline-none"
                  >
                    <option value="RECENT" className="bg-surface text-white">
                      Sort: Most Recent
                    </option>
                    <option value="LTV_DESC" className="bg-surface text-white">
                      Sort: Highest LTV
                    </option>
                    <option value="ORDERS_DESC" className="bg-surface text-white">
                      Sort: Most Orders
                    </option>
                    <option value="POINTS_DESC" className="bg-surface text-white">
                      Sort: Highest Points
                    </option>
                    <option value="CREDIT_DESC" className="bg-surface text-white">
                      Sort: Store Credit
                    </option>
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_FILTERS.map((f) => (
                    <Button
                      key={f.key}
                      size="sm"
                      variant={statusFilter === f.key ? 'active' : 'outline'}
                      onClick={() => setStatusFilter(f.key)}
                    >
                      {f.label}
                    </Button>
                  ))}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {RANK_FILTERS.map((rank) => (
                    <button
                      key={rank}
                      type="button"
                      onClick={() => setRankFilter(rank)}
                      className={cn(
                        'border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors',
                        rankFilter === rank
                          ? 'border-gold bg-gold/10 text-gold'
                          : 'border-[color:var(--border-mono)] text-ash hover:text-white',
                      )}
                    >
                      {rank === 'ALL' ? 'All Ranks' : RANK_LABEL[rank]}
                    </button>
                  ))}
                </div>
              </div>
            </Card>

            {/* ---- Directory List ---------------------------------------- */}
            {membersQuery.loading ? (
              <Card className="flex items-center justify-center gap-2 p-12 font-mono type-ui text-ash">
                <Loader2 className="size-4 animate-spin" />
                Loading collective CRM...
              </Card>
            ) : filteredMembers.length === 0 ? (
              <EmptyState
                title="No members match these filters"
                description="Clear a status, branch, or segment filter, or onboard a new collective member."
              />
            ) : (
              <div className="flex flex-col gap-2.5">
                {filteredMembers.map((member) => {
                  const age = ageInYears(new Date(`${member.date_of_birth}T00:00:00Z`));
                  const followUps = openFollowUpCountByMember.get(member.id) ?? 0;
                  const referrals = referredCountByCode.get(member.referral_code) ?? 0;
                  const homeBranch = branchNameById.get(member.home_branch_id ?? '') ?? 'Sandton';

                  return (
                    <Card key={member.id} interactive className="p-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        {/* Identity & Tags */}
                        <div className="flex min-w-0 flex-col gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/admin/crm/${member.id}`}
                              className="font-display text-base uppercase text-white hover:text-gold"
                            >
                              {member.first_name} {member.last_name}
                            </Link>
                            <Badge tone={STATUS_TONE[member.status]}>
                              {member.status.replace('_', ' ')}
                            </Badge>
                            <Badge tone="mono">{RANK_LABEL[member.rank]}</Badge>
                            {member.age_verified_at === null ? (
                              <Badge tone="danger">Age Unverified</Badge>
                            ) : null}
                            {member.agreement_signed_at === null ? (
                              <Badge tone="warn">Unsigned</Badge>
                            ) : null}
                            {followUps > 0 ? (
                              <Badge tone="gold">
                                {followUps} Follow-Up{followUps === 1 ? '' : 's'}
                              </Badge>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono type-ui text-ash">
                            <span className="text-gold">{member.member_code}</span>
                            <span>{homeBranch}</span>
                            <span>{member.phone}</span>
                            <span className="truncate">{member.email}</span>
                            <span>Pref: {member.preferred_uom}</span>
                            {referrals > 0 ? <span>Referrals: {referrals}</span> : null}
                          </div>

                          {(member.crm_tags ?? []).length > 0 ? (
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                              {(member.crm_tags ?? []).map((tag) => (
                                <span
                                  key={tag}
                                  className="inline-flex items-center gap-1 border border-[color:var(--border-mono)] bg-void px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ash"
                                >
                                  <Tag className="size-2.5 text-gold" />
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        {/* Metrics & Actions */}
                        <div className="flex flex-wrap items-end justify-between gap-5 lg:shrink-0">
                          <div className="flex flex-wrap gap-6">
                            <Stat
                              label="Age"
                              value={age}
                              unit="yrs"
                              tone={age < LEGAL_AGE ? 'gold' : 'muted'}
                            />
                            <Stat label="Orders" value={member.order_count} tone="muted" />
                            <Stat
                              label="Credit"
                              value={formatCents(member.credit_balance_cents)}
                              tone={member.credit_balance_cents > 0 ? 'gold' : 'muted'}
                            />
                            <Stat
                              label="LTV"
                              value={formatCents(member.lifetime_value_cents)}
                              tone="gold"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            {member.status === 'ACTIVE_MEMBER' || member.status === 'VIP' ? (
                              <Button asChild size="sm" variant="outline">
                                <Link
                                  href={`/admin/pos?member=${encodeURIComponent(member.member_code)}`}
                                >
                                  <ScanLine className="size-3.5" />
                                  POS
                                </Link>
                              </Button>
                            ) : null}
                            <Button asChild size="sm" variant="surface">
                              <Link href={`/admin/crm/${member.id}`}>
                                Dossier
                                <ArrowUpRight className="size-3.5" />
                              </Link>
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          /* ---- Follow-Up Queue Tab ------------------------------------ */
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-mono type-ui text-ash">
                Scheduled concierge tastings, KYC compliance callbacks, and VIP outreach ordered by
                due timestamp.
              </p>
            </div>

            {openFollowUps.length === 0 ? (
              <EmptyState
                title="All follow-ups cleared"
                description="No pending concierge or compliance callbacks across branches."
              />
            ) : (
              <div className="flex flex-col gap-2.5">
                {openFollowUps.map((item) => {
                  const member = memberById.get(item.member_id);
                  const branchName = branchNameById.get(item.branch_id ?? '') ?? 'All Branches';
                  return (
                    <Card key={item.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="gold">{item.channel.replace('_', ' ')}</Badge>
                          <Badge tone="mono">{branchName}</Badge>
                          {item.follow_up_at ? (
                            <span className="font-mono type-ui text-white">
                              Due {new Date(item.follow_up_at).toLocaleString('en-ZA')}
                            </span>
                          ) : null}
                        </div>
                        <p className="type-ui text-white">{item.summary}</p>
                        {member ? (
                          <p className="font-mono type-ui text-ash">
                            {member.first_name} {member.last_name} · {member.member_code} ·{' '}
                            {member.phone}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {member ? (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/admin/crm/${member.id}`}>
                              Open Dossier
                              <ArrowUpRight className="size-3.5" />
                            </Link>
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="gold"
                          onClick={() => handleToggleFollowUp(item.id, true)}
                        >
                          <CheckCircle2 className="size-3.5" />
                          Mark Done
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>

      {/* ---- Onboard Member Modal ---------------------------------------- */}
      {onboardOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Onboard collective member"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        >
          <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto border-gold/40 bg-surface p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Eyebrow>CRM Enrollment Desk</Eyebrow>
                <h2 className="mt-1 font-display text-xl uppercase text-white">
                  Onboard Collective Member
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOnboardOpen(false)}
                className="text-ash hover:text-white"
                aria-label="Close modal"
              >
                <X className="size-5" />
              </button>
            </div>

            <Separator className="my-4" />

            <div className="space-y-4">
              {/* Document type */}
              <div className="flex gap-2">
                {(['SA_ID', 'PASSPORT'] as const).map((dt) => (
                  <Button
                    key={dt}
                    type="button"
                    size="sm"
                    variant={docType === dt ? 'active' : 'outline'}
                    onClick={() => setDocType(dt)}
                  >
                    {dt === 'SA_ID' ? 'South African ID (Luhn + 18+)' : 'Passport'}
                  </Button>
                ))}
              </div>

              {docType === 'SA_ID' ? (
                <Field
                  label="13-Digit South African ID Number"
                  htmlFor="crm-sa-id"
                  required
                  hint={
                    parsedSaId?.valid
                      ? `Verified DOB ${parsedSaId.dateOfBirth} · ${parsedSaId.isOfLegalAge ? `${LEGAL_AGE}+ Eligible` : 'UNDERAGE'}`
                      : parsedSaId?.message ?? 'Validated with Luhn mod-10 checksum'
                  }
                >
                  <Input
                    id="crm-sa-id"
                    value={saIdNumber}
                    onChange={(e) => setSaIdNumber(e.target.value)}
                    placeholder="e.g. 9001015009087"
                  />
                </Field>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Passport Number" htmlFor="crm-passport-num" required>
                    <Input
                      id="crm-passport-num"
                      value={passportNumber}
                      onChange={(e) => setPassportNumber(e.target.value)}
                    />
                  </Field>
                  <Field label="Country (ISO)" htmlFor="crm-passport-country" required>
                    <Input
                      id="crm-passport-country"
                      value={passportCountry}
                      onChange={(e) => setPassportCountry(e.target.value)}
                      placeholder="ZA / GB / US"
                    />
                  </Field>
                  <Field label="Date of Birth" htmlFor="crm-passport-dob" required>
                    <Input
                      id="crm-passport-dob"
                      type="date"
                      value={passportDob}
                      onChange={(e) => setPassportDob(e.target.value)}
                    />
                  </Field>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="First Name" htmlFor="crm-first" required>
                  <Input
                    id="crm-first"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </Field>
                <Field label="Last Name" htmlFor="crm-last" required>
                  <Input
                    id="crm-last"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Email" htmlFor="crm-email" required>
                  <Input
                    id="crm-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Field label="Mobile / WhatsApp" htmlFor="crm-phone" required>
                  <Input
                    id="crm-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0821234567"
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Home Branch" htmlFor="crm-home-branch">
                  <Select
                    id="crm-home-branch"
                    value={homeBranchId}
                    onChange={(e) => setHomeBranchId(e.target.value)}
                  >
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Preferred Unit" htmlFor="crm-pref-uom">
                  <Select
                    id="crm-pref-uom"
                    value={preferredUom}
                    onChange={(e) => setPreferredUom(e.target.value as BaseUom)}
                  >
                    <option value="GRAMS">Grams (g)</option>
                    <option value="MILLILITERS">Milliliters (ml)</option>
                    <option value="UNITS">Units (ea)</option>
                  </Select>
                </Field>

                <Field label="Referred By Code" htmlFor="crm-referred-by">
                  <Input
                    id="crm-referred-by"
                    value={referredByCode}
                    onChange={(e) => setReferredByCode(e.target.value)}
                    placeholder="CARTEL-0420"
                  />
                </Field>
              </div>

              <div>
                <p className="mb-2 font-mono text-xs uppercase tracking-wider text-ash">
                  Initial CRM Tags
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_TAGS.map((tag) => {
                    const active = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() =>
                          setSelectedTags((prev) =>
                            prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
                          )
                        }
                        className={cn(
                          'border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors',
                          active
                            ? 'border-gold bg-gold/15 text-gold'
                            : 'border-[color:var(--border-mono)] text-ash hover:text-white',
                        )}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Field label="Concierge Notes" htmlFor="crm-notes">
                <Input
                  id="crm-notes"
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  placeholder="Cultivar preferences, terpene profile notes, delivery gate info..."
                />
              </Field>

              <div className="flex flex-wrap gap-6 pt-1">
                <label className="flex items-center gap-2 font-mono type-ui text-white">
                  <input
                    type="checkbox"
                    checked={marketingOptIn}
                    onChange={(e) => setMarketingOptIn(e.target.checked)}
                  />
                  WhatsApp / Drop Alerts Opt-In
                </label>

                <label className="flex items-center gap-2 font-mono type-ui text-white">
                  <input
                    type="checkbox"
                    checked={autoApprove}
                    onChange={(e) => setAutoApprove(e.target.checked)}
                  />
                  Instant 18+ KYC Verify &amp; Activate
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <Button variant="ghost" onClick={() => setOnboardOpen(false)} disabled={creating}>
                  Cancel
                </Button>
                <Button variant="gold" onClick={handleCreateMember} disabled={creating}>
                  {creating ? <Loader2 className="animate-spin" /> : <Plus />}
                  Enroll Member
                </Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}
    </main>
  );
}

