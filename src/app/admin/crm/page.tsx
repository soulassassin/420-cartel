'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Ban,
  Check,
  Crown,
  Loader2,
  Search,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Badge, Card, EmptyState, Eyebrow, Separator, Stat } from '@/components/ui/surfaces';
import { CartelMemberQrPass } from '@/components/crm/CartelMemberQrPass';
import { formatCents } from '@/lib/money';
import { RANK_LABEL } from '@/lib/loyalty';
import { formatSaId, parseSaId } from '@/lib/sa-id';
import {
  adjustMemberCredit,
  listMembers,
  setMemberStatus,
} from '@/lib/data/source';
import { useCartelQuery } from '@/lib/data/useCartelQuery';
import type { MemberRow, MemberStatus } from '@/types/database';

/**
 * Module H — Member CRM, KYC Approval Queue & Store Credit Ledger.
 *
 * Allows collective reviewers to inspect 18+ KYC applications, approve or
 * elevate members to VIP standing, suspend passes, and credit/debit member
 * store credit balances.
 */

type FilterTab = 'ALL' | MemberStatus;

const FILTERS: { key: FilterTab; label: string }[] = [
  { key: 'ALL', label: 'All Members' },
  { key: 'PENDING_KYC', label: 'Pending KYC' },
  { key: 'ACTIVE_MEMBER', label: 'Active' },
  { key: 'VIP', label: 'VIP' },
  { key: 'SUSPENDED', label: 'Suspended' },
];

