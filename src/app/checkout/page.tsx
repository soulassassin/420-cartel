'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  CreditCard,
  Loader2,
  Lock,
  MapPin,
  MessageCircle,
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
  isLocalMode,
  listBranches,
  getMember,
  listMembers,
  processOrder,
  resolveDeliveryZone,
  syncCartReservations,
} from '@/lib/data/source';
import { useCartelQuery } from '@/lib/data/useCartelQuery';
import { aggregateCartHolds, useCartReservationSync } from '@/hooks/useCartReservationSync';
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
import { attachPlacesAutocomplete } from '@/lib/delivery-zone-engine';
import { LEGAL_AGE } from '@/lib/sa-id';
import {
  branchWhatsAppNumber,
  buildOrderWhatsAppMessage,
  orderWhatsAppLink,
} from '@/lib/notifications/order-whatsapp';
import { useShallow } from 'zustand/react/shallow';
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
  const cartSessionId = useCartStore((state) => state.cartSessionId);
  const branchId = useCartStore((state) => state.branchId) ?? DEFAULT_BRANCH_ID;
  const setSyncedHolds = useCartStore((state) => state.setSyncedHolds);
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
  const uomTotals = useCartStore(useShallow(selectCartUomTotals));

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CARD_TERMINAL');
  const [pickupWindow, setPickupWindow] = useState<'NOW_60' | 'THIS_EVENING' | 'TOMORROW_NOON'>(
    'NOW_60',
  );
  const [zone, setZone] = useState<ResolvedDeliveryZone | null>(null);
  const [zoneLoading, setZoneLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ProcessOrderResult | null>(null);
  // How the branch hears about the order: `link` opens WhatsApp with the order
  // pre-written; `autoSent` is true once the server delivered it automatically.
  const [branchNotice, setBranchNotice] = useState<{
    branchName: string;
    link: string | null;
    autoSent: boolean;
  } | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  useCartReservationSync();

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

  /**
   * Google Places Autocomplete on the street address.
   *
   * Typing an address by hand cannot produce coordinates, and the zone fee is
   * decided by coordinates - so a hand-typed address previously fell back to
   * the hub's own lat/lng and could be quoted the wrong ring. Picking a
   * suggestion writes Google's real coordinates, which is what
   * `resolve_delivery_zone` then measures against.
   *
   * Without NEXT_PUBLIC_GOOGLE_MAPS_API_KEY the attach resolves to null and the
   * quick-zone presets remain the way in, rather than a dead field.
   */
  const addressInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (fulfilment !== 'DELIVERY') return;
    const input = addressInputRef.current;
    if (!input) return;

    let detach: (() => void) | null = null;
    let cancelled = false;

    void attachPlacesAutocomplete(input, (place) => {
      setDelivery({
        address: place.formattedAddress,
        suburb: place.suburb ?? place.city,
        lat: place.lat,
        lng: place.lng,
      });
    }).then((teardown) => {
      if (cancelled) {
        teardown?.();
        return;
      }
      detach = teardown;
    });

    return () => {
      cancelled = true;
      detach?.();
    };
  }, [fulfilment, setDelivery]);

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

    const memberLabel = `${member.first_name} ${member.last_name} (${member.member_code})`;
    const heldItems = aggregateCartHolds(lines);

    try {
      // Release this cart session's active reservation right before finalizing
      // so `processOrder` draws against the shopper's own held stock cleanly
      // while other shoppers' active cart holds remain protected.
      await syncCartReservations({
        cartSessionId,
        branchId,
        items: [],
        memberLabel,
      }).catch(() => undefined);

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

      setSyncedHolds(branchId, {});
      setReceipt(result);
      clearCart();

      // Tell the branch. The one-tap WhatsApp link is always prepared; when the
      // WhatsApp Business API is configured the server also sends it unprompted.
      const branchName = activeBranch?.name ?? 'the branch';
      const branchNumber = activeBranch ? branchWhatsAppNumber(activeBranch) : null;
      const message = buildOrderWhatsAppMessage({
        orderNumber: result.order_number,
        branchName,
        fulfilment: result.fulfilment_type === 'DELIVERY' ? 'DELIVERY' : 'PICKUP',
        member: {
          name: `${member.first_name} ${member.last_name}`.trim(),
          code: member.member_code,
          phone: member.phone,
        },
        items: result.items.map((item) => ({
          quantity: item.quantity,
          productName: item.product_name,
          variantLabel: item.variant_label,
          lineTotalCents: item.line_total_cents,
        })),
        subtotalCents: result.subtotal_cents,
        discountCents: result.discount_cents,
        deliveryFeeCents: result.delivery_fee_cents,
        totalCents: result.total_cents,
        paymentLabel: providerOption?.label ?? null,
        pickupSlotStart: new Date(now + slotOffsets[0]).toISOString(),
        pickupSlotEnd: new Date(now + slotOffsets[1]).toISOString(),
        deliveryAddress,
        deliverySuburb,
        deliveryInstructions,
      });
      setBranchNotice({
        branchName,
        link: branchNumber ? orderWhatsAppLink(branchNumber, message) : null,
        autoSent: false,
      });
      if (!isLocalMode()) {
        void fetch('/api/notifications/order-whatsapp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: result.order_id }),
        })
          .then((response) => response.json())
          .then((body: { sent?: boolean }) => {
            if (body.sent) setBranchNotice((notice) => (notice ? { ...notice, autoSent: true } : notice));
          })
          .catch(() => undefined); // The one-tap link remains as the fallback.
      }

      // Refresh member balance
      const updated = await getMember(member.id);
      if (updated) syncMember(updated);
    } catch (caught) {
      await syncCartReservations({
        cartSessionId,
        branchId,
        items: heldItems,
        memberLabel,
      }).catch(() => undefined);
      setError(caught instanceof Error ? caught.message : 'Allocation could not be completed.');
    } finally {
      setSubmitting(false);
    }
  }, [
    member,
    lines,
    cartSessionId,
    setSyncedHolds,
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
    activeBranch,
  ]);

  // --- Receipt view after order completes ---------------------------------
  if (receipt) {
    return (
      <main className="relative min-h-screen bg-void pb-20 pt-8 sm:pb-32 sm:pt-14">
        <div className="container max-w-2xl">
          <Card className="border-ash p-4 sm:p-10">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <Badge tone="live">
                  <Check className="size-3" />
                  Allocation Confirmed
                </Badge>
                <h1 className="mt-3 font-display text-2xl sm:text-3xl uppercase text-white">
                  Order <span className="">{receipt.order_number}</span>
                </h1>
                <p className="mt-1 font-mono text-xs sm:type-ui text-ash">
                  {receipt.fulfilment_type.replace(/_/g, ' ')} · Status: {receipt.status}
                </p>
              </div>
              <div className="self-start sm:self-auto bg-white p-1.5 sm:p-0 sm:bg-transparent">
                <QrCode value={receipt.order_number} size={88} />
              </div>
            </div>

            <Separator className="my-5 sm:my-6" />

            <div className="space-y-3">
              <Eyebrow>Allocated Lines & Batch Traceability</Eyebrow>
              {receipt.items.map((item, idx) => (
                <div
                  key={`${item.product_name}-${idx}`}
                  className="flex flex-col gap-1 border border-[color:var(--border-mono)] bg-void/60 p-3 sm:p-3.5"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-display text-xs sm:text-sm uppercase text-white">
                      {item.quantity}× {item.product_name} ({item.variant_label})
                    </span>
                    <span className="font-mono text-xs sm:type-ui tabular-nums text-foreground shrink-0">
                      {formatCents(item.line_total_cents)}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2 font-mono text-[11px] sm:text-xs text-ash">
                    <span>
                      Deducted: {formatBaseQty(item.base_qty, item.base_uom)} from vault
                    </span>
                    <span className="truncate">
                      Batches:{' '}
                      {item.batch_allocation
                        .map((b) => `${b.batch_code} (${formatBaseQty(b.base_qty, item.base_uom)})`)
                        .join(', ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <Separator className="my-5 sm:my-6" />

            <dl className="space-y-1.5 sm:space-y-2 font-mono text-xs sm:type-ui">
              <div className="flex justify-between text-ash">
                <dt>Subtotal</dt>
                <dd className="tabular-nums">{formatCents(receipt.subtotal_cents)}</dd>
              </div>
              {receipt.discount_cents > 0 ? (
                <div className="flex justify-between text-foreground">
                  <dt>Loyalty / Member Discount</dt>
                  <dd className="tabular-nums">-{formatCents(receipt.discount_cents)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between text-ash">
                <dt>Courier / Dispatch Fee</dt>
                <dd className="tabular-nums">
                  {receipt.delivery_fee_cents === 0
                    ? 'COMPLIMENTARY'
                    : formatCents(receipt.delivery_fee_cents)}
                </dd>
              </div>
              <div className="flex justify-between text-ash">
                <dt>15% SA VAT Included</dt>
                <dd className="tabular-nums">{formatCents(vatPortionCents(receipt.total_cents))}</dd>
              </div>
              <div className="flex justify-between border-t border-[color:var(--border-mono)] pt-3 text-sm sm:type-ui text-white font-bold">
                <dt className="">Total Settled</dt>
                <dd className="tabular-nums text-foreground">{formatCents(receipt.total_cents)}</dd>
              </div>
            </dl>

            <div className="mt-5 sm:mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 border border-ash bg-transparent px-3.5 py-2.5 sm:px-4 sm:py-3 font-mono text-xs sm:type-ui text-foreground">
              <span>+{receipt.points_earned} Loyalty Points Accrued</span>
              {receipt.points_redeemed > 0 ? (
                <span>-{receipt.points_redeemed} Points Redeemed</span>
              ) : null}
            </div>

            {branchNotice ? (
              <div className="mt-5 sm:mt-6 flex flex-col gap-3 border border-[color:var(--border-mono)] px-3.5 py-3 sm:px-4 sm:py-4 print:hidden">
                <p className="font-mono text-xs sm:type-ui text-ash">
                  {branchNotice.autoSent ? (
                    <span className="text-foreground">
                      <Check className="mr-1.5 inline size-3.5" />
                      {branchNotice.branchName} has been sent this order on WhatsApp.
                    </span>
                  ) : branchNotice.link ? (
                    <>
                      Send your order and member details to {branchNotice.branchName} on WhatsApp so
                      the team can start preparing it.
                    </>
                  ) : (
                    <>{branchNotice.branchName} will see this order at the counter.</>
                  )}
                </p>
                {branchNotice.link ? (
                  <Button
                    variant={branchNotice.autoSent ? 'outline' : 'gold'}
                    size="lg"
                    asChild
                    className="w-full sm:w-auto h-12 px-6"
                  >
                    <a href={branchNotice.link} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="size-4" />
                      {branchNotice.autoSent
                        ? 'Open WhatsApp chat with the branch'
                        : `WhatsApp order to ${branchNotice.branchName}`}
                    </a>
                  </Button>
                ) : null}
              </div>
            ) : null}

            <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row gap-3 print:hidden">
              <Button
                variant={branchNotice?.link && !branchNotice.autoSent ? 'outline' : 'gold'}
                size="lg"
                asChild
                className="w-full sm:w-auto h-12 sm:h-14 px-6"
              >
                <Link href="/shop">
                  Return to Dispensary
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" onClick={() => window.print()} className="w-full sm:w-auto h-12 sm:h-14 px-6">
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
              Vault <span className="">Checkout</span>
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
          <Card className="mt-8 flex flex-wrap items-center justify-between gap-4 border-ash p-6">
            <div className="flex items-center gap-3">
              <Lock className="size-5 text-foreground" />
              <div>
                <p className="font-display text-sm uppercase text-white">
                  {LEGAL_AGE}+ Member Verification Required
                </p>
                <p className="type-ui text-ash">
                  Sign in with your member pass to complete checkout.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-[18px]">
              {/* Client-side demo sign-in: never offered on a live deployment. */}
              {IS_LOCAL_PREVIEW ? (
                <Button variant="gold" size="sm" onClick={() => void simulateVerified()}>
                  <Sparkles className="size-3.5" />
                  Simulate CARTEL-0420
                </Button>
              ) : null}
              <Button variant="outline" size="sm" asChild>
                <Link href="/onboarding">Complete {LEGAL_AGE}+ Onboarding</Link>
              </Button>
            </div>
          </Card>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="mt-6 border border-foreground bg-transparent px-4 py-3 font-mono type-ui text-foreground"
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
                  <h2 className="mt-2 font-display text-lg uppercase text-white">
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
                    <Building2 className="size-4 text-foreground" />
                    <div className="text-left">
                      <div className="type-ui">Click & Collect</div>
                      <div className="type-ui text-ash">
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
                    <Truck className="size-4 text-foreground" />
                    <div className="text-left">
                      <div className="type-ui">Private Courier</div>
                      <div className="type-ui text-ash">
                        Johannesburg Radius
                      </div>
                    </div>
                  </Button>
                </div>

                {fulfilment === 'PICKUP' ? (
                  <div className="space-y-4 border-t border-[color:var(--border-mono)] pt-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-mono type-ui text-foreground">
                          {activeBranch?.name ?? 'Sandton Vault & Lounge'}
                        </p>
                        <p className="mt-1 type-ui text-ash">
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
                              'border px-3 py-2.5 text-left font-mono type-ui transition-colors',
                              pickupWindow === key
                                ? 'border-foreground bg-transparent text-foreground'
                                : 'border-[color:var(--border-mono)] text-ash hover:border-ash',
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
                                'flex items-center justify-between border px-3 py-2.5 text-left font-mono type-ui transition-colors',
                                active
                                  ? 'border-foreground bg-transparent text-foreground'
                                  : 'border-[color:var(--border-mono)] text-ash hover:border-ash',
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
                          ref={addressInputRef}
                          autoComplete="off"
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
                      <div className="flex items-center gap-2 font-mono type-ui text-ash">
                        <Loader2 className="size-3.5 animate-spin" />
                        Calculating vault distance...
                      </div>
                    ) : zone ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 border border-foreground bg-transparent/[0.06] px-4 py-3">
                        <div>
                          <p className="font-mono type-ui text-foreground">
                            {zone.zone_name} · {zone.distance_km} km from Sandton Hub
                          </p>
                          <p className="mt-0.5 font-mono type-ui text-ash">
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
                      <div className="border border-foreground bg-transparent px-4 py-3 font-mono type-ui text-foreground">
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
                  <h2 className="mt-2 font-display text-lg uppercase text-white">
                    South African Tender & Points
                  </h2>
                </div>

                {member && rules ? (
                  <div className="border border-[color:var(--border-mono)] bg-void/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-mono type-ui text-foreground">
                          Loyalty Balance: {member.points_balance.toLocaleString('en-ZA')} pts
                        </p>
                        <p className="mt-0.5 font-mono type-ui text-ash">
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
                            ? 'border-foreground bg-transparent'
                            : 'border-[color:var(--border-mono)] hover:border-ash',
                          insufficientCredit && 'cursor-not-allowed opacity-40',
                        )}
                      >
                        <div className="flex items-center gap-3.5">
                          {option.method === 'MEMBER_CREDIT' ? (
                            <Wallet className="size-4 text-foreground" />
                          ) : (
                            <CreditCard className="size-4 text-foreground" />
                          )}
                          <div>
                            <p className="font-mono type-ui text-white">
                              {option.label}
                            </p>
                            <p className="mt-0.5 font-mono type-ui text-ash">
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
                            active ? 'border-foreground bg-transparent' : 'border-[color:var(--border-mono)]',
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
                      <span className="font-mono type-ui text-ash">
                        {uom}
                      </span>
                      <span className="font-mono type-ui tabular-nums text-foreground">
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
                        <p className="font-display text-xs uppercase text-white">
                          {line.quantity}× {line.productName}
                        </p>
                        <p className="font-mono type-ui text-ash">
                          {line.variantLabel} · {formatBaseQty(cartLineBaseQty(line), line.baseUom)}
                        </p>
                      </div>
                      <span className="font-mono type-ui tabular-nums text-white">
                        {formatCents(cartLineTotalCents(line))}
                      </span>
                    </li>
                  ))}
                </ul>

                <Separator />

                <dl className="space-y-2 font-mono type-ui">
                  <div className="flex justify-between text-ash">
                    <dt>Subtotal (incl. VAT)</dt>
                    <dd className="tabular-nums">{formatCents(subtotalCents)}</dd>
                  </div>
                  {discountCents > 0 ? (
                    <div className="flex justify-between text-foreground">
                      <dt>Points Redeemed ({pointsToRedeem} pts)</dt>
                      <dd className="tabular-nums">-{formatCents(discountCents)}</dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between text-ash">
                    <dt>{fulfilment === 'DELIVERY' ? 'Courier Fee' : 'Click & Collect'}</dt>
                    <dd className="tabular-nums">
                      {deliveryFeeCents === 0 ? 'FREE' : formatCents(deliveryFeeCents)}
                    </dd>
                  </div>
                  <div className="flex justify-between type-ui text-ash">
                    <dt>Net ex. VAT / 15% SARS VAT</dt>
                    <dd className="tabular-nums">
                      {formatCents(exVatCents(totalCents))} +{' '}
                      {formatCents(vatPortionCents(totalCents))}
                    </dd>
                  </div>
                  <div className="flex justify-between border-t border-[color:var(--border-mono)] pt-3 text-lg text-white">
                    <dt className="">Total</dt>
                    <dd className="tabular-nums text-foreground">{formatCents(totalCents)}</dd>
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

                <p className="text-center font-mono type-ui leading-relaxed text-ash">
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
