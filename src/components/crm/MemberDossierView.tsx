'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Bell,
  CheckCircle2,
  Loader2,
  Plus,
  QrCode as QrIcon,
  RefreshCw,
  Save,
  ScanLine,
  Share2,
  Tag,
  X,
} from 'lucide-react';
import { CartelMemberQrPass } from '@/components/crm/CartelMemberQrPass';
import { KycReviewPanel } from '@/components/crm/KycReviewPanel';
import { MemberAdminPanel } from '@/components/crm/MemberAdminPanel';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Badge, Card, EmptyState, Eyebrow, Separator, Stat } from '@/components/ui/surfaces';
import {
  addCrmInteraction,
  getMemberDossier,
  listBranches,
  rotateMemberQrPass,
  subscribeToData,
  toggleCrmFollowUp,
  updateMemberCrmProfile,
} from '@/lib/data/source';
import { useCartelQuery } from '@/lib/data/useCartelQuery';
import { DefaultLoyaltyEngine, RANK_LABEL } from '@/lib/loyalty';
import { formatCents } from '@/lib/money';
import { LEGAL_AGE, ageInYears, maskSaId } from '@/lib/sa-id';
import { CATEGORY_LABEL, UOM_LABEL } from '@/lib/uom';
import { cn } from '@/lib/utils';
import type { BaseUom, CrmInteractionChannel } from '@/types/database';

const PRESET_TAGS = [
  'VIP_CONCIERGE',
  'SOLVENTLESS_FAN',
  'FLOWER_CONNOISSEUR',
  'EDIBLE_PREF',
  'ELIXIR_PREF',
  'DELIVERY_PREF',
  'BRAND_AMBASSADOR',
  'COMPLIANCE_HOLD',
  'HIGH_RISK',
];

const INTERACTION_CHANNELS: { value: CrmInteractionChannel; label: string }[] = [
  { value: 'IN_STORE', label: 'In-Store Visit' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'PHONE', label: 'Phone Call' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'VIP_CONCIERGE', label: 'VIP Concierge' },
  { value: 'COMPLIANCE', label: 'Compliance Review' },
];