export default function AdminCrmPage() {
  const [filter, setFilter] = useState<FilterTab>('ALL');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creditRand, setCreditRand] = useState('250');
  const [creditReason, setCreditReason] = useState('Complimentary collective allocation credit');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const membersQuery = useCartelQuery(() => listMembers(), []);
  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return members.filter((m) => {
      if (filter !== 'ALL' && m.status !== filter) return false;
      if (!needle) return true;
      return (
        m.member_code.toLowerCase().includes(needle) ||
        `${m.first_name} ${m.last_name}`.toLowerCase().includes(needle) ||
        m.email.toLowerCase().includes(needle) ||
        m.phone.includes(needle) ||
        (m.sa_id_number ?? '').includes(needle)
      );
    });
  }, [members, filter, query]);

  const selected = useMemo(
    () => members.find((m) => m.id === selectedId) ?? filtered[0] ?? null,
    [members, selectedId, filtered],
  );

  const saIdDetails = useMemo(
    () => (selected?.sa_id_number ? parseSaId(selected.sa_id_number) : null),
    [selected],
  );

  const handleStatusChange = useCallback(
    async (memberId: string, status: MemberStatus) => {
      setBusy(true);
      setError(null);
      try {
        const updated = await setMemberStatus(
          memberId,
          status,
          status === 'SUSPENDED' ? 'Suspended via CRM review' : null,
        );
        setNotice(`Updated ${updated.member_code} to ${updated.status}.`);
        membersQuery.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Status update failed.');
      } finally {
        setBusy(false);
      }
    },
    [membersQuery],
  );

  const handleCreditAdjust = useCallback(
    async (sign: 1 | -1) => {
      if (!selected) return;
      const rands = Number.parseFloat(creditRand);
      if (!Number.isFinite(rands) || rands <= 0) {
        setError('Enter a valid Rand amount.');
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const deltaCents = Math.round(rands * 100) * sign;
        const updated = await adjustMemberCredit(
          selected.id,
          deltaCents,
          creditReason.trim() || 'Admin credit adjustment',
        );
        setNotice(
          `Updated ${updated.member_code} credit balance to ${formatCents(updated.credit_balance_cents)}.`,
        );
        membersQuery.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Credit adjustment failed.');
      } finally {
        setBusy(false);
      }
    },
    [selected, creditRand, creditReason, membersQuery],
  );

  const pendingCount = useMemo(
    () => members.filter((m) => m.status === 'PENDING_KYC').length,
    [members],
  );

  return (
    <main className="min-h-screen bg-void pb-28 pt-12">
      <div className="container">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Back Office · Module H</Eyebrow>
            <h1 className="mt-2 display-md text-white">
              Member <span className="gold-text">CRM</span> & KYC Queue
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Verify 18+ South African ID and passport applications, manage VIP standing, and
              administer member store credit balances.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Badge tone={pendingCount > 0 ? 'warn' : 'live'}>
              {pendingCount} Pending KYC
            </Badge>
            <Badge tone="gold">{members.length} Total Members</Badge>
          </div>
        </header>

        {notice ? (
          <p className="mt-6 border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 font-mono text-xs text-emerald-300">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="mt-6 border border-destructive/60 bg-destructive/10 px-4 py-3 font-mono text-xs text-red-300">
            {error}
          </p>
        ) : null}

        {/* Filter bar */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border-mono)] pb-4">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <Button
                key={f.key}
                variant={filter === f.key ? 'active' : 'surface'}
                size="sm"
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </Button>
            ))}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search code, SA ID, phone..."
              className="h-9 w-64 pl-9 font-mono text-xs"
            />
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          {/* Member list */}
          <div className="space-y-2.5 lg:col-span-7">
            {filtered.length === 0 ? (
              <EmptyState
                title="No members match that filter"
                description="Try clearing the search query or switching status tabs."
              />
            ) : (
              filtered.map((m) => {
                const isSelected = selected?.id === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedId(m.id)}
                    className={`flex w-full items-center justify-between border p-4 text-left transition-colors ${
                      isSelected
                        ? 'border-gold bg-gold/10'
                        : 'border-[color:var(--border-mono)] bg-surface hover:border-gold/40'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="font-display text-base uppercase text-white">
                          {m.first_name} {m.last_name}
                        </span>
                        <span className="font-mono text-xs text-gold">{m.member_code}</span>
                      </div>
                      <p className="mt-1 font-mono text-[0.6875rem] text-muted-foreground">
                        {m.email} · {m.phone} · DOB {m.date_of_birth}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      <Badge
                        tone={
                          m.status === 'VIP'
                            ? 'gold'
                            : m.status === 'ACTIVE_MEMBER'
                              ? 'live'
                              : m.status === 'PENDING_KYC'
                                ? 'warn'
                                : 'danger'
                        }
                      >
                        {m.status.replace(/_/g, ' ')}
                      </Badge>
                      <span className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-faint">
                        LTV {formatCents(m.lifetime_value_cents)} · {RANK_LABEL[m.rank]}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Member inspector */}
          <div className="lg:col-span-5">
            {selected ? (
              <Card className="space-y-6 p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <Eyebrow>Member Dossier</Eyebrow>
                    <h2 className="mt-1 font-display text-xl uppercase text-white">
                      {selected.first_name} {selected.last_name}
                    </h2>
                    <p className="font-mono text-xs text-gold">{selected.member_code}</p>
                  </div>
                  <Badge tone={selected.status === 'VIP' ? 'gold' : 'live'}>
                    {selected.status.replace(/_/g, ' ')}
                  </Badge>
                </div>

                {/* Standing Controls */}
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant={selected.status === 'ACTIVE_MEMBER' ? 'active' : 'surface'}
                    size="sm"
                    disabled={busy}
                    onClick={() => void handleStatusChange(selected.id, 'ACTIVE_MEMBER')}
                  >
                    <ShieldCheck className="size-3.5" />
                    Approve
                  </Button>
                  <Button
                    variant={selected.status === 'VIP' ? 'active' : 'surface'}
                    size="sm"
                    disabled={busy}
                    onClick={() => void handleStatusChange(selected.id, 'VIP')}
                  >
                    <Crown className="size-3.5" />
                    Make VIP
                  </Button>
                  <Button
                    variant={selected.status === 'SUSPENDED' ? 'destructive' : 'surface'}
                    size="sm"
                    disabled={busy}
                    onClick={() => void handleStatusChange(selected.id, 'SUSPENDED')}
                  >
                    <Ban className="size-3.5" />
                    Suspend
                  </Button>
                </div>

                <Separator />

                {/* Identity & LTV */}
                <div className="grid grid-cols-2 gap-4">
                  <Stat
                    label="Lifetime Value"
                    value={formatCents(selected.lifetime_value_cents)}
                    tone="gold"
                  />
                  <Stat
                    label="Store Credit"
                    value={formatCents(selected.credit_balance_cents)}
                  />
                  <Stat
                    label="Loyalty Points"
                    value={selected.points_balance.toLocaleString('en-ZA')}
                  />
                  <Stat label="Rank" value={RANK_LABEL[selected.rank]} />
                </div>

                {saIdDetails && saIdDetails.valid ? (
                  <div className="border border-[color:var(--border-mono)] bg-void p-3.5 font-mono text-xs">
                    <p className="text-[0.625rem] uppercase tracking-[0.2em] text-gold">
                      SA 13-Digit ID Checksum Verified
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      ID: {formatSaId(saIdDetails.normalized)} · {saIdDetails.age} yrs ·{' '}
                      {saIdDetails.genderMarker} · {saIdDetails.citizenship}
                    </p>
                  </div>
                ) : null}

                <Separator />

                {/* Store Credit Adjustment */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Wallet className="size-4 text-gold" />
                    <Eyebrow>Store Credit Ledger Adjustment</Eyebrow>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Amount (ZAR)" htmlFor="crm_credit_amt">
                      <Input
                        id="crm_credit_amt"
                        type="number"
                        value={creditRand}
                        onChange={(e) => setCreditRand(e.target.value)}
                        className="h-9 font-mono text-xs"
                      />
                    </Field>
                    <Field label="Reason" htmlFor="crm_credit_reason">
                      <Input
                        id="crm_credit_reason"
                        value={creditReason}
                        onChange={(e) => setCreditReason(e.target.value)}
                        className="h-9 text-xs"
                      />
                    </Field>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="gold"
                      size="sm"
                      disabled={busy}
                      onClick={() => void handleCreditAdjust(1)}
                    >
                      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                      Credit +{creditRand || '0'} ZAR
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void handleCreditAdjust(-1)}
                    >
                      Debit -{creditRand || '0'} ZAR
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="flex justify-center">
                  <CartelMemberQrPass member={selected} compact />
                </div>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
