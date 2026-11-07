'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CreditCard,
  Loader2,
  Lock,
  MapPin,
  Printer,
  ShieldCheck,
  Sparkles,
  Truck,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Label, Textarea } from '@/components/ui/field';
import { Badge, Card, EmptyState, Eyebrow, Separator } from '@/components/ui/surfaces';
import { QrCode } from '@/components/ui/QrCode';
import { formatCents } from '@/lib/money';
import { exVatCents, vatPortionCents } from '@/lib/pricing';
import { UOM_PRECISION, UOM_SYMBOL, formatBaseQty } from '@/lib/uom';
import {
  IS_LOCAL_PREVIEW,
  getLoyaltyRules,
  listBranches,
  listMembers,
  processOrder,
  resolveDeliveryZone,
} from '@/lib/data/source';
import { useCartelQuery } from '@/lib/data/useCartelQuery';
import { DEFAULT_BRANCH_ID } from '@/lib/demo/fixtures';
import {
  cartLineBaseQty,
  cartLineTotalCents,
  selectCartSubtotalCents,
  selectCartUomTotals,
  selectOrderItems,
  useCartStore,
} from '@/lib/store/cart';
import { isVerifiedMember, useSessionStore } from '@/lib/store/session';
import { LEGAL_AGE } from '@/lib/sa-id';
import { cn } from '@/lib/utils';
import type {
  BaseUom,
  PaymentMethod,
  ProcessOrderResult,
  ResolvedDeliveryZone,
} from '@/types/database';

/**
 * Module C/D — Member Checkout, Click & Collect & Johannesburg Radius Delivery.
 *
 * Resolves delivery zones via `resolveDeliveryZone` (Haversine distance against
 * the Sandton Vault hub), validates minimum order and free-delivery thresholds,
 * applies loyalty points redemption or store credit tender, and executes the
 * atomic `processOrder` transaction.
 */

interface AddressPreset {
  label: string;
  suburb: string;
  address: string;
  lat: number;
  lng: number;
}

const JOBURG_PRESETS: AddressPreset[] = [
  {
    label: 'Sandton Central (2.1 km)',
    suburb: 'Sandton',
    address: '24 Fredman Drive, Sandton, Johannesburg, 2196',
    lat: -26.1052,
    lng: 28.056,
  },
  {
    label: 'Rosebank Art Mile (5.8 km)',
    suburb: 'Rosebank',
    address: '19 Keyes Avenue, Rosebank, Johannesburg, 2196',
    lat: -26.1467,
    lng: 28.0416,
  },
  {
    label: 'Fourways / Bryanston (12.4 km)',
    suburb: 'Bryanston',
    address: '298 Main Road, Bryanston, Sandton, 2191',
    lat: -26.0521,
    lng: 28.0214,
  },
  {
    label: 'Midrand / Waterfall (19.6 km)',
    suburb: 'Waterfall City',
    address: '1 Lone Creek Crescent, Waterfall City, Midrand, 1685',
    lat: -26.0122,
    lng: 28.1058,
  },
];

const PAYMENT_OPTIONS: {
  method: PaymentMethod;
  provider: string;
  label: string;
  sub: string;
}[] = [
  {
    method: 'CARD_TERMINAL',
    provider: 'yoco',
    label: 'Yoco Instant Card / Apple Pay',
    sub: '3D-Secure ZAR settlement',
  },
  {
    method: 'EFT_INSTANT',
    provider: 'payfast',
    label: 'PayFast Instant EFT',
    sub: 'Capitec Pay, FNB, Standard Bank, Nedbank, Absa',
  },
  {
    method: 'MEMBER_CREDIT',
    provider: 'in-house',
    label: 'Member Vault Credit',
    sub: 'Draw directly from your collective credit ledger',
  },
];

const UOM_ORDER: BaseUom[] = ['GRAMS', 'MILLILITERS', 'UNITS'];

