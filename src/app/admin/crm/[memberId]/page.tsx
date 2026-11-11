import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { KycReviewPanel } from '@/components/crm/KycReviewPanel';
import { MemberAdminPanel } from '@/components/crm/MemberAdminPanel';
import { Button } from '@/components/ui/button';
import { Badge, Card, Eyebrow, Separator, Stat } from '@/components/ui/surfaces';
import { DefaultLoyaltyEngine, RANK_LABEL } from '@/lib/loyalty';
import { formatCents } from '@/lib/money';
import { LEGAL_AGE, ageInYears, maskSaId } from '@/lib/sa-id';
import { UOM_LABEL, formatBaseQty } from '@/lib/uom';
import { createCartelServerClient, getViewer } from '@/lib/supabase/server';
import type {
  KycDocumentRow,
  LoyaltyLedgerRow,
  MemberCreditLedgerRow,
  MemberRow,
  OrderRow,
} from '@/types/database';

export const metadata: Metadata = {
  title: 'Member Profile',
  robots: { index: false, follow: false },
};

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer.isStaff) redirect('/');

  const { memberId } = await params;
  const supabase = await createCartelServerClient();

  const { data: member } = await supabase
    .from('members')
    .select('*')
    .eq('id', memberId)
    .maybeSingle();

  if (!member) notFound();

  const typedMember = member as MemberRow;

  const [documentsResult, ordersResult, loyaltyResult, creditResult, rulesResult] =
    await Promise.all([
      supabase
        .from('kyc_documents')
        .select('*')
        .eq('member_id', memberId)
        .order('created_at', { ascending: false }),
      supabase
        .from('orders')
        .select('*')
        .eq('member_id', memberId)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('loyalty_ledger')
        .select('*')
        .eq('member_id', memberId)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('member_credit_ledger')
        .select('*')
        .eq('member_id', memberId)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase.from('loyalty_rules').select('*').eq('is_active', true).limit(1).maybeSingle(),
    ]);

  const documents: KycDocumentRow[] = documentsResult.data ?? [];
  const orders: OrderRow[] = ordersResult.data ?? [];
  const loyalty: LoyaltyLedgerRow[] = loyaltyResult.data ?? [];
  const credit: MemberCreditLedgerRow[] = creditResult.data ?? [];

  const engine = new DefaultLoyaltyEngine(rulesResult.data ?? null);
  const progress = engine.rankProgress(typedMember.lifetime_value_cents);
  const age = ageInYears(new Date(`${typedMember.date_of_birth}T00:00:00Z`));

  const posOrders = orders.filter((order) => order.channel === 'POS').length;
  const onlineOrders = orders.filter((order) => order.channel === 'ONLINE').length;

  return (
    <main className="content-layer mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-14">
      {/* ---- Header ------------------------------------------------------ */}
      <div className="flex flex-col gap-5">
        <Button asChild variant="ghost" size="sm" className="self-start">
          <Link href="/admin/crm">
            <ArrowLeft />
            Back to CRM
          </Link>
        </Button>

        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col gap-3">
            <Eyebrow>{typedMember.member_code}</Eyebrow>
            <h1 className="display-md">
              {typedMember.first_name} {typedMember.last_name}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                tone={
                  typedMember.status === 'SUSPENDED'
                    ? 'danger'
                    : typedMember.status === 'VIP'
                      ? 'gold'
                      : typedMember.status === 'ACTIVE_MEMBER'
                        ? 'live'
                        : 'warn'
                }
              >
                {typedMember.status.replace('_', ' ')}
              </Badge>
              <Badge tone="mono">{RANK_LABEL[typedMember.rank]}</Badge>
              <Badge tone={age >= LEGAL_AGE ? 'live' : 'danger'}>
                {age} yrs · {age >= LEGAL_AGE ? `${LEGAL_AGE}+` : 'UNDERAGE'}
              </Badge>
            </div>
          </div>

          <div className="flex flex-wrap gap-8">
            <Stat label="Lifetime Value" value={formatCents(typedMember.lifetime_value_cents)} tone="gold" />
            <Stat label="Orders" value={typedMember.order_count} />
            <Stat label="Points" value={typedMember.points_balance.toLocaleString('en-ZA')} />
            <Stat label="Credit" value={formatCents(typedMember.credit_balance_cents)} />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* ---- Left column --------------------------------------------- */}
        <div className="flex flex-col gap-6">
          {/* Identity record */}
          <Card className="flex flex-col gap-5 p-6">
            <p className="font-display text-base uppercase ">Identity Record</p>
            <Separator />
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
              <Stat label="Document" value={typedMember.id_document_type.replace('_', ' ')} />
              <Stat
                label={typedMember.id_document_type === 'SA_ID' ? 'ID Number' : 'Passport'}
                value={
                  typedMember.id_document_type === 'SA_ID'
                    ? maskSaId(typedMember.sa_id_number ?? '')
                    : `${typedMember.passport_country ?? '—'} ${typedMember.passport_number ?? ''}`
                }
                tone="muted"
              />
              <Stat label="Date of Birth" value={typedMember.date_of_birth} tone="muted" />
              <Stat label="Nationality" value={typedMember.nationality ?? '—'} tone="muted" />
              <Stat
                label="Age Verified"
                value={
                  typedMember.age_verified_at
                    ? new Date(typedMember.age_verified_at).toLocaleDateString('en-ZA')
                    : 'No'
                }
                tone={typedMember.age_verified_at ? 'default' : 'muted'}
              />
              <Stat
                label="Agreement"
                value={
                  typedMember.agreement_signed_at
                    ? `v${typedMember.agreement_version ?? '?'}`
                    : 'Unsigned'
                }
                tone={typedMember.agreement_signed_at ? 'default' : 'muted'}
              />
            </div>
            <p className="font-mono type-ui text-ash">
              ID numbers are masked in the CRM and are not searchable
            </p>
          </Card>

          {/* KYC review */}
          <KycReviewPanel member={typedMember} documents={documents} />

          {/* Order history */}
          <Card className="flex flex-col gap-5 p-6">
            <div className="flex items-start justify-between gap-4">
              <p className="font-display text-base uppercase ">Recent Orders</p>
              <div className="flex gap-5">
                <Stat label="In-Store" value={posOrders} tone="muted" />
                <Stat label="Online" value={onlineOrders} tone="muted" />
              </div>
            </div>
            <Separator />
            {orders.length === 0 ? (
              <p className="font-mono type-ui text-ash">
                No orders yet
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-[color:var(--border-mono)]">
                {orders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="font-mono type-ui ">
                        {order.order_number}
                      </span>
                      <span className="font-mono type-ui text-ash">
                        {order.channel} · {order.fulfilment_type} ·{' '}
                        {new Date(order.created_at).toLocaleDateString('en-ZA')}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                      <Badge
                        tone={
                          order.status === 'COMPLETED' || order.status === 'PAID'
                            ? 'live'
                            : order.status === 'CANCELLED' || order.status === 'REFUNDED'
                              ? 'danger'
                              : 'warn'
                        }
                      >
                        {order.status.replace(/_/g, ' ')}
                      </Badge>
                      <span className="font-mono type-ui tabular-nums">
                        {formatCents(order.total_cents)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ---- Right column -------------------------------------------- */}
        <div className="flex flex-col gap-6">
          {viewer.isManager ? (
            <MemberAdminPanel member={typedMember} />
          ) : (
            <Card className="p-6">
              <p className="type-ui leading-relaxed text-ash">
                Credit adjustments and status changes require owner or manager rights.
              </p>
            </Card>
          )}

          {/* Preferences & rank */}
          <Card className="flex flex-col gap-5 p-6">
            <p className="font-display text-base uppercase ">Profile</p>
            <Separator />
            <div className="grid grid-cols-2 gap-5">
              <Stat label="Preferred" value={UOM_LABEL[typedMember.preferred_uom]} tone="muted" />
              <Stat
                label="Marketing"
                value={typedMember.marketing_opt_in ? 'Opted In' : 'No'}
                tone="muted"
              />
              <Stat label="Referral Code" value={typedMember.referral_code} tone="gold" />
              <Stat
                label="Referred By"
                value={typedMember.referred_by_code ?? '—'}
                tone="muted"
              />
            </div>

            {progress.next ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono type-ui text-ash">
                    To {RANK_LABEL[progress.next]}
                  </span>
                  <span className="font-mono type-ui tabular-nums text-foreground">
                    {progress.centsToNext !== null ? formatCents(progress.centsToNext) : '—'}
                  </span>
                </div>
                <div className="h-0.5 w-full bg-[color:var(--border-mono)]">
                  <div
                    className="h-full bg-transparent"
                    style={{ width: `${Math.round(progress.progress * 100)}%` }}
                  />
                </div>
              </div>
            ) : null}
          </Card>

          {/* Ledgers */}
          <Card className="flex flex-col gap-5 p-6">
            <p className="font-display text-base uppercase ">Credit Ledger</p>
            <Separator />
            {credit.length === 0 ? (
              <p className="font-mono type-ui text-ash">
                No adjustments
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-[color:var(--border-mono)]">
                {credit.map((entry) => (
                  <div key={entry.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate type-ui text-ash">
                        {entry.reason}
                      </span>
                      <span className="font-mono type-ui text-ash">
                        {new Date(entry.created_at).toLocaleDateString('en-ZA')}
                      </span>
                    </div>
                    <span
                      className={`shrink-0 font-mono type-ui tabular-nums ${
                        entry.delta_cents > 0 ? 'text-foreground' : 'text-foreground'
                      }`}
                    >
                      {entry.delta_cents > 0 ? '+' : ''}
                      {formatCents(entry.delta_cents)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="flex flex-col gap-5 p-6">
            <p className="font-display text-base uppercase ">Points Ledger</p>
            <Separator />
            {loyalty.length === 0 ? (
              <p className="font-mono type-ui text-ash">
                No points activity
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-[color:var(--border-mono)]">
                {loyalty.map((entry) => (
                  <div key={entry.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate type-ui text-ash">
                        {entry.reason}
                      </span>
                      <span className="font-mono type-ui text-ash">
                        {new Date(entry.created_at).toLocaleDateString('en-ZA')} · bal{' '}
                        {entry.balance_after}
                      </span>
                    </div>
                    <span
                      className={`shrink-0 font-mono type-ui tabular-nums ${
                        entry.points_delta > 0 ? 'text-foreground' : 'text-foreground'
                      }`}
                    >
                      {entry.points_delta > 0 ? '+' : ''}
                      {entry.points_delta}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}
