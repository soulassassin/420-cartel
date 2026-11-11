'use client';

import { useCallback, useMemo, useState } from 'react';
import Image from 'next/image';
import {
  Banknote,
  Check,
  CreditCard,
  Loader2,
  Minus,
  Plus,
  Printer,
  Scale,
  ScanLine,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Label } from '@/components/ui/field';
import { Badge, Card, EmptyState, Eyebrow, Separator } from '@/components/ui/surfaces';
import { QrCode } from '@/components/ui/QrCode';
import { formatCents } from '@/lib/money';
import {
  baseQtyForTargetCents,
  customAmountPriceCents,
  tierPriceCents,
  vatPortionCents,
} from '@/lib/pricing';
import { LEGAL_AGE, parseSaId } from '@/lib/sa-id';
import {
  CATEGORY_LABEL,
  UOM_PRECISION,
  UOM_SYMBOL,
  formatBaseQty,
  roundBaseQty,
} from '@/lib/uom';
import {
  createMember,
  listCatalogue,
  listMembers,
  lookupMembers,
  processOrder,
  type CatalogueEntry,
} from '@/lib/data/source';
import { useCartelQuery } from '@/lib/data/useCartelQuery';
import { DEFAULT_BRANCH_ID } from '@/lib/demo/fixtures';
import { useHardwareScanner, type ScanEvent } from '@/hooks/useHardwareScanner';
import {
  ThermalReceiptPrint,
  printThermalReceipt,
  type ThermalReceiptTender,
} from '@/components/pos/ThermalReceiptPrint';
import { RANK_LABEL } from '@/lib/loyalty';
import { cn } from '@/lib/utils';
import type {
  BaseUom,
  MemberRow,
  PaymentMethod,
  ProcessOrderResult,
  ProductCategory,
  ProductVariantRow,
} from '@/types/database';

/**
 * Module E — 420 Cartel In-Store POS & Walk-In Terminal.
 *
 * Touch-first counter interface for Sandton Vault budtenders:
 * - Instant QR / member code / SA ID / phone lookup + 1-tap seeded members
 * - 60-second walk-in member registration with live SA ID Luhn & 18+ check
 * - Multi-UOM ticket builder with custom scale weight & target-Rand calculator
 * - Cash (with change calculation), Card Terminal, Instant EFT & Store Credit
 * - Printable 80mm thermal receipt with FIFO batch allocation breakdown
 */

interface TicketLine {
  key: string;
  productId: string;
  productName: string;
  variantId: string;
  variantLabel: string;
  baseUom: BaseUom;
  baseQtyPerUnit: number;
  isCustomAmount: boolean;
  quantity: number;
  unitPriceCents: number;
}

type CategoryFilter = 'ALL' | ProductCategory;

const CATEGORIES: { key: CategoryFilter; label: string }[] = [
  { key: 'ALL', label: 'All Vault' },
  { key: 'FLOWER', label: 'Flower (g)' },
  { key: 'VAPE', label: 'Vapes & Carts' },
  { key: 'ELIXIR_OIL', label: 'Elixirs (ml)' },
  { key: 'PRE_ROLL', label: 'Pre-Rolls' },
  { key: 'EDIBLE', label: 'Edibles' },
  { key: 'ACCESSORY', label: 'Hardware & Gear' },
];