export default function CheckoutPage() {
  const member = useSessionStore((state) => state.member);
  const signIn = useSessionStore((state) => state.signIn);
  const syncMember = useSessionStore((state) => state.syncMember);

  const lines = useCartStore((state) => state.lines);
  const branchId = useCartStore((state) => state.branchId) ?? DEFAULT_BRANCH_ID;
  const fulfilment = useCartStore((state) => state.fulfilment);
  const setFulfilment = useCartStore((state) => state.setFulfilment);
  const deliveryAddress = useCartStore((state) => state.deliveryAddress) ?? '';
  const deliverySuburb = useCartStore((state) => state.deliverySuburb) ?? '';
  const deliveryLat = useCartStore((state) => state.deliveryLat);
  const deliveryLng = useCartStore((state) => state.deliveryLng);
  const deliveryInstructions = useCartStore((state) => state.deliveryInstructions);
  const setDelivery = useCartStore((state) => state.setDelivery);
  const setDeliveryInstructions = useCartStore((state) => state.setDeliveryInstructions);
  const pointsToRedeem = useCartStore((state) => state.pointsToRedeem);
  const setPointsToRedeem = useCartStore((state) => state.setPointsToRedeem);
  const clearCart = useCartStore((state) => state.clear);

  const subtotalCents = useCartStore(selectCartSubtotalCents);
  const uomTotals = useCartStore(selectCartUomTotals);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CARD_TERMINAL');
  const [pickupWindow, setPickupWindow] = useState<'NOW_60' | 'THIS_EVENING' | 'TOMORROW_NOON'>(
    'NOW_60',
  );
  const [zone, setZone] = useState<ResolvedDeliveryZone | null>(null);
  const [zoneLoading, setZoneLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ProcessOrderResult | null>(null);

  const branchesQuery = useCartelQuery(() => listBranches(), []);
  const rulesQuery = useCartelQuery(() => getLoyaltyRules(), []);

  const activeBranch = useMemo(
    () =>
      (branchesQuery.data ?? []).find((b) => b.id === branchId) ??
      branchesQuery.data?.[0] ??
      null,
    [branchesQuery.data, branchId],
  );

  // Resolve delivery zone whenever coordinates or branch change
  useEffect(() => {
    if (fulfilment !== 'DELIVERY' || deliveryLat === null || deliveryLng === null) {
      setZone(null);
      return;
    }
    let cancelled = false;
    setZoneLoading(true);
    void resolveDeliveryZone(branchId, deliveryLat, deliveryLng)
      .then((resolved) => {
        if (!cancelled) setZone(resolved);
      })
      .catch(() => {
        if (!cancelled) setZone(null);
      })
      .finally(() => {
        if (!cancelled) setZoneLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId, fulfilment, deliveryLat, deliveryLng]);

  const rules = rulesQuery.data;
  const maxRedeemablePoints = useMemo(() => {
    if (!member || !rules) return 0;
    if (member.points_balance < rules.min_redeem_points) return 0;
    const maxBySubtotal = Math.floor(subtotalCents / Math.max(1, rules.point_value_cents));
    return Math.min(member.points_balance, maxBySubtotal);
  }, [member, rules, subtotalCents]);

  const discountCents = useMemo(() => {
    if (!rules || pointsToRedeem <= 0) return 0;
    return Math.min(subtotalCents, pointsToRedeem * rules.point_value_cents);
  }, [rules, pointsToRedeem, subtotalCents]);

  const deliveryFeeCents = useMemo(() => {
    if (fulfilment !== 'DELIVERY' || !zone) return 0;
    if (zone.free_over_cents !== null && subtotalCents >= zone.free_over_cents) return 0;
    return zone.fee_cents;
  }, [fulfilment, zone, subtotalCents]);

  const totalCents = Math.max(0, subtotalCents - discountCents + deliveryFeeCents);

  const simulateVerified = useCallback(async () => {
    const rows = await listMembers();
    const demo =
      rows.find((row) => row.member_code === 'CARTEL-0420') ??
      rows.find((row) => isVerifiedMember(row));
    if (demo) signIn(demo, true);
  }, [signIn]);

  const selectPreset = useCallback(
    (preset: AddressPreset) => {
      setDelivery({
        address: preset.address,
        suburb: preset.suburb,
        lat: preset.lat,
        lng: preset.lng,
      });
    },
    [setDelivery],
  );

  const handleCompleteOrder = useCallback(async () => {
    if (!member || !isVerifiedMember(member)) {
      setError('Please sign in with a verified 18+ member pass before completing an allocation.');
      return;
    }
    if (lines.length === 0) {
      setError('Your crate is empty.');
      return;
    }
    if (fulfilment === 'DELIVERY') {
      if (!deliveryAddress || deliveryLat === null || deliveryLng === null) {
        setError('Select a Johannesburg delivery address within the vault radius.');
        return;
      }
      if (!zone) {
        setError('That address falls outside the active Sandton delivery radius.');
        return;
      }
      if (subtotalCents < zone.min_order_cents) {
        setError(
          `${zone.zone_name} requires a minimum allocation of ${formatCents(zone.min_order_cents)}.`,
        );
      }
    }

    setSubmitting(true);
    setError(null);

    const now = Date.now();
    const slotOffsets: readonly [number, number] = {
      NOW_60: [15 * 60_000, 75 * 60_000] as const,
      THIS_EVENING: [3 * 3600_000, 5 * 3600_000] as const,
      TOMORROW_NOON: [20 * 3600_000, 22 * 3600_000] as const,
    }[pickupWindow];

    const providerOption = PAYMENT_OPTIONS.find((opt) => opt.method === paymentMethod);

    try {
      const result = await processOrder({
        channel: 'ONLINE',
        fulfilment_type: fulfilment === 'DELIVERY' ? 'DELIVERY' : 'PICKUP',
        branch_id: branchId,
        member_id: member.id,
        items: selectOrderItems(useCartStore.getState()),
        points_redeemed: pointsToRedeem,
        referral_code: member.referred_by_code ?? undefined,
        ...(fulfilment === 'DELIVERY' && deliveryLat !== null && deliveryLng !== null
          ? {
              delivery: {
                address: deliveryAddress,
                suburb: deliverySuburb || undefined,
                lat: deliveryLat,
                lng: deliveryLng,
                instructions: deliveryInstructions || undefined,
              },
            }
          : {
              pickup_slot_start: new Date(now + slotOffsets[0]).toISOString(),
              pickup_slot_end: new Date(now + slotOffsets[1]).toISOString(),
            }),
        payments: [
          {
            method: paymentMethod,
            amount_cents: totalCents,
            provider: providerOption?.provider ?? 'yoco',
            provider_ref: `ZAF-${Date.now().toString(36).toUpperCase()}`,
          },
        ],
        idempotency_key: `web-${member.id}-${now}`,
      });

      setReceipt(result);
      clearCart();

      // Refresh member balance
      const freshMembers = await listMembers();
      const updated = freshMembers.find((row) => row.id === member.id);
      if (updated) syncMember(updated);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Allocation could not be completed.');
    } finally {
      setSubmitting(false);
    }
  }, [
    member,
    lines.length,
    fulfilment,
    deliveryAddress,
    deliveryLat,
    deliveryLng,
    zone,
    subtotalCents,
    pickupWindow,
    paymentMethod,
    branchId,
    pointsToRedeem,
    deliverySuburb,
    deliveryInstructions,
    totalCents,
    clearCart,
    syncMember,
  ]);

  // --- Receipt view after order completes ---------------------------------
  if (receipt) {
    return (
      <main className="relative min-h-screen bg-void pb-32 pt-14">
        <div className="container max-w-2xl">
          <Card className="border-gold/50 p-6 sm:p-10">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <Badge tone="live">
                  <Check className="size-3" />
                  Allocation Confirmed
                </Badge>
                <h1 className="mt-3 font-display text-3xl uppercase tracking-wide text-white">
                  Order <span className="gold-text">{receipt.order_number}</span>
                </h1>
                <p className="mt-1 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {receipt.fulfilment_type.replace(/_/g, ' ')} · Status: {receipt.status}
                </p>
              </div>
              <QrCode value={receipt.order_number} size={96} />
            </div>

            <Separator className="my-6" />

            <div className="space-y-3">
              <Eyebrow>Allocated Lines & Batch Traceability</Eyebrow>
              {receipt.items.map((item, idx) => (
                <div
                  key={`${item.product_name}-${idx}`}
                  className="flex flex-col gap-1 border border-[color:var(--border-mono)] bg-void/60 p-3.5"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-display text-sm uppercase text-white">
                      {item.quantity}× {item.product_name} ({item.variant_label})
                    </span>
                    <span className="font-mono text-sm tabular-nums text-gold">
                      {formatCents(item.line_total_cents)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[0.625rem] uppercase tracking-[0.16em] text-faint">
                    <span>
                      Deducted: {formatBaseQty(item.base_qty, item.base_uom)} from vault
                    </span>
                    <span>
                      Batches:{' '}
                      {item.batch_allocation
                        .map((b) => `${b.batch_code} (${formatBaseQty(b.base_qty, item.base_uom)})`)
                        .join(', ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <Separator className="my-6" />

            <dl className="space-y-2 font-mono text-xs">
              <div className="flex justify-between text-muted-foreground">
                <dt>Subtotal</dt>
                <dd className="tabular-nums">{formatCents(receipt.subtotal_cents)}</dd>
              </div>
              {receipt.discount_cents > 0 ? (
                <div className="flex justify-between text-emerald-300">
                  <dt>Loyalty / Member Discount</dt>
                  <dd className="tabular-nums">-{formatCents(receipt.discount_cents)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between text-muted-foreground">
                <dt>Courier / Dispatch Fee</dt>
                <dd className="tabular-nums">
                  {receipt.delivery_fee_cents === 0
                    ? 'COMPLIMENTARY'
                    : formatCents(receipt.delivery_fee_cents)}
                </dd>
              </div>
              <div className="flex justify-between text-faint">
                <dt>15% SA VAT Included</dt>
                <dd className="tabular-nums">{formatCents(vatPortionCents(receipt.total_cents))}</dd>
              </div>
              <div className="flex justify-between border-t border-[color:var(--border-mono)] pt-3 text-base text-white">
                <dt className="uppercase tracking-[0.2em]">Total Settled</dt>
                <dd className="tabular-nums text-gold">{formatCents(receipt.total_cents)}</dd>
              </div>
            </dl>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border border-gold/30 bg-gold/5 px-4 py-3 font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-gold">
              <span>+{receipt.points_earned} Loyalty Points Accrued</span>
              {receipt.points_redeemed > 0 ? (
                <span>-{receipt.points_redeemed} Points Redeemed</span>
              ) : null}
            </div>

            <div className="mt-8 flex flex-wrap gap-3 print:hidden">
              <Button variant="gold" size="lg" asChild>
                <Link href="/shop">
                  Return to Dispensary
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" onClick={() => window.print()}>
                <Printer className="size-4" />
                Print Allocation Docket
              </Button>
            </div>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-void pb-32 pt-14">
      <div className="container">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Eyebrow>Private Allocation Settlement</Eyebrow>
            <h1 className="mt-2 display-md text-white">
              Vault <span className="gold-text">Checkout</span>
            </h1>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/shop">
              <ArrowLeft className="size-4" />
              Back to Reserve
            </Link>
          </Button>
        </div>

        {!isVerifiedMember(member) ? (
          <Card className="mt-8 flex flex-wrap items-center justify-between gap-4 border-gold/40 p-6">
            <div className="flex items-center gap-3">
              <Lock className="size-5 text-gold" />
              <div>
                <p className="font-display text-sm uppercase tracking-wider text-white">
                  {LEGAL_AGE}+ Member Verification Required
                </p>
                <p className="text-xs text-muted-foreground">
                  Sign in with your member pass or simulate CARTEL-0420 to test checkout.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="gold" size="sm" onClick={() => void simulateVerified()}>
                <Sparkles className="size-3.5" />
                Simulate CARTEL-0420
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/onboarding">Complete {LEGAL_AGE}+ Onboarding</Link>
              </Button>
            </div>
          </Card>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="mt-6 border border-destructive/60 bg-destructive/10 px-4 py-3 font-mono text-xs text-red-300"
          >
            {error}
          </p>
        ) : null}

        {lines.length === 0 ? (
          <div className="mt-10">
            <EmptyState
              title="Your vault crate is empty"
              description="Allocate flower, solventless extracts or sublingual elixirs from the dispensary before proceeding to settlement."
              action={
                <Button variant="gold" asChild>
                  <Link href="/shop">Browse the Reserve</Link>
                </Button>
              }
            />
          </div>
        ) : (
          <div className="mt-10 grid gap-8 lg:grid-cols-12">
            {/* Left column: Fulfilment + Tender */}
            <div className="space-y-6 lg:col-span-7">
              <Card className="space-y-6 p-6">
                <div>
                  <Eyebrow>Step 01 · Fulfilment Mode</Eyebrow>
                  <h2 className="mt-2 font-display text-lg uppercase tracking-wide text-white">
                    Click & Collect or Discreet Courier
                  </h2>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant={fulfilment === 'PICKUP' ? 'active' : 'surface'}
                    onClick={() => setFulfilment('PICKUP')}
                    className="h-14 justify-start gap-3 px-4"
                  >
                    <Building2 className="size-4 text-gold" />
                    <div className="text-left">
                      <div className="text-[0.6875rem]">Click & Collect</div>
                      <div className="text-[0.5625rem] text-muted-foreground">
                        Sandton Vault Lounge
                      </div>
                    </div>
                  </Button>

                  <Button
                    type="button"
                    variant={fulfilment === 'DELIVERY' ? 'active' : 'surface'}
                    onClick={() => {
                      setFulfilment('DELIVERY');
                      const firstPreset = JOBURG_PRESETS[0];
                      if (deliveryLat === null && firstPreset) {
                        selectPreset(firstPreset);
                      }
                    }}
                    className="h-14 justify-start gap-3 px-4"
                  >
                    <Truck className="size-4 text-gold" />
                    <div className="text-left">
                      <div className="text-[0.6875rem]">Private Courier</div>
                      <div className="text-[0.5625rem] text-muted-foreground">
                        Johannesburg Radius
                      </div>
                    </div>
                  </Button>
                </div>

                {fulfilment === 'PICKUP' ? (
                  <div className="space-y-4 border-t border-[color:var(--border-mono)] pt-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-mono text-xs uppercase tracking-[0.18em] text-gold">
                          {activeBranch?.name ?? 'Sandton Vault & Lounge'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {activeBranch?.address_line ?? '14 Alice Lane, Sandhurst'},{' '}
                          {activeBranch?.city ?? 'Johannesburg'}
                        </p>
                      </div>
                      <Badge tone="gold">No Fee</Badge>
                    </div>

                    <div>
                      <Label>Preferred Collection Window</Label>
                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        {(
                          [
                            ['NOW_60', 'Express (Next 60m)'],
                            ['THIS_EVENING', 'Evening (17:00–19:00)'],
                            ['TOMORROW_NOON', 'Tomorrow (12:00–14:00)'],
                          ] as const
                        ).map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setPickupWindow(key)}
                            className={cn(
                              'border px-3 py-2.5 text-left font-mono text-[0.625rem] uppercase tracking-[0.16em] transition-colors',
                              pickupWindow === key
                                ? 'border-gold bg-gold/10 text-gold'
                                : 'border-[color:var(--border-mono)] text-muted-foreground hover:border-gold/40',
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5 border-t border-[color:var(--border-mono)] pt-5">
                    <div>
                      <Label>Johannesburg Quick-Zone Presets (Haversine Radius Resolver)</Label>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {JOBURG_PRESETS.map((preset) => {
                          const active = deliveryAddress === preset.address;
                          return (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() => selectPreset(preset)}
                              className={cn(
                                'flex items-center justify-between border px-3 py-2.5 text-left font-mono text-[0.625rem] uppercase tracking-[0.14em] transition-colors',
                                active
                                  ? 'border-gold bg-gold/10 text-gold'
                                  : 'border-[color:var(--border-mono)] text-muted-foreground hover:border-gold/40',
                              )}
                            >
                              <span>{preset.label}</span>
                              <MapPin className="size-3.5 shrink-0" />
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field
                        label="Street Address"
                        htmlFor="delivery_address"
                        className="sm:col-span-2"
                      >
                        <Input
                          id="delivery_address"
                          value={deliveryAddress}
                          onChange={(e) =>
                            setDelivery({
                              address: e.target.value,
                              suburb: deliverySuburb || 'Sandton',
                              lat: deliveryLat ?? -26.1052,
                              lng: deliveryLng ?? 28.056,
                            })
                          }
                          placeholder="24 Fredman Drive, Sandton"
                        />
                      </Field>
                      <Field label="Suburb" htmlFor="delivery_suburb">
                        <Input
                          id="delivery_suburb"
                          value={deliverySuburb}
                          onChange={(e) =>
                            setDelivery({
                              address: deliveryAddress,
                              suburb: e.target.value,
                              lat: deliveryLat ?? -26.1052,
                              lng: deliveryLng ?? 28.056,
                            })
                          }
                          placeholder="Sandton"
                        />
                      </Field>
                    </div>

                    <Field label="Gate Code / Discreet Handover Notes" htmlFor="delivery_notes">
                      <Textarea
                        id="delivery_notes"
                        rows={2}
                        value={deliveryInstructions}
                        onChange={(e) => setDeliveryInstructions(e.target.value)}
                        placeholder="Gate code, security desk instructions..."
                      />
                    </Field>

                    {/* Resolved Zone Banner */}
                    {zoneLoading ? (
                      <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" />
                        Calculating vault distance...
                      </div>
                    ) : zone ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 border border-emerald-500/40 bg-emerald-500/[0.06] px-4 py-3">
                        <div>
                          <p className="font-mono text-xs uppercase tracking-[0.18em] text-emerald-300">
                            {zone.zone_name} · {zone.distance_km} km from Sandton Hub
                          </p>
                          <p className="mt-0.5 font-mono text-[0.625rem] uppercase tracking-[0.16em] text-muted-foreground">
                            ETA ~{zone.eta_minutes} mins · Min order{' '}
                            {formatCents(zone.min_order_cents)}
                            {zone.free_over_cents
                              ? ` · Free over ${formatCents(zone.free_over_cents)}`
                              : ''}
                          </p>
                        </div>
                        <Badge tone="live">
                          {deliveryFeeCents === 0 ? 'Free Courier' : formatCents(deliveryFeeCents)}
                        </Badge>
                      </div>
                    ) : (
                      <div className="border border-amber-500/50 bg-amber-500/10 px-4 py-3 font-mono text-xs text-amber-300">
                        Select a preset or enter coordinates within the 25 km Johannesburg radius.
                      </div>
                    )}
                  </div>
                )}
              </Card>

              {/* Step 2: Payment & Loyalty */}
              <Card className="space-y-6 p-6">
                <div>
                  <Eyebrow>Step 02 · Settlement & Loyalty</Eyebrow>
                  <h2 className="mt-2 font-display text-lg uppercase tracking-wide text-white">
                    South African Tender & Points
                  </h2>
                </div>

                {member && rules ? (
                  <div className="border border-[color:var(--border-mono)] bg-void/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-mono text-xs uppercase tracking-[0.18em] text-gold">
                          Loyalty Balance: {member.points_balance.toLocaleString('en-ZA')} pts
                        </p>
                        <p className="mt-0.5 font-mono text-[0.625rem] uppercase tracking-[0.16em] text-muted-foreground">
                          1 pt = {formatCents(rules.point_value_cents)} · Min redeem{' '}
                          {rules.min_redeem_points} pts
                        </p>
                      </div>
                      {maxRedeemablePoints >= rules.min_redeem_points ? (
                        <Button
                          type="button"
                          variant={pointsToRedeem > 0 ? 'active' : 'outline'}
                          size="sm"
                          onClick={() =>
                            setPointsToRedeem(pointsToRedeem > 0 ? 0 : maxRedeemablePoints)
                          }
                        >
                          {pointsToRedeem > 0
                            ? `Redeeming ${pointsToRedeem} pts (-${formatCents(discountCents)})`
                            : `Redeem ${maxRedeemablePoints} pts`}
                        </Button>
                      ) : (
                        <Badge tone="mono">Min {rules.min_redeem_points} pts</Badge>
                      )}
                    </div>
                  </div>
                ) : null}

                <div className="space-y-2.5">
                  {PAYMENT_OPTIONS.map((option) => {
                    const active = paymentMethod === option.method;
                    const insufficientCredit =
                      option.method === 'MEMBER_CREDIT' &&
                      (member?.credit_balance_cents ?? 0) < totalCents;

                    return (
                      <button
                        key={option.method}
                        type="button"
                        disabled={insufficientCredit}
                        onClick={() => setPaymentMethod(option.method)}
                        className={cn(
                          'flex w-full items-center justify-between border p-4 text-left transition-colors',
                          active
                            ? 'border-gold bg-gold/10'
                            : 'border-[color:var(--border-mono)] hover:border-gold/40',
                          insufficientCredit && 'cursor-not-allowed opacity-40',
                        )}
                      >
                        <div className="flex items-center gap-3.5">
                          {option.method === 'MEMBER_CREDIT' ? (
                            <Wallet className="size-4 text-gold" />
                          ) : (
                            <CreditCard className="size-4 text-gold" />
                          )}
                          <div>
                            <p className="font-mono text-xs uppercase tracking-[0.18em] text-white">
                              {option.label}
                            </p>
                            <p className="mt-0.5 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-muted-foreground">
                              {option.sub}
                              {option.method === 'MEMBER_CREDIT' && member
                                ? ` · Balance: ${formatCents(member.credit_balance_cents)}`
                                : ''}
                            </p>
                          </div>
                        </div>
                        <span
                          className={cn(
                            'size-3 border',
                            active ? 'border-gold bg-gold' : 'border-[color:var(--border-mono)]',
                          )}
                        />
                      </button>
                    );
                  })}
                </div>
              </Card>
            </div>

            {/* Right column: Summary */}
            <div className="lg:col-span-5">
              <Card className="sticky top-8 space-y-5 p-6">
                <div className="flex items-center justify-between">
                  <Eyebrow>Crate Summary</Eyebrow>
                  <Badge tone="gold">{lines.length} Lines</Badge>
                </div>

                {/* Multi-UOM Bar */}
                <div className="grid grid-cols-3 border border-[color:var(--border-mono)] bg-void">
                  {UOM_ORDER.map((uom) => (
                    <div
                      key={uom}
                      className="flex flex-col items-center border-r border-[color:var(--border-mono)] py-2.5 last:border-r-0"
                    >
                      <span className="font-mono text-[0.5rem] uppercase tracking-[0.22em] text-faint">
                        {uom}
                      </span>
                      <span className="font-mono text-sm tabular-nums text-gold">
                        {(uomTotals[uom] ?? 0).toFixed(UOM_PRECISION[uom])}
                        {UOM_SYMBOL[uom]}
                      </span>
                    </div>
                  ))}
                </div>

                <ul className="divide-y divide-[color:var(--border-mono)]">
                  {lines.map((line) => (
                    <li key={line.key} className="flex items-start justify-between gap-3 py-3">
                      <div>
                        <p className="font-display text-xs uppercase tracking-wide text-white">
                          {line.quantity}× {line.productName}
                        </p>
                        <p className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-muted-foreground">
                          {line.variantLabel} · {formatBaseQty(cartLineBaseQty(line), line.baseUom)}
                        </p>
                      </div>
                      <span className="font-mono text-xs tabular-nums text-white">
                        {formatCents(cartLineTotalCents(line))}
                      </span>
                    </li>
                  ))}
                </ul>

                <Separator />

                <dl className="space-y-2 font-mono text-xs">
                  <div className="flex justify-between text-muted-foreground">
                    <dt>Subtotal (incl. VAT)</dt>
                    <dd className="tabular-nums">{formatCents(subtotalCents)}</dd>
                  </div>
                  {discountCents > 0 ? (
                    <div className="flex justify-between text-emerald-300">
                      <dt>Points Redeemed ({pointsToRedeem} pts)</dt>
                      <dd className="tabular-nums">-{formatCents(discountCents)}</dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between text-muted-foreground">
                    <dt>{fulfilment === 'DELIVERY' ? 'Courier Fee' : 'Click & Collect'}</dt>
                    <dd className="tabular-nums">
                      {deliveryFeeCents === 0 ? 'FREE' : formatCents(deliveryFeeCents)}
                    </dd>
                  </div>
                  <div className="flex justify-between text-[0.6875rem] text-faint">
                    <dt>Net ex. VAT / 15% SARS VAT</dt>
                    <dd className="tabular-nums">
                      {formatCents(exVatCents(totalCents))} +{' '}
                      {formatCents(vatPortionCents(totalCents))}
                    </dd>
                  </div>
                  <div className="flex justify-between border-t border-[color:var(--border-mono)] pt-3 text-lg text-white">
                    <dt className="uppercase tracking-[0.18em]">Total</dt>
                    <dd className="tabular-nums text-gold">{formatCents(totalCents)}</dd>
                  </div>
                </dl>

                <Button
                  variant="gold"
                  size="lg"
                  block
                  disabled={submitting || !isVerifiedMember(member)}
                  onClick={() => void handleCompleteOrder()}
                >
                  {submitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="size-4" />
                  )}
                  {submitting
                    ? 'Allocating Batches...'
                    : `Authorize ${formatCents(totalCents)}`}
                </Button>

                <p className="text-center font-mono text-[0.5625rem] uppercase leading-relaxed tracking-[0.18em] text-faint">
                  {IS_LOCAL_PREVIEW
                    ? 'FIFO batch deduction & loyalty accrual run against the local engine'
                    : 'Executed atomically via process_cartel_order RPC'}
                </p>
              </Card>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