export function MemberDossierView({ memberId }: { memberId: string }) {
  const dossierQuery = useCartelQuery(() => getMemberDossier(memberId), [memberId]);
  const branchesQuery = useCartelQuery(() => listBranches(), []);

  useEffect(() => {
    return subscribeToData(() => {
      dossierQuery.refresh();
    });
  }, [dossierQuery]);

  const dossier = dossierQuery.data;
  const branches = useMemo(() => branchesQuery.data ?? [], [branchesQuery.data]);
  const branchNameById = useMemo(
    () => new Map(branches.map((b) => [b.id, b.name])),
    [branches],
  );

  // CRM Profile Editor State
  const [homeBranchId, setHomeBranchId] = useState('');
  const [preferredUom, setPreferredUom] = useState<BaseUom>('GRAMS');
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [crmTags, setCrmTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // QR Pass modal & rotation
  const [qrOpen, setQrOpen] = useState(false);
  const [rotatingQr, setRotatingQr] = useState(false);

  // New Interaction composer
  const [channel, setChannel] = useState<CrmInteractionChannel>('WHATSAPP');
  const [interactionBranchId, setInteractionBranchId] = useState('');
  const [summary, setSummary] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [loggingInteraction, setLoggingInteraction] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dossier) return;
    const m = dossier.member;
    setHomeBranchId(m.home_branch_id ?? branches[0]?.id ?? '');
    setPreferredUom(m.preferred_uom);
    setMarketingOptIn(m.marketing_opt_in);
    setPhone(m.phone);
    setEmail(m.email);
    setInternalNotes(m.internal_notes ?? '');
    setCrmTags(m.crm_tags ?? []);
    setInteractionBranchId(m.home_branch_id ?? branches[0]?.id ?? '');
  }, [dossier, branches]);

  // Derived Behavioral Analytics from Orders & Order Items
  const analytics = useMemo(() => {
    if (!dossier) return null;
    const { orders, orderItems, products, member } = dossier;
    const productById = new Map(products.map((p) => [p.id, p]));

    const posOrders = orders.filter((o) => o.channel === 'POS').length;
    const onlineOrders = orders.filter((o) => o.channel === 'ONLINE').length;
    const deliveryOrders = orders.filter((o) => o.fulfilment_type === 'DELIVERY').length;
    const pickupOrders = orders.filter((o) => o.fulfilment_type === 'PICKUP').length;
    const inStoreOrders = orders.filter((o) => o.fulfilment_type === 'IN_STORE').length;

    const categorySpend = new Map<string, number>();
    const strainCount = new Map<string, number>();

    for (const item of orderItems) {
      const prod = productById.get(item.product_id);
      if (!prod) continue;
      categorySpend.set(
        prod.category,
        (categorySpend.get(prod.category) ?? 0) + item.line_total_cents,
      );
      if (prod.strain !== 'NOT_APPLICABLE') {
        strainCount.set(prod.strain, (strainCount.get(prod.strain) ?? 0) + item.quantity);
      }
    }

    const topCategory = [...categorySpend.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const topStrain = [...strainCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const avgOrderCents =
      member.order_count > 0 ? Math.round(member.lifetime_value_cents / member.order_count) : 0;

    return {
      posOrders,
      onlineOrders,
      deliveryOrders,
      pickupOrders,
      inStoreOrders,
      topCategory,
      topStrain,
      avgOrderCents,
    };
  }, [dossier]);

  const handleSaveProfile = useCallback(async () => {
    if (!dossier) return;
    setError(null);
    setNotice(null);
    setSavingProfile(true);
    try {
      await updateMemberCrmProfile(dossier.member.id, {
        homeBranchId: homeBranchId || null,
        preferredUom,
        marketingOptIn,
        phone,
        email,
        internalNotes,
        crmTags,
      });
      setNotice('CRM profile, branch affinity, tags & concierge notes saved.');
      dossierQuery.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update CRM profile.');
    } finally {
      setSavingProfile(false);
    }
  }, [
    dossier,
    homeBranchId,
    preferredUom,
    marketingOptIn,
    phone,
    email,
    internalNotes,
    crmTags,
    dossierQuery,
  ]);

  const handleAddCustomTag = useCallback(() => {
    const clean = customTag.trim().toUpperCase().replace(/\s+/g, '_');
    if (!clean) return;
    setCrmTags((prev) => (prev.includes(clean) ? prev : [...prev, clean]));
    setCustomTag('');
  }, [customTag]);

  const handleRotateQr = useCallback(async () => {
    if (!dossier) return;
    setError(null);
    setNotice(null);
    setRotatingQr(true);
    try {
      await rotateMemberQrPass(dossier.member.id);
      setNotice('Rotated wallet QR token — previous pass QR codes are invalidated.');
      dossierQuery.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not rotate QR pass.');
    } finally {
      setRotatingQr(false);
    }
  }, [dossier, dossierQuery]);

  const handleLogInteraction = useCallback(async () => {
    if (!dossier) return;
    setError(null);
    setNotice(null);
    setLoggingInteraction(true);
    try {
      await addCrmInteraction({
        memberId: dossier.member.id,
        branchId: interactionBranchId || null,
        channel,
        summary,
        followUpAt: followUpDate ? new Date(followUpDate).toISOString() : null,
      });
      setSummary('');
      setFollowUpDate('');
      setNotice('CRM touchpoint recorded on member timeline.');
      dossierQuery.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not log interaction.');
    } finally {
      setLoggingInteraction(false);
    }
  }, [dossier, interactionBranchId, channel, summary, followUpDate, dossierQuery]);

  const handleToggleFollowUp = useCallback(
    async (id: string, done: boolean) => {
      setError(null);
      try {
        await toggleCrmFollowUp(id, done);
        dossierQuery.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not update follow-up.');
      }
    },
    [dossierQuery],
  );

  if (dossierQuery.loading && !dossier) {
    return (
      <main className="min-h-screen bg-void px-5 py-16">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 font-mono type-ui text-ash">
          <Loader2 className="size-4 animate-spin" />
          Loading 360° member dossier...
        </div>
      </main>
    );
  }

  if (!dossier) {
    return (
      <main className="min-h-screen bg-void px-5 py-16">
        <div className="mx-auto max-w-4xl space-y-6">
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/crm">
              <ArrowLeft />
              Back to CRM
            </Link>
          </Button>
          <EmptyState
            title="Member record not found"
            description="This member ID does not exist or has been removed."
          />
        </div>
      </main>
    );
  }

  const {
    member,
    documents,
    orders,
    loyaltyLedger,
    creditLedger,
    loyaltyRules,
    affiliateCode,
    attributions,
    referrer,
    referrals,
    interactions,
  } = dossier;

  const engine = new DefaultLoyaltyEngine(loyaltyRules);
  const progress = engine.rankProgress(member.lifetime_value_cents);
  const age = ageInYears(new Date(`${member.date_of_birth}T00:00:00Z`));
  const pendingCommissionCents = attributions.reduce((s, a) => s + a.commission_cents, 0);

  return (
    <main className="min-h-screen bg-void pb-28 pt-12">
      <div className="container max-w-6xl space-y-8">
        {/* ---- Header ---------------------------------------------------- */}
        <header className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/crm">
                <ArrowLeft />
                Back to CRM
              </Link>
            </Button>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setQrOpen(true)}>
                <QrIcon className="size-3.5" />
                View QR Pass
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRotateQr}
                disabled={rotatingQr}
              >
                {rotatingQr ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                Rotate QR Token
              </Button>
              {member.status === 'ACTIVE_MEMBER' || member.status === 'VIP' ? (
                <Button asChild variant="gold" size="sm">
                  <Link href={`/admin/pos?member=${encodeURIComponent(member.member_code)}`}>
                    <ScanLine className="size-3.5" />
                    Open in POS
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="flex flex-col gap-3">
              <Eyebrow>
                {member.member_code} · Home:{' '}
                {branchNameById.get(member.home_branch_id ?? '') ?? 'Unassigned'}
              </Eyebrow>
              <h1 className="display-md text-white">
                {member.first_name} {member.last_name}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  tone={
                    member.status === 'SUSPENDED'
                      ? 'danger'
                      : member.status === 'VIP'
                        ? 'gold'
                        : member.status === 'ACTIVE_MEMBER'
                          ? 'live'
                          : 'warn'
                  }
                >
                  {member.status.replace('_', ' ')}
                </Badge>
                <Badge tone="mono">{RANK_LABEL[member.rank]}</Badge>
                <Badge tone={age >= LEGAL_AGE ? 'live' : 'danger'}>
                  {age} yrs · {age >= LEGAL_AGE ? `${LEGAL_AGE}+` : 'UNDERAGE'}
                </Badge>
                <Badge tone="mono">Pref: {UOM_LABEL[member.preferred_uom]}</Badge>
              </div>
            </div>

            <div className="flex flex-wrap gap-8">
              <Stat
                label="Lifetime Value"
                value={formatCents(member.lifetime_value_cents)}
                tone="gold"
              />
              <Stat label="Orders" value={member.order_count} />
              <Stat label="Points" value={member.points_balance.toLocaleString('en-ZA')} />
              <Stat label="Credit" value={formatCents(member.credit_balance_cents)} tone="gold" />
            </div>
          </div>
        </header>

        {/* ---- Feedback -------------------------------------------------- */}
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

        {/* ---- 360 Intelligence Row ------------------------------------- */}
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          {/* Left column: CRM Controls, Interactions, Identity, Orders */}
          <div className="flex flex-col gap-6">
            {/* Behavioral & Strain Affinity Intelligence */}
            {analytics ? (
              <Card className="flex flex-col gap-5 p-6">
                <div className="flex items-center justify-between">
                  <p className="font-display text-base uppercase text-white">
                    Purchasing &amp; Botanical Affinity
                  </p>
                  <span className="font-mono type-ui text-ash">
                    Last seen:{' '}
                    {member.last_seen_at
                      ? new Date(member.last_seen_at).toLocaleDateString('en-ZA')
                      : 'N/A'}
                  </span>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Stat
                    label="Avg Order Value"
                    value={formatCents(analytics.avgOrderCents)}
                    tone="gold"
                  />
                  <Stat
                    label="Channel Split"
                    value={`${analytics.posOrders} POS / ${analytics.onlineOrders} Web`}
                  />
                  <Stat
                    label="Top Category"
                    value={
                      analytics.topCategory
                        ? CATEGORY_LABEL[analytics.topCategory as keyof typeof CATEGORY_LABEL] ??
                          analytics.topCategory
                        : 'Pending Data'
                    }
                    tone="muted"
                  />
                  <Stat
                    label="Top Strain"
                    value={analytics.topStrain ?? 'Pending Data'}
                    tone="muted"
                  />
                </div>
                <div className="flex flex-wrap gap-4 font-mono type-ui text-ash">
                  <span>In-Store: {analytics.inStoreOrders}</span>
                  <span>Pickup: {analytics.pickupOrders}</span>
                  <span>Delivery: {analytics.deliveryOrders}</span>
                </div>
              </Card>
            ) : null}

            {/* CRM Profile Preferences, Tags & Concierge Notes */}
            <Card className="flex flex-col gap-5 p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-display text-base uppercase text-white">
                    CRM Profile, Branch &amp; Concierge Notes
                  </p>
                  <p className="type-ui text-ash">
                    Customise branch routing, preferred UOM, marketing consent, and segmentation tags.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="gold"
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                >
                  {savingProfile ? <Loader2 className="animate-spin" /> : <Save />}
                  Save CRM Profile
                </Button>
              </div>
              <Separator />

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Home Branch" htmlFor="dossier-branch">
                  <Select
                    id="dossier-branch"
                    value={homeBranchId}
                    onChange={(e) => setHomeBranchId(e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Preferred Dispensing UOM" htmlFor="dossier-uom">
                  <Select
                    id="dossier-uom"
                    value={preferredUom}
                    onChange={(e) => setPreferredUom(e.target.value as BaseUom)}
                  >
                    <option value="GRAMS">Grams (g)</option>
                    <option value="MILLILITERS">Milliliters (ml)</option>
                    <option value="UNITS">Units (ea)</option>
                  </Select>
                </Field>

                <Field label="Mobile / WhatsApp" htmlFor="dossier-phone">
                  <Input
                    id="dossier-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </Field>

                <Field label="Email Address" htmlFor="dossier-email">
                  <Input
                    id="dossier-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
              </div>

              <label className="flex items-center gap-2 font-mono type-ui text-white">
                <input
                  type="checkbox"
                  checked={marketingOptIn}
                  onChange={(e) => setMarketingOptIn(e.target.checked)}
                />
                Opted in for Reserve drops, VIP tastings &amp; WhatsApp concierge updates
              </label>

              {/* CRM Tags */}
              <div className="space-y-2.5">
                <p className="font-mono text-xs uppercase tracking-wider text-ash">
                  CRM Segmentation Tags
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(new Set([...PRESET_TAGS, ...crmTags])).map((tag) => {
                    const active = crmTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() =>
                          setCrmTags((prev) =>
                            prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
                          )
                        }
                        className={cn(
                          'inline-flex items-center gap-1 border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors',
                          active
                            ? 'border-gold bg-gold/15 text-gold'
                            : 'border-[color:var(--border-mono)] text-ash hover:text-white',
                        )}
                      >
                        <Tag className="size-3" />
                        {tag}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={customTag}
                    onChange={(e) => setCustomTag(e.target.value)}
                    placeholder="Add custom tag (e.g. ROSIN_CLUB)"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomTag();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={handleAddCustomTag}>
                    <Plus className="size-3.5" />
                    Add Tag
                  </Button>
                </div>
              </div>

              <Field label="Internal Concierge & Dispensary Notes" htmlFor="dossier-notes">
                <Textarea
                  id="dossier-notes"
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  className="min-h-20"
                  placeholder="Preferred terpenes, delivery security instructions, allocation notes..."
                />
              </Field>
            </Card>

            {/* CRM Interaction Timeline */}
            <Card className="flex flex-col gap-5 p-6">
              <div className="flex items-center justify-between">
                <p className="font-display text-base uppercase text-white">
                  Concierge &amp; Compliance Timeline
                </p>
                <Badge tone="mono">{interactions.length} logged</Badge>
              </div>
              <Separator />

              <div className="space-y-3 border border-[color:var(--border-mono)] bg-void p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Channel" htmlFor="int-channel">
                    <Select
                      id="int-channel"
                      value={channel}
                      onChange={(e) => setChannel(e.target.value as CrmInteractionChannel)}
                    >
                      {INTERACTION_CHANNELS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field label="Branch" htmlFor="int-branch">
                    <Select
                      id="int-branch"
                      value={interactionBranchId}
                      onChange={(e) => setInteractionBranchId(e.target.value)}
                    >
                      <option value="">All Branches</option>
                      {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field label="Schedule Follow-Up" htmlFor="int-followup">
                    <Input
                      id="int-followup"
                      type="datetime-local"
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                    />
                  </Field>
                </div>

                <Field label="Touchpoint Summary" htmlFor="int-summary">
                  <Textarea
                    id="int-summary"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    className="min-h-16"
                    placeholder="Logged tasting recommendation, KYC callback, or order concierge check-in..."
                  />
                </Field>

                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="gold"
                    onClick={handleLogInteraction}
                    disabled={loggingInteraction || summary.trim().length < 3}
                  >
                    {loggingInteraction ? <Loader2 className="animate-spin" /> : <Plus />}
                    Log Touchpoint
                  </Button>
                </div>
              </div>

              {interactions.length === 0 ? (
                <p className="font-mono type-ui text-ash">No interactions logged yet.</p>
              ) : (
                <div className="flex flex-col divide-y divide-[color:var(--border-mono)]">
                  {interactions.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-4 py-3.5">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="mono">{item.channel.replace('_', ' ')}</Badge>
                          {item.branch_id ? (
                            <span className="font-mono text-xs text-ash">
                              {branchNameById.get(item.branch_id) ?? 'Branch'}
                            </span>
                          ) : null}
                          <span className="font-mono text-xs text-ash">
                            {new Date(item.created_at).toLocaleString('en-ZA')}
                          </span>
                          {item.follow_up_at ? (
                            <Badge tone={item.follow_up_done ? 'live' : 'gold'}>
                              <Bell className="mr-1 size-3" />
                              {item.follow_up_done
                                ? 'Follow-up done'
                                : `Due ${new Date(item.follow_up_at).toLocaleDateString('en-ZA')}`}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="type-ui text-white">{item.summary}</p>
                      </div>

                      {item.follow_up_at ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleToggleFollowUp(item.id, !item.follow_up_done)}
                        >
                          <CheckCircle2 className="size-3.5" />
                          {item.follow_up_done ? 'Reopen' : 'Done'}
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Identity Record */}
            <Card className="flex flex-col gap-5 p-6">
              <p className="font-display text-base uppercase text-white">Identity Record</p>
              <Separator />
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
                <Stat label="Document" value={member.id_document_type.replace('_', ' ')} />
                <Stat
                  label={member.id_document_type === 'SA_ID' ? 'ID Number' : 'Passport'}
                  value={
                    member.id_document_type === 'SA_ID'
                      ? maskSaId(member.sa_id_number ?? '')
                      : `${member.passport_country ?? '—'} ${member.passport_number ?? ''}`
                  }
                  tone="muted"
                />
                <Stat label="Date of Birth" value={member.date_of_birth} tone="muted" />
                <Stat label="Nationality" value={member.nationality ?? '—'} tone="muted" />
                <Stat
                  label="Age Verified"
                  value={
                    member.age_verified_at
                      ? new Date(member.age_verified_at).toLocaleDateString('en-ZA')
                      : 'No'
                  }
                />
                <Stat
                  label="Agreement"
                  value={
                    member.agreement_signed_at
                      ? `v${member.agreement_version ?? '?'}`
                      : 'Unsigned'
                  }
                />
              </div>
              <p className="font-mono type-ui text-ash">
                SA ID numbers are masked in the CRM and excluded from directory search.
              </p>
            </Card>

            {/* KYC review */}
            <KycReviewPanel
              member={member}
              documents={documents}
              onUpdated={() => dossierQuery.refresh()}
            />

            {/* Recent Orders */}
            <Card className="flex flex-col gap-5 p-6">
              <div className="flex items-start justify-between gap-4">
                <p className="font-display text-base uppercase text-white">Recent Orders</p>
                <span className="font-mono type-ui text-ash">{orders.length} shown</span>
              </div>
              <Separator />
              {orders.length === 0 ? (
                <p className="font-mono type-ui text-ash">No orders recorded yet.</p>
              ) : (
                <div className="flex flex-col divide-y divide-[color:var(--border-mono)]">
                  {orders.slice(0, 12).map((order) => (
                    <div key={order.id} className="flex items-center justify-between gap-4 py-3">
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm text-white">
                            {order.order_number}
                          </span>
                          <Badge tone="mono">{order.channel}</Badge>
                          <Badge tone="mono">{order.fulfilment_type.replace('_', ' ')}</Badge>
                          <Badge
                            tone={
                              order.status === 'COMPLETED'
                                ? 'live'
                                : order.status === 'CANCELLED' || order.status === 'REFUNDED'
                                  ? 'danger'
                                  : 'warn'
                            }
                          >
                            {order.status}
                          </Badge>
                        </div>
                        <span className="font-mono type-ui text-ash">
                          {branchNameById.get(order.branch_id) ?? 'Branch'} ·{' '}
                          {new Date(order.created_at).toLocaleString('en-ZA')}
                        </span>
                      </div>
                      <span className="shrink-0 font-mono text-sm text-gold">
                        {formatCents(order.total_cents)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Right column: Rank, Affiliate Network, Wallet/Standing, Ledgers */}
          <div className="flex flex-col gap-6">
            {/* Loyalty Rank Progress */}
            <Card className="flex flex-col gap-4 p-6">
              <div className="flex items-start justify-between gap-4">
                <p className="font-display text-base uppercase text-white">Collective Rank</p>
                <Badge tone="gold">{RANK_LABEL[member.rank]}</Badge>
              </div>
              <Separator />
              <div className="space-y-2">
                <div className="flex justify-between font-mono type-ui text-ash">
                  <span>{formatCents(member.lifetime_value_cents)} LTV</span>
                  <span>
                    {progress.next && progress.centsToNext !== null
                      ? `Next: ${RANK_LABEL[progress.next]} (${formatCents(progress.centsToNext)})`
                      : 'Highest rank attained'}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden bg-void">
                  <div
                    className="h-full bg-gold transition-[width] duration-300 ease-out"
                    style={{ width: `${Math.round(progress.progress * 100)}%` }}
                  />
                </div>
              </div>
            </Card>

            {/* Affiliate & Referral Network */}
            <Card className="flex flex-col gap-4 p-6">
              <div className="flex items-start justify-between gap-4">
                <p className="font-display text-base uppercase text-white">
                  Affiliate &amp; Referral Graph
                </p>
                <Share2 className="size-4 text-gold" />
              </div>
              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <Stat label="Referral Code" value={member.referral_code} tone="gold" />
                <Stat
                  label="Commission Rate"
                  value={
                    affiliateCode
                      ? `${(affiliateCode.commission_bps / 100).toFixed(1)}%`
                      : 'Inactive'
                  }
                />
                <Stat label="Referred Signups" value={referrals.length} />
                <Stat
                  label="Unpaid Commission"
                  value={formatCents(pendingCommissionCents)}
                  tone={pendingCommissionCents > 0 ? 'gold' : 'muted'}
                />
              </div>

              {referrer ? (
                <div className="border border-[color:var(--border-mono)] bg-void p-3 font-mono type-ui">
                  <span className="text-ash">Referred by: </span>
                  <Link href={`/admin/crm/${referrer.id}`} className="text-gold hover:underline">
                    {referrer.first_name} {referrer.last_name} ({referrer.member_code})
                  </Link>
                </div>
              ) : member.referred_by_code ? (
                <p className="font-mono type-ui text-ash">
                  Referred by code: {member.referred_by_code}
                </p>
              ) : null}

              {referrals.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="font-mono text-xs uppercase tracking-wider text-ash">
                    Referred Members ({referrals.length})
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {referrals.slice(0, 6).map((ref) => (
                      <Link
                        key={ref.id}
                        href={`/admin/crm/${ref.id}`}
                        className="flex items-center justify-between border border-[color:var(--border-mono)] px-3 py-2 font-mono type-ui text-white hover:border-gold"
                      >
                        <span>
                          {ref.first_name} {ref.last_name}
                        </span>
                        <span className="text-gold">{formatCents(ref.lifetime_value_cents)}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </Card>

            {/* Manager Credit & Standing Controls */}
            <MemberAdminPanel
              member={member}
              onUpdated={() => dossierQuery.refresh()}
            />

            {/* Loyalty Points Ledger */}
            <Card className="flex flex-col gap-4 p-6">
              <p className="font-display text-base uppercase text-white">Loyalty Points Ledger</p>
              <Separator />
              {loyaltyLedger.length === 0 ? (
                <p className="font-mono type-ui text-ash">No points activity yet.</p>
              ) : (
                <div className="flex flex-col divide-y divide-[color:var(--border-mono)]">
                  {loyaltyLedger.slice(0, 8).map((row) => (
                    <div key={row.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate type-ui text-white">{row.reason}</p>
                        <p className="font-mono text-xs text-ash">
                          {new Date(row.created_at).toLocaleDateString('en-ZA')}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 font-mono text-sm',
                          row.points_delta >= 0 ? 'text-gold' : 'text-white',
                        )}
                      >
                        {row.points_delta >= 0 ? `+${row.points_delta}` : row.points_delta} pts
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Credit Wallet Ledger */}
            <Card className="flex flex-col gap-4 p-6">
              <p className="font-display text-base uppercase text-white">Store Credit Ledger</p>
              <Separator />
              {creditLedger.length === 0 ? (
                <p className="font-mono type-ui text-ash">No store credit adjustments yet.</p>
              ) : (
                <div className="flex flex-col divide-y divide-[color:var(--border-mono)]">
                  {creditLedger.slice(0, 8).map((row) => (
                    <div key={row.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate type-ui text-white">{row.reason}</p>
                        <p className="font-mono text-xs text-ash">
                          {new Date(row.created_at).toLocaleDateString('en-ZA')}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 font-mono text-sm',
                          row.delta_cents >= 0 ? 'text-gold' : 'text-white',
                        )}
                      >
                        {row.delta_cents >= 0
                          ? `+${formatCents(row.delta_cents)}`
                          : `-${formatCents(Math.abs(row.delta_cents))}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>

      {/* ---- Wallet QR Pass Modal ---------------------------------------- */}
      {qrOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Member wallet QR pass"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-md space-y-4">
            <div className="flex justify-end">
              <Button variant="surface" size="sm" onClick={() => setQrOpen(false)}>
                <X className="size-4" />
                Close
              </Button>
            </div>
            <CartelMemberQrPass member={member} />
          </div>
        </div>
      ) : null}
    </main>
  );
}
