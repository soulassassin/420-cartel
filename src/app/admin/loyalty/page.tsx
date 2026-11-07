'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Loader2,
  Percent,
  Trophy,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Badge, Card, EmptyState, Eyebrow, Separator } from '@/components/ui/surfaces';
import { formatCents } from '@/lib/money';
import { RANK_LABEL } from '@/lib/loyalty';
import {
  getLoyaltyRules,
  listAffiliateAttributions,
  listAffiliateCodes,
  saveLoyaltyRules,
  setAffiliateCommission,
  settleCommission,
} from '@/lib/data/source';
import { useCartelQuery } from '@/lib/data/useCartelQuery';
import type { MemberRank } from '@/types/database';

const RANK_ORDER: MemberRank[] = ['INITIATE', 'SOLDIER', 'CAPO', 'CONSIGLIERE'];

/**
 * Module H — Loyalty Engine Configuration & Affiliate Commission Ledger.
 *
 * Configures points accrual rates, redemption value, and rank thresholds
 * (`INITIATE`, `SOLDIER`, `CAPO`, `CONSIGLIERE`), and manages member affiliate
 * referral codes and commission settlements (`CREDIT` or `EFT`).
 */

export default function AdminLoyaltyPage() {
  const rulesQuery = useCartelQuery(() => getLoyaltyRules(), []);
  const codesQuery = useCartelQuery(() => listAffiliateCodes(), []);
  const attributionsQuery = useCartelQuery(() => listAffiliateAttributions(), []);

  const [pointsPer100Cents, setPointsPer100Cents] = useState('1');
  const [pointValueCents, setPointValueCents] = useState('500');
  const [minRedeemPoints, setMinRedeemPoints] = useState('20');
  const [thresholds, setThresholds] = useState<Record<MemberRank, string>>({
    INITIATE: '0',
    SOLDIER: '5000',
    CAPO: '20000',
    CONSIGLIERE: '60000',
  });
  // Affiliate-side parameters, added by migration 0005.
  const [defaultCommissionBps, setDefaultCommissionBps] = useState('500');
  const [referralWindowDays, setReferralWindowDays] = useState('30');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const r = rulesQuery.data;
    if (!r) return;
    setPointsPer100Cents(String(r.points_per_100_cents));
    setPointValueCents(String(r.point_value_cents));
    setMinRedeemPoints(String(r.min_redeem_points));
    setThresholds({
      INITIATE: String(Math.round((r.rank_thresholds.INITIATE ?? 0) / 100)),
      SOLDIER: String(Math.round((r.rank_thresholds.SOLDIER ?? 500_000) / 100)),
      CAPO: String(Math.round((r.rank_thresholds.CAPO ?? 2_000_000) / 100)),
      CONSIGLIERE: String(Math.round((r.rank_thresholds.CONSIGLIERE ?? 6_000_000) / 100)),
    });
    setDefaultCommissionBps(String(r.default_commission_bps ?? 500));
    setReferralWindowDays(String(r.referral_window_days ?? 30));
  }, [rulesQuery.data]);

  const handleSaveRules = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await saveLoyaltyRules({
        points_per_100_cents: Math.max(1, Number.parseInt(pointsPer100Cents, 10) || 1),
        point_value_cents: Math.max(1, Number.parseInt(pointValueCents, 10) || 500),
        min_redeem_points: Math.max(1, Number.parseInt(minRedeemPoints, 10) || 20),
        rank_thresholds: {
          INITIATE: Math.max(0, (Number.parseInt(thresholds.INITIATE, 10) || 0) * 100),
          SOLDIER: Math.max(0, (Number.parseInt(thresholds.SOLDIER, 10) || 5000) * 100),
          CAPO: Math.max(0, (Number.parseInt(thresholds.CAPO, 10) || 20000) * 100),
          CONSIGLIERE: Math.max(0, (Number.parseInt(thresholds.CONSIGLIERE, 10) || 60000) * 100),
        },
        // Clamped to the CHECK constraints in migration 0005, so a slip in the
        // form surfaces as a corrected value rather than a Postgres error.
        default_commission_bps: Math.min(
          10_000,
          Math.max(0, Number.parseInt(defaultCommissionBps, 10) || 0),
        ),
        referral_window_days: Math.min(
          365,
          Math.max(1, Number.parseInt(referralWindowDays, 10) || 30),
        ),
      });
      setNotice('Loyalty engine rules saved and member ranks re-evaluated.');
      rulesQuery.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to save loyalty rules.');
    } finally {
      setSaving(false);
    }
  }, [
    pointsPer100Cents,
    pointValueCents,
    minRedeemPoints,
    thresholds,
    defaultCommissionBps,
    referralWindowDays,
    rulesQuery,
  ]);

  const handleUpdateBps = useCallback(
    async (codeId: string, bps: number) => {
      try {
        const updated = await setAffiliateCommission(codeId, bps);
        setNotice(
          `Updated ${updated.code} commission rate to ${(updated.commission_bps / 100).toFixed(1)}%.`,
        );
        codesQuery.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not update commission.');
      }
    },
    [codesQuery],
  );

  const handleSettle = useCallback(
    async (attributionId: string, mode: 'CREDIT' | 'EFT') => {
      try {
        await settleCommission(attributionId, mode);
        setNotice(
          mode === 'CREDIT'
            ? 'Converted affiliate commission into member store credit.'
            : 'Recorded EFT payout for affiliate commission.',
        );
        attributionsQuery.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not settle commission.');
      }
    },
    [attributionsQuery],
  );

  return (
    <main className="min-h-screen bg-void pb-28 pt-12">
      <div className="container">
        <header>
          <Eyebrow>Back Office · Module H</Eyebrow>
          <h1 className="mt-2 display-md text-white">
            Loyalty & <span className="gold-text">Affiliates</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Configure collective points accrual, rank lifetime-value thresholds, and referral
            commission settlements.
          </p>
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

        <div className="mt-8 grid gap-6 lg:grid-cols-12">
          {/* Loyalty Rules Configurator */}
          <Card className="space-y-6 p-6 lg:col-span-6">
            <div className="flex items-center justify-between">
              <div>
                <Eyebrow>Loyalty Rules Engine</Eyebrow>
                <h2 className="mt-1 font-display text-lg uppercase text-white">
                  Accrual & Rank Thresholds
                </h2>
              </div>
              <Trophy className="size-5 text-gold" />
            </div>

            {/*
              Module 7 ships the mechanism with the numbers deliberately
              provisional: every figure on this panel is a parameter, not a
              hard-coded rule, and `process_cartel_order` reads the saved row
              rather than any constant in the app.
            */}
            <div className="border border-gold/50 bg-gold/[0.07] px-4 py-3">
              <p className="font-mono text-[0.5625rem] uppercase tracking-[0.24em] text-gold">
                Rule Parameters Ready for Final Calibration
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Accrual, point value, rank thresholds, commission and the referral
                window are all tunable here. Saving re-evaluates member ranks and
                takes effect on the next order — no deploy, no migration.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Pts per R1.00" htmlFor="lr_pts">
                <Input
                  id="lr_pts"
                  type="number"
                  value={pointsPer100Cents}
                  onChange={(e) => setPointsPer100Cents(e.target.value)}
                  className="font-mono"
                />
              </Field>
              <Field label="Pt Value (cents)" htmlFor="lr_val">
                <Input
                  id="lr_val"
                  type="number"
                  value={pointValueCents}
                  onChange={(e) => setPointValueCents(e.target.value)}
                  className="font-mono"
                />
              </Field>
              <Field label="Min Redeem Pts" htmlFor="lr_min">
                <Input
                  id="lr_min"
                  type="number"
                  value={minRedeemPoints}
                  onChange={(e) => setMinRedeemPoints(e.target.value)}
                  className="font-mono"
                />
              </Field>
              <Field
                label="Default Commission"
                htmlFor="lr_bps"
                hint={`${(Number.parseInt(defaultCommissionBps, 10) || 0) / 100}%`}
              >
                <Input
                  id="lr_bps"
                  type="number"
                  value={defaultCommissionBps}
                  onChange={(e) => setDefaultCommissionBps(e.target.value)}
                  className="font-mono"
                />
              </Field>
              <Field label="Referral Window (days)" htmlFor="lr_window">
                <Input
                  id="lr_window"
                  type="number"
                  value={referralWindowDays}
                  onChange={(e) => setReferralWindowDays(e.target.value)}
                  className="font-mono"
                />
              </Field>
            </div>

            <Separator />

            <div>
              <Eyebrow>Lifetime Value Rank Thresholds (ZAR)</Eyebrow>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {RANK_ORDER.map((rank) => (
                  <Field key={rank} label={RANK_LABEL[rank]} htmlFor={`rank_${rank}`}>
                    <Input
                      id={`rank_${rank}`}
                      type="number"
                      value={thresholds[rank]}
                      onChange={(e) =>
                        setThresholds((curr) => ({ ...curr, [rank]: e.target.value }))
                      }
                      className="font-mono"
                    />
                  </Field>
                ))}
              </div>
            </div>

            <Button variant="gold" disabled={saving} onClick={() => void handleSaveRules()}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Save Rules & Re-Rank Members
            </Button>
          </Card>

          {/* Affiliate Leaderboard & Commission Settlement */}
          <div className="space-y-6 lg:col-span-6">
            <Card className="space-y-4 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <Eyebrow>Referral Network</Eyebrow>
                  <h2 className="mt-1 font-display text-lg uppercase text-white">
                    Active Affiliate Codes
                  </h2>
                </div>
                <Badge tone="gold">{(codesQuery.data ?? []).length} Codes</Badge>
              </div>

              <div className="divide-y divide-[color:var(--border-mono)]">
                {(codesQuery.data ?? []).map((code) => (
                  <div
                    key={code.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div>
                      <p className="font-mono text-sm text-gold">{code.code}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {code.label ?? 'Member Referral'} · {code.signup_count} signups ·{' '}
                        {code.order_count} orders
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {[500, 750, 1000].map((bps) => (
                        <Button
                          key={bps}
                          variant={code.commission_bps === bps ? 'active' : 'outline'}
                          size="sm"
                          onClick={() => void handleUpdateBps(code.id, bps)}
                        >
                          <Percent className="size-3" />
                          {(bps / 100).toFixed(1)}%
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="space-y-4 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <Eyebrow>Unsettled Referrals</Eyebrow>
                  <h2 className="mt-1 font-display text-lg uppercase text-white">
                    Commission Payout Queue
                  </h2>
                </div>
                <Badge tone="live">{(attributionsQuery.data ?? []).length} Pending</Badge>
              </div>

              {(attributionsQuery.data ?? []).length === 0 ? (
                <EmptyState
                  title="All referral commissions settled"
                  description="When a referred member places an order, their referrer's commission appears here for store credit conversion or EFT payout."
                />
              ) : (
                <div className="divide-y divide-[color:var(--border-mono)]">
                  {(attributionsQuery.data ?? []).map((attr) => (
                    <div
                      key={attr.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3 font-mono text-xs"
                    >
                      <div>
                        <p className="text-gold">{formatCents(attr.commission_cents)}</p>
                        <p className="text-[0.625rem] text-muted-foreground">
                          Order {attr.order_id?.slice(0, 8) ?? '—'} ·{' '}
                          {new Date(attr.created_at).toLocaleDateString('en-ZA')}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="gold"
                          size="sm"
                          onClick={() => void handleSettle(attr.id, 'CREDIT')}
                        >
                          <Wallet className="size-3.5" />
                          To Credit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleSettle(attr.id, 'EFT')}
                        >
                          Mark EFT Paid
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