export default function PosTerminalPage() {
  const [branchId] = useState(DEFAULT_BRANCH_ID);
  const [category, setCategory] = useState<CategoryFilter>('ALL');
  const [productQuery, setProductQuery] = useState('');

  // Member lookup & selection
  const [memberSearch, setMemberSearch] = useState('');
  const [searchResults, setSearchResults] = useState<MemberRow[]>([]);
  const [selectedMember, setSelectedMember] = useState<MemberRow | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);

  // Ticket lines & custom scale modal
  const [lines, setLines] = useState<TicketLine[]>([]);
  const [scaleTarget, setScaleTarget] = useState<{
    entry: CatalogueEntry;
    customVariant: ProductVariantRow;
  } | null>(null);

  // Tender & settlement
  const [tenderMethod, setTenderMethod] = useState<PaymentMethod>('CARD_TERMINAL');
  const [cashTenderedRand, setCashTenderedRand] = useState('');
  const [discountRand, setDiscountRand] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ProcessOrderResult | null>(null);

  const catalogue = useCartelQuery(() => listCatalogue(branchId), [branchId]);
  const seededMembers = useCartelQuery(() => listMembers(), []);

  const handleMemberSearch = useCallback(async (query: string) => {
    setMemberSearch(query);
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const matches = await lookupMembers(query);
      setSearchResults(matches);
    } catch {
      setSearchResults([]);
    }
  }, []);

  const filteredCatalogue = useMemo(() => {
    const items = catalogue.data ?? [];
    const needle = productQuery.trim().toLowerCase();
    return items.filter((entry) => {
      if (category !== 'ALL' && entry.product.category !== category) return false;
      if (!needle) return true;
      return (
        entry.product.name.toLowerCase().includes(needle) ||
        entry.product.sku.toLowerCase().includes(needle) ||
        entry.product.strain.toLowerCase().includes(needle)
      );
    });
  }, [catalogue.data, category, productQuery]);

  const committedForProduct = useCallback(
    (productId: string) =>
      lines
        .filter((l) => l.productId === productId)
        .reduce((sum, l) => sum + l.baseQtyPerUnit * l.quantity, 0),
    [lines],
  );

  const addStandardTier = useCallback(
    (entry: CatalogueEntry, variant: ProductVariantRow) => {
      setError(null);
      const alreadyCommitted = committedForProduct(entry.product.id);
      const headroom = roundBaseQty(
        entry.stock.remaining_base_qty - alreadyCommitted,
        entry.product.base_uom,
      );
      if (variant.base_quantity > headroom + 1e-9) {
        setError(
          `${entry.product.name}: only ${formatBaseQty(Math.max(0, headroom), entry.product.base_uom)} on hand.`,
        );
        return;
      }

      const unitPrice = tierPriceCents(variant, selectedMember);
      const key = variant.id;

      setLines((current) => {
        const existing = current.find((l) => l.key === key);
        if (existing) {
          return current.map((l) =>
            l.key === key ? { ...l, quantity: l.quantity + 1, unitPriceCents: unitPrice } : l,
          );
        }
        return [
          ...current,
          {
            key,
            productId: entry.product.id,
            productName: entry.product.name,
            variantId: variant.id,
            variantLabel: variant.label,
            baseUom: entry.product.base_uom,
            baseQtyPerUnit: variant.base_quantity,
            isCustomAmount: false,
            quantity: 1,
            unitPriceCents: unitPrice,
          },
        ];
      });
    },
    [committedForProduct, selectedMember],
  );

  const addCustomScaleLine = useCallback(
    (entry: CatalogueEntry, variant: ProductVariantRow, exactBaseQty: number) => {
      const rounded = roundBaseQty(exactBaseQty, entry.product.base_uom);
      if (rounded <= 0) return;

      const alreadyCommitted = committedForProduct(entry.product.id);
      const headroom = roundBaseQty(
        entry.stock.remaining_base_qty - alreadyCommitted,
        entry.product.base_uom,
      );
      if (rounded > headroom + 1e-9) {
        setError(
          `${entry.product.name}: scale weight ${formatBaseQty(rounded, entry.product.base_uom)} exceeds ${formatBaseQty(Math.max(0, headroom), entry.product.base_uom)} remaining.`,
        );
        return;
      }

      const unitPrice = customAmountPriceCents(variant, rounded, selectedMember);
      const key = `${variant.id}@${rounded}`;

      setLines((current) => [
        ...current,
        {
          key,
          productId: entry.product.id,
          productName: entry.product.name,
          variantId: variant.id,
          variantLabel: `${formatBaseQty(rounded, entry.product.base_uom)} (Scale)`,
          baseUom: entry.product.base_uom,
          baseQtyPerUnit: rounded,
          isCustomAmount: true,
          quantity: 1,
          unitPriceCents: unitPrice,
        },
      ]);
      setScaleTarget(null);
    },
    [committedForProduct, selectedMember],
  );

  const subtotalCents = useMemo(
    () => lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0),
    [lines],
  );

  const manualDiscountCents = useMemo(() => {
    const parsed = Number.parseFloat(discountRand);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.min(subtotalCents, Math.round(parsed * 100));
  }, [discountRand, subtotalCents]);

  const totalCents = Math.max(0, subtotalCents - manualDiscountCents);

  const tenderedCents = useMemo(() => {
    if (tenderMethod !== 'CASH') return totalCents;
    const parsed = Number.parseFloat(cashTenderedRand);
    if (!Number.isFinite(parsed) || parsed <= 0) return totalCents;
    return Math.max(totalCents, Math.round(parsed * 100));
  }, [tenderMethod, cashTenderedRand, totalCents]);

  const changeCents = Math.max(0, tenderedCents - totalCents);

  const completeSale = useCallback(async () => {
    if (lines.length === 0) {
      setError('Add at least one item to the ticket.');
      return;
    }
    if (
      tenderMethod === 'MEMBER_CREDIT' &&
      (!selectedMember || selectedMember.credit_balance_cents < totalCents)
    ) {
      setError('Insufficient member store credit for this ticket.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await processOrder({
        channel: 'POS',
        fulfilment_type: 'IN_STORE',
        branch_id: branchId,
        member_id: selectedMember?.id ?? null,
        items: lines.map((line) => ({
          variant_id: line.variantId,
          quantity: line.quantity,
          ...(line.isCustomAmount ? { base_qty_override: line.baseQtyPerUnit } : {}),
        })),
        discount_cents: manualDiscountCents,
        ignore_reservations: true,
        payments: [
          {
            method: tenderMethod,
            amount_cents: totalCents,
            ...(tenderMethod === 'CASH' ? { tendered_cents: tenderedCents } : {}),
            provider: tenderMethod === 'CARD_TERMINAL' ? 'yoco-pos' : 'in-house',
          },
        ],
        idempotency_key: `pos-${Date.now()}`,
      });

      setReceipt(result);
      setLines([]);
      setDiscountRand('');
      setCashTenderedRand('');
      catalogue.refresh();
      seededMembers.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not complete sale.');
    } finally {
      setSubmitting(false);
    }
  }, [
    lines,
    tenderMethod,
    selectedMember,
    totalCents,
    branchId,
    manualDiscountCents,
    tenderedCents,
    catalogue,
    seededMembers,
  ]);

  /**
   * Hardware scanner routing.
   *
   * A USB/Bluetooth 2D scanner types its payload in a sub-35ms burst ending in
   * Enter, which `useHardwareScanner` detects without the cashier focusing any
   * field. A CARTEL-XXXX pass or a bare QR token attaches the member; anything
   * else is treated as a product barcode and rung straight onto the ticket.
   */
  const handleScan = useCallback(
    async (event: ScanEvent) => {
      setError(null);

      if (event.kind === 'MEMBER') {
        try {
          const matches = await lookupMembers(event.value);
          const match = matches[0];
          if (!match) {
            setError(`No member pass matches ${event.value}.`);
            return;
          }
          setSelectedMember(match);
          setSearchResults([]);
          setMemberSearch('');
        } catch {
          setError('Member lookup failed. Check the pass and try again.');
        }
        return;
      }

      // Product barcode: find the tier it belongs to across the live catalogue.
      const needle = event.value.trim().toLowerCase();
      for (const entry of catalogue.data ?? []) {
        const variant = entry.variants.find(
          (candidate) => candidate.barcode?.toLowerCase() === needle,
        );
        if (variant) {
          addStandardTier(entry, variant);
          return;
        }
      }

      setError(`Barcode ${event.value} is not on any active tier.`);
    },
    [catalogue.data, addStandardTier],
  );

  useHardwareScanner({
    onScan: (event) => void handleScan(event),
    // The scale keypad and the walk-in form own the keyboard while open.
    enabled: scaleTarget === null && !walkInOpen && receipt === null,
  });

  return (
    <main className="min-h-screen bg-void pb-24 pt-6">
      <div className="container max-w-[1440px]">
        {/* Top bar */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[color:var(--border-mono)] pb-4 print:hidden">
          <div className="flex items-center gap-3">
            <div className="relative size-10 shrink-0 overflow-hidden rounded-full border border-foreground/30 bg-black">
              <Image
                src="/fourtwentycartel_logo.jpg"
                alt="420 Cartel"
                width={40}
                height={40}
                className="size-full object-cover"
              />
            </div>
            <div>
              <Eyebrow>Sandton Vault · Counter Terminal 01</Eyebrow>
              <h1 className="font-display text-xl uppercase text-white">
                420 Cartel <span className="">POS</span>
              </h1>
            </div>
          </div>

          {/* Member bar */}
          <div className="flex flex-wrap items-center gap-2">
            {selectedMember ? (
              <div className="flex items-center gap-3 border border-ash bg-transparent px-3.5 py-2">
                <ShieldCheck className="size-4 text-foreground" />
                <div>
                  <p className="font-mono type-ui text-white">
                    {selectedMember.first_name} {selectedMember.last_name} ·{' '}
                    <span className="text-foreground">{selectedMember.member_code}</span>
                  </p>
                  <p className="font-mono type-ui text-ash">
                    {selectedMember.status} · Credit:{' '}
                    {formatCents(selectedMember.credit_balance_cents)} ·{' '}
                    {selectedMember.points_balance} pts
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedMember(null)}
                  aria-label="Detach member"
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ) : (
              <div className="relative w-full sm:w-auto">
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:flex-initial">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ash" />
                    <Input
                      value={memberSearch}
                      onChange={(e) => void handleMemberSearch(e.target.value)}
                      placeholder="Scan QR / CARTEL-0420 / SA ID..."
                      className="h-10 w-full sm:w-64 pl-9 font-mono type-ui"
                    />
                  </div>
                  <Button variant="outline" size="sm" className="shrink-0" onClick={() => setWalkInOpen(true)}>
                    <UserPlus className="size-3.5" />
                    Walk-In 18+
                  </Button>
                </div>

                {searchResults.length > 0 ? (
                  <div className="dropdown absolute right-0 top-11 z-30 w-full sm:w-80 max-w-[calc(100vw-2rem)] border border-[color:var(--border-hard)] bg-surface">
                    {searchResults.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setSelectedMember(m);
                          setMemberSearch('');
                          setSearchResults([]);
                        }}
                        className="flex w-full items-center justify-between border-b border-[color:var(--border-mono)] px-3.5 py-2.5 text-left bg-transparent"
                      >
                        <div>
                          <p className="font-mono type-ui text-white">
                            {m.first_name} {m.last_name}
                          </p>
                          <p className="font-mono type-ui text-foreground">{m.member_code}</p>
                        </div>
                        <Badge tone={m.status === 'VIP' ? 'gold' : 'live'}>{m.status}</Badge>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </header>

        {/* Quick member pills for instant demo testing */}
        {!selectedMember && (seededMembers.data ?? []).length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 print:hidden">
            <span className="font-mono type-ui text-ash">
              Quick Scan Member:
            </span>
            {(seededMembers.data ?? []).slice(0, 4).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMember(m)}
                className="flex items-center gap-1.5 border border-[color:var(--border-mono)] bg-surface px-2.5 py-1 font-mono type-ui text-ash transition-colors hover:border-foreground hover:text-foreground"
              >
                <UserRound className="size-3" />
                {m.member_code} ({m.first_name})
              </button>
            ))}
          </div>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="mt-4 border border-foreground bg-transparent px-4 py-2.5 font-mono type-ui text-foreground print:hidden"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-5 grid gap-6 lg:grid-cols-12 print:hidden">
          {/* Left 7 cols: Product & Tier Grid */}
          <div className="space-y-4 lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((cat) => (
                  <Button
                    key={cat.key}
                    variant={category === cat.key ? 'active' : 'surface'}
                    size="sm"
                    onClick={() => setCategory(cat.key)}
                  >
                    {cat.label}
                  </Button>
                ))}
              </div>
              <Input
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                placeholder="Filter SKU or strain..."
                className="h-9 w-full sm:w-48 font-mono type-ui"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {filteredCatalogue.map((entry) => {
                const { product, variants, stock } = entry;
                const committed = committedForProduct(product.id);
                const remaining = roundBaseQty(
                  stock.remaining_base_qty - committed,
                  product.base_uom,
                );
                const standardTiers = variants.filter((v) => !v.is_custom_amount);
                const customTier = variants.find((v) => v.is_custom_amount) ?? null;

                return (
                  <Card key={product.id} className="flex flex-col justify-between gap-3 p-4">
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          {product.hero_media_url ? (
                            <div className="relative size-12 shrink-0 overflow-hidden rounded border border-[color:var(--border-mono)] bg-void">
                              <Image
                                src={product.hero_media_url}
                                alt={product.name}
                                fill
                                className="object-cover"
                                sizes="48px"
                              />
                            </div>
                          ) : null}
                          <div>
                            <span className="font-mono type-ui text-ash">
                              {product.sku} · {CATEGORY_LABEL[product.category]}
                            </span>
                            <h2 className="mt-0.5 font-display text-base uppercase text-white">
                              {product.name}
                            </h2>
                          </div>
                        </div>
                        <Badge tone={remaining <= stock.low_stock_threshold ? 'warn' : 'gold'}>
                          {remaining.toFixed(UOM_PRECISION[product.base_uom])}{' '}
                          {UOM_SYMBOL[product.base_uom]}
                        </Badge>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5">
                      {standardTiers.map((variant) => {
                        const canFit = variant.base_quantity <= remaining + 1e-9;
                        return (
                          <button
                            key={variant.id}
                            type="button"
                            disabled={!canFit}
                            onClick={() => addStandardTier(entry, variant)}
                            className={cn(
                              'flex items-center justify-between border border-[color:var(--border-mono)] bg-void px-2.5 py-2 text-left font-mono transition-colors hover:border-foreground',
                              !canFit && 'cursor-not-allowed opacity-35',
                            )}
                          >
                            <span className="type-ui text-white">
                              {variant.label}
                            </span>
                            <span className="type-ui tabular-nums text-foreground">
                              {formatCents(tierPriceCents(variant, selectedMember))}
                            </span>
                          </button>
                        );
                      })}

                      {customTier ? (
                        <button
                          type="button"
                          disabled={remaining <= 0}
                          onClick={() => setScaleTarget({ entry, customVariant: customTier })}
                          className="col-span-2 flex items-center justify-center gap-2 border border-dashed border-ash bg-transparent px-3 py-2 font-mono type-ui text-foreground transition-colors hover:bg-transparent"
                        >
                          <Scale className="size-3.5" />
                          Scale Weight / Target Rand ({formatCents(tierPriceCents(customTier, selectedMember))}/
                          {UOM_SYMBOL[product.base_uom]})
                        </button>
                      ) : null}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Right 5 cols: Active Ticket & Settlement */}
          <div className="lg:col-span-5">
            <Card className="flex flex-col justify-between p-5">
              <div>
                <div className="flex items-center justify-between border-b border-[color:var(--border-mono)] pb-3">
                  <div>
                    <Eyebrow>Active Counter Ticket</Eyebrow>
                    <p className="mt-0.5 font-mono type-ui text-ash">
                      {lines.length} {lines.length === 1 ? 'line' : 'lines'} · FIFO Batch Deduction
                    </p>
                  </div>
                  {lines.length > 0 ? (
                    <Button variant="ghost" size="sm" onClick={() => setLines([])}>
                      Clear
                    </Button>
                  ) : null}
                </div>

                {lines.length === 0 ? (
                  <div className="py-8">
                    <EmptyState
                      title="No items rung up"
                      description="Tap a product tier on the left or use the custom scale calculator."
                    />
                  </div>
                ) : (
                  <ul className="max-h-72 divide-y divide-[color:var(--border-mono)] overflow-y-auto cartel-scroll">
                    {lines.map((line) => (
                      <li key={line.key} className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-display text-xs uppercase text-white">
                            {line.productName}
                          </p>
                          <p className="font-mono type-ui text-foreground">
                            {line.variantLabel} ·{' '}
                            {formatBaseQty(line.baseQtyPerUnit * line.quantity, line.baseUom)}
                          </p>
                        </div>

                        <div className="flex items-center border border-[color:var(--border-mono)]">
                          <button
                            type="button"
                            onClick={() =>
                              setLines((curr) =>
                                line.quantity <= 1
                                  ? curr.filter((l) => l.key !== line.key)
                                  : curr.map((l) =>
                                      l.key === line.key ? { ...l, quantity: l.quantity - 1 } : l,
                                    ),
                              )
                            }
                            className="flex size-7 items-center justify-center text-ash hover:text-foreground"
                          >
                            <Minus className="size-3" />
                          </button>
                          <span className="w-7 text-center font-mono type-ui tabular-nums text-white">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setLines((curr) =>
                                curr.map((l) =>
                                  l.key === line.key ? { ...l, quantity: l.quantity + 1 } : l,
                                ),
                              )
                            }
                            className="flex size-7 items-center justify-center text-ash hover:text-foreground"
                          >
                            <Plus className="size-3" />
                          </button>
                        </div>

                        <span className="w-20 text-right font-mono type-ui tabular-nums text-white">
                          {formatCents(line.unitPriceCents * line.quantity)}
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            setLines((curr) => curr.filter((l) => l.key !== line.key))
                          }
                          className="text-ash hover:text-foreground"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mt-4 space-y-4 border-t border-[color:var(--border-mono)] pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Manual Discount (ZAR)" htmlFor="pos_discount">
                    <Input
                      id="pos_discount"
                      type="number"
                      min="0"
                      value={discountRand}
                      onChange={(e) => setDiscountRand(e.target.value)}
                      placeholder="0.00"
                      className="h-9 font-mono type-ui"
                    />
                  </Field>
                  {tenderMethod === 'CASH' ? (
                    <Field label="Cash Tendered (ZAR)" htmlFor="pos_cash">
                      <Input
                        id="pos_cash"
                        type="number"
                        min="0"
                        value={cashTenderedRand}
                        onChange={(e) => setCashTenderedRand(e.target.value)}
                        placeholder={(totalCents / 100).toFixed(2)}
                        className="h-9 font-mono type-ui"
                      />
                    </Field>
                  ) : null}
                </div>

                {/* Tender Method Selector */}
                <div>
                  <Label>Tender Method</Label>
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                    {(
                      [
                        ['CARD_TERMINAL', 'Card', CreditCard],
                        ['CASH', 'Cash', Banknote],
                        ['EFT_INSTANT', 'Instant EFT', Check],
                        ['MEMBER_CREDIT', 'Credit', Wallet],
                      ] as const
                    ).map(([method, label, Icon]) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setTenderMethod(method)}
                        className={cn(
                          'flex flex-col items-center gap-1 border py-2 font-mono type-ui ',
                          tenderMethod === method
                            ? 'border-foreground bg-transparent text-foreground'
                            : 'border-[color:var(--border-mono)] text-ash hover:border-ash',
                        )}
                      >
                        <Icon className="size-3.5" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <dl className="space-y-1.5 font-mono type-ui">
                  <div className="flex justify-between text-ash">
                    <dt>Subtotal</dt>
                    <dd className="tabular-nums">{formatCents(subtotalCents)}</dd>
                  </div>
                  {manualDiscountCents > 0 ? (
                    <div className="flex justify-between text-foreground">
                      <dt>Discount</dt>
                      <dd className="tabular-nums">-{formatCents(manualDiscountCents)}</dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between text-ash">
                    <dt>15% VAT Included</dt>
                    <dd className="tabular-nums">{formatCents(vatPortionCents(totalCents))}</dd>
                  </div>
                  {tenderMethod === 'CASH' && changeCents > 0 ? (
                    <div className="flex justify-between text-foreground">
                      <dt>Change Due</dt>
                      <dd className="tabular-nums">{formatCents(changeCents)}</dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between border-t border-[color:var(--border-mono)] pt-2.5 text-lg text-white">
                    <dt className="">Total Due</dt>
                    <dd className="tabular-nums text-foreground">{formatCents(totalCents)}</dd>
                  </div>
                </dl>

                <Button
                  variant="gold"
                  size="lg"
                  block
                  disabled={submitting || lines.length === 0}
                  onClick={() => void completeSale()}
                >
                  {submitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  {submitting ? 'Settling Ticket...' : `Charge ${formatCents(totalCents)}`}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Custom Scale / Target Rand Modal */}
      {scaleTarget ? (
        <ScaleModal
          entry={scaleTarget.entry}
          variant={scaleTarget.customVariant}
          member={selectedMember}
          onClose={() => setScaleTarget(null)}
          onConfirm={(qty) =>
            addCustomScaleLine(scaleTarget.entry, scaleTarget.customVariant, qty)
          }
        />
      ) : null}

      {/* Walk-In Registration Modal */}
      {walkInOpen ? (
        <WalkInModal
          onClose={() => setWalkInOpen(false)}
          onCreated={(member) => {
            setSelectedMember(member);
            setWalkInOpen(false);
            seededMembers.refresh();
          }}
        />
      ) : null}

      {/* 80mm Thermal Receipt Modal */}
      {receipt ? (
        <ThermalReceiptModal
          receipt={receipt}
          member={selectedMember}
          branchName="Sandton Vault Lounge"
          terminalLabel="TERMINAL 01"
          cashierName={null}
          tender={[
            {
              method: tenderMethod,
              // What was actually captured; an unsettled balance prints as
              // BALANCE DUE off the receipt's own outstanding figure.
              amountCents:
                receipt.captured_cents > 0 ? receipt.captured_cents : receipt.total_cents,
              tenderedCents: tenderMethod === 'CASH' ? tenderedCents : null,
              changeCents:
                tenderMethod === 'CASH'
                  ? Math.max(0, tenderedCents - receipt.total_cents)
                  : null,
            },
          ]}
          onClose={() => setReceipt(null)}
        />
      ) : null}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Scale Calculator Modal
// ---------------------------------------------------------------------------

function ScaleModal({
  entry,
  variant,
  member,
  onClose,
  onConfirm,
}: {
  entry: CatalogueEntry;
  variant: ProductVariantRow;
  member: MemberRow | null;
  onClose: () => void;
  onConfirm: (baseQty: number) => void;
}) {
  const uom = entry.product.base_uom;
  const rateCents = tierPriceCents(variant, member);
  const [weightInput, setWeightInput] = useState('2.5');
  const [randInput, setRandInput] = useState('');

  const computedQty = useMemo(() => {
    if (randInput.trim() !== '') {
      const rands = Number.parseFloat(randInput);
      if (Number.isFinite(rands) && rands > 0) {
        return baseQtyForTargetCents(variant, Math.round(rands * 100), member);
      }
    }
    const parsed = Number.parseFloat(weightInput);
    return Number.isFinite(parsed) && parsed > 0 ? roundBaseQty(parsed, uom) : 0;
  }, [randInput, weightInput, variant, member, uom]);

  const computedPrice = customAmountPriceCents(variant, computedQty, member);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-4 ">
      <Card className="w-full max-w-md space-y-5 border-foreground p-6">
        <div className="flex items-start justify-between">
          <div>
            <Eyebrow>Precision Scale Allocation</Eyebrow>
            <h3 className="mt-1 font-display text-lg uppercase text-white">
              {entry.product.name}
            </h3>
            <p className="font-mono type-ui text-foreground">
              Rate: {formatCents(rateCents)} per {UOM_SYMBOL[uom]}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={`Exact Amount (${UOM_SYMBOL[uom]})`} htmlFor="scale_qty">
            <Input
              id="scale_qty"
              type="number"
              step="0.1"
              value={weightInput}
              onChange={(e) => {
                setWeightInput(e.target.value);
                setRandInput('');
              }}
              className="font-mono"
            />
          </Field>
          <Field label="Or Target Rand (ZAR)" htmlFor="scale_rand">
            <Input
              id="scale_rand"
              type="number"
              step="10"
              value={randInput}
              onChange={(e) => setRandInput(e.target.value)}
              placeholder="e.g. 400"
              className="font-mono"
            />
          </Field>
        </div>

        <div className="flex items-center justify-between border border-[color:var(--border-mono)] bg-void p-4 font-mono">
          <div>
            <span className="type-ui text-ash">
              Scale Deduction
            </span>
            <p className="text-lg text-white">
              {computedQty.toFixed(UOM_PRECISION[uom])} {UOM_SYMBOL[uom]}
            </p>
          </div>
          <div className="text-right">
            <span className="type-ui text-ash">
              Line Total
            </span>
            <p className="text-lg text-foreground">{formatCents(computedPrice)}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="gold"
            disabled={computedQty <= 0}
            onClick={() => onConfirm(computedQty)}
          >
            Add Scale Line
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Walk-In 60-Second Registration Modal
// ---------------------------------------------------------------------------

function WalkInModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (member: MemberRow) => void;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saId, setSaId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const parsed = useMemo(() => parseSaId(saId), [saId]);

  const submit = useCallback(async () => {
    if (!parsed.valid) {
      setError(parsed.message);
      return;
    }
    if (!parsed.isOfLegalAge) {
      setError(`Walk-in member must be ${LEGAL_AGE}+ years old.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createMember({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || `walkin.${Date.now()}@420cartel.co.za`,
        phone: phone.trim() || '0820000000',
        idDocumentType: 'SA_ID',
        saIdNumber: parsed.normalized,
        dateOfBirth: parsed.dateOfBirth,
        nationality: parsed.citizenship,
        gender: parsed.genderMarker,
        homeBranchId: DEFAULT_BRANCH_ID,
        autoApprove: true,
      });
      onCreated(created);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not register walk-in.');
    } finally {
      setSaving(false);
    }
  }, [parsed, firstName, lastName, email, phone, onCreated]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-4 ">
      <Card className="w-full max-w-md space-y-4 border-foreground p-6">
        <div className="flex items-start justify-between">
          <div>
            <Eyebrow>Counter KYC Verification</Eyebrow>
            <h3 className="mt-1 font-display text-lg uppercase text-white">
              Walk-In {LEGAL_AGE}+ Member Pass
            </h3>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        {error ? (
          <p className="border border-foreground bg-transparent px-3 py-2 font-mono type-ui text-foreground">
            {error}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label="First Name" htmlFor="wi_first" required>
            <Input
              id="wi_first"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </Field>
          <Field label="Last Name" htmlFor="wi_last" required>
            <Input id="wi_last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </Field>
        </div>

        <Field
          label="SA 13-Digit ID Number"
          htmlFor="wi_said"
          required
          hint={parsed.valid ? `${parsed.age} yrs · DOB ${parsed.dateOfBirth}` : 'Luhn check'}
        >
          <Input
            id="wi_said"
            value={saId}
            onChange={(e) => setSaId(e.target.value.replace(/\D/g, '').slice(0, 13))}
            placeholder="9204205123085"
            className="font-mono "
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Mobile" htmlFor="wi_phone">
            <Input
              id="wi_phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="082 555 0420"
              className="font-mono"
            />
          </Field>
          <Field label="Email" htmlFor="wi_email">
            <Input
              id="wi_email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="member@cartel.co.za"
            />
          </Field>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="gold"
            disabled={!parsed.valid || !parsed.isOfLegalAge || !firstName.trim() || saving}
            onClick={() => void submit()}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Approve & Attach Pass
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 80mm Thermal Receipt Modal
// ---------------------------------------------------------------------------

/**
 * Receipt overlay.
 *
 * The slip itself is `ThermalReceiptPrint`, which renders `#thermal-receipt` —
 * the id the `@media print` block in globals.css scopes printing to. Everything
 * else on the page is hidden at print time, so the printer receives the 72mm
 * slip and nothing else.
 */
function ThermalReceiptModal({
  receipt,
  member,
  branchName,
  terminalLabel,
  cashierName,
  tender,
  onClose,
}: {
  receipt: ProcessOrderResult;
  member: MemberRow | null;
  branchName: string;
  terminalLabel: string;
  cashierName: string | null;
  tender: readonly ThermalReceiptTender[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/85 p-4 print:bg-transparent print:p-0 ">
      <div className="flex flex-col items-center gap-4">
        <div className="border border-foreground print:border-0 print:shadow-none">
          <ThermalReceiptPrint
            receipt={receipt}
            branchName={branchName}
            terminalLabel={terminalLabel}
            cashierName={cashierName}
            tender={tender}
            member={
              member
                ? {
                    memberCode: member.member_code,
                    fullName: `${member.first_name} ${member.last_name}`,
                    rankLabel: RANK_LABEL[member.rank] ?? member.rank,
                    pointsBalance: member.points_balance,
                    creditBalanceCents: member.credit_balance_cents,
                  }
                : null
            }
          />
        </div>

        <div className="flex gap-2 print:hidden">
          <Button variant="gold" onClick={() => printThermalReceipt()}>
            <Printer className="size-4" />
            Print 80mm Receipt
          </Button>
          <Button variant="outline" onClick={onClose}>
            Next Customer
          </Button>
        </div>
      </div>
    </div>
  );
}
