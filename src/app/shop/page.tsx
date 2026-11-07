'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  Loader2,
  Lock,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, Card, Eyebrow, EmptyState, Separator } from '@/components/ui/surfaces';
import { formatCents } from '@/lib/money';
import {
  CATEGORY_LABEL,
  UOM_PRECISION,
  UOM_SYMBOL,
  formatBaseQty,
  roundBaseQty,
  tiersAvailable,
} from '@/lib/uom';
import { tierPriceCents, vipPriceCents, isVipStanding } from '@/lib/pricing';
import { listCatalogue, listMembers, IS_LOCAL_PREVIEW, type CatalogueEntry } from '@/lib/data/source';
import { useCartelQuery } from '@/lib/data/useCartelQuery';
import { DEFAULT_BRANCH_ID } from '@/lib/demo/fixtures';
import {
  cartLineBaseQty,
  cartLineTotalCents,
  cartProductBaseQty,
  selectCartCount,
  selectCartSubtotalCents,
  selectCartUomTotals,
  useCartStore,
} from '@/lib/store/cart';
import { isVerifiedMember, useSessionStore } from '@/lib/store/session';
import { LEGAL_AGE } from '@/lib/sa-id';
import { cn } from '@/lib/utils';
import type { BaseUom, ProductCategory, ProductVariantRow } from '@/types/database';

/**
 * Module C — the 420 Cartel Private Reserve catalogue.
 *
 * Gated on a verified 18+ member session. Every tier button knows how much of
 * its parent batch balance it will consume, so the cart can never commit more
 * grams, millilitres or units than the vault actually holds — the same rule
 * `process_cartel_order` enforces again at execution.
 */

type TabKey = 'ALL' | ProductCategory;

const TABS: { key: TabKey; label: string }[] = [
  { key: 'ALL', label: 'All Reserve' },
  { key: 'FLOWER', label: 'Craft Flower (g)' },
  { key: 'ELIXIR_OIL', label: 'Elixirs & Oils (ml)' },
  { key: 'PRE_ROLL', label: 'Hash Holes (ea)' },
  { key: 'EDIBLE', label: 'Edibles (ea)' },
];

export default function ShopPage() {
  const member = useSessionStore((state) => state.member);
  const signIn = useSessionStore((state) => state.signIn);
  const syncMember = useSessionStore((state) => state.syncMember);

  const [tab, setTab] = useState<TabKey>('ALL');
  const [cartOpen, setCartOpen] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const branchId = useCartStore((state) => state.branchId) ?? DEFAULT_BRANCH_ID;
  const setBranch = useCartStore((state) => state.setBranch);

  useEffect(() => {
    if (!useCartStore.getState().branchId) setBranch(DEFAULT_BRANCH_ID);
  }, [setBranch]);

  const catalogue = useCartelQuery(() => listCatalogue(branchId), [branchId]);

  // Keep the cached member row fresh — balances and rank move with every order.
  const memberId = member?.id ?? null;
  useEffect(() => {
    if (!memberId) return;
    void listMembers()
      .then((rows) => {
        const fresh = rows.find((row) => row.id === memberId);
        if (fresh) syncMember(fresh);
      })
      .catch(() => undefined);
  }, [memberId, syncMember]);

  const verified = isVerifiedMember(member);

  const simulateMember = useCallback(async () => {
    setSimulating(true);
    setNotice(null);
    try {
      const members = await listMembers();
      const demo =
        members.find((row) => row.member_code === 'CARTEL-0420') ??
        members.find((row) => isVerifiedMember(row));
      if (!demo) {
        setNotice('No verified member exists yet. Complete onboarding to create one.');
        return;
      }
      signIn(demo, true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load a demo member.');
    } finally {
      setSimulating(false);
    }
  }, [signIn]);

  const entries = useMemo(() => {
    const all = catalogue.data ?? [];
    if (tab === 'ALL') return all;
    return all.filter((entry) => entry.product.category === tab);
  }, [catalogue.data, tab]);

  const cartCount = useCartStore(selectCartCount);

  return (
    <main className="relative min-h-screen bg-void pb-32">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-surface-fade" />

      <div className="container relative pt-14">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Eyebrow>Private Reserve Catalogue</Eyebrow>
            <h1 className="mt-3 display-md text-white">
              The <span className="gold-text">Vault</span>
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Small-batch allocations drawn from live vault balances. Every tier shows exactly what
              it deducts in grams, millilitres or units.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {member ? (
              <Card className="flex items-center gap-3 px-4 py-2.5">
                <ShieldCheck className="size-4 text-emerald-300" />
                <div className="flex flex-col">
                  <span className="font-mono text-[0.625rem] tracking-[0.2em] text-gold">
                    {member.member_code}
                  </span>
                  <span className="font-mono text-[0.5625rem] uppercase tracking-[0.18em] text-faint">
                    {isVipStanding(member) ? 'VIP Pricing Active' : member.status.replace(/_/g, ' ')}
                  </span>
                </div>
              </Card>
            ) : null}

            <Button variant="gold" size="lg" onClick={() => setCartOpen(true)}>
              <ShoppingBag className="size-4" />
              Crate
              {cartCount > 0 ? (
                <span className="ml-1 bg-void px-1.5 font-mono text-[0.625rem] text-gold">
                  {cartCount}
                </span>
              ) : null}
            </Button>
          </div>
        </header>

        {/* Category tabs */}
        <div
          role="tablist"
          aria-label="Catalogue categories"
          className="mt-10 flex flex-wrap gap-2 border-b border-[color:var(--border-mono)] pb-4"
        >
          {TABS.map((entry) => (
            <Button
              key={entry.key}
              role="tab"
              aria-selected={tab === entry.key}
              variant={tab === entry.key ? 'active' : 'ghost'}
              size="sm"
              onClick={() => setTab(entry.key)}
            >
              {entry.label}
            </Button>
          ))}
        </div>

        {notice ? (
          <p className="mt-6 border border-amber-500/50 bg-amber-500/10 px-4 py-3 font-mono text-[0.6875rem] text-amber-300">
            {notice}
          </p>
        ) : null}

        {catalogue.error ? (
          <p className="mt-8 border border-destructive/60 bg-destructive/10 px-4 py-3 font-mono text-[0.6875rem] text-red-300">
            {catalogue.error}
          </p>
        ) : null}

        {/* Catalogue grid */}
        <div className="relative mt-8">
          <div
            className={cn(
              'grid gap-5 transition-all duration-500 md:grid-cols-2 xl:grid-cols-3',
              !verified && 'pointer-events-none select-none blur-[6px]',
            )}
            aria-hidden={!verified}
          >
            {catalogue.loading && entries.length === 0
              ? Array.from({ length: 6 }).map((_, index) => (
                  <Card key={index} className="h-80 animate-pulse bg-surface/60" />
                ))
              : entries.map((entry) => (
                  <ProductCard
                    key={entry.product.id}
                    entry={entry}
                    onNotice={setNotice}
                    onAdded={() => setCartOpen(true)}
                  />
                ))}
          </div>

          {!catalogue.loading && entries.length === 0 && verified ? (
            <EmptyState
              title="Nothing allocated here yet"
              description="No active batches in this category at the Sandton vault. Try another category."
            />
          ) : null}

          {/* 18+ member price lock */}
          {!verified ? (
            <div className="absolute inset-0 z-20 flex items-start justify-center pt-10">
              <Card className="mx-4 flex w-full max-w-md flex-col items-center gap-5 border-gold/40 p-8 text-center">
                <Lock className="size-7 text-gold" />
                <div>
                  <Eyebrow>{LEGAL_AGE}+ Member Price Lock</Eyebrow>
                  <h2 className="mt-3 font-display text-xl uppercase tracking-wide text-white">
                    Verified Members Only
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    Allocation pricing is visible to verified adult members of the collective.
                    Complete the {LEGAL_AGE}+ onboarding to unlock the reserve.
                  </p>
                </div>

                <div className="flex w-full flex-col gap-2.5">
                  <Button variant="gold" size="lg" block asChild>
                    <Link href="/onboarding">
                      Begin {LEGAL_AGE}+ Onboarding
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    block
                    onClick={() => void simulateMember()}
                    disabled={simulating}
                  >
                    {simulating ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                    Simulate Verified Member (CARTEL-0420)
                  </Button>
                </div>

                <p className="font-mono text-[0.5625rem] uppercase leading-relaxed tracking-[0.2em] text-faint">
                  {IS_LOCAL_PREVIEW
                    ? 'Local preview · no credentials configured'
                    : 'Simulation is for operator testing only'}
                </p>
              </Card>
            </div>
          ) : null}
        </div>
      </div>

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Product card
// ---------------------------------------------------------------------------

function ProductCard({
  entry,
  onNotice,
  onAdded,
}: {
  entry: CatalogueEntry;
  onNotice: (message: string | null) => void;
  onAdded: () => void;
}) {
  const { product, variants, batches, stock } = entry;
  const member = useSessionStore((state) => state.member);
  const addLine = useCartStore((state) => state.addLine);
  const lines = useCartStore((state) => state.lines);

  const sellable = variants.filter((variant) => !variant.is_custom_amount);
  const [selectedId, setSelectedId] = useState<string | null>(sellable[1]?.id ?? sellable[0]?.id ?? null);
  const selected = sellable.find((variant) => variant.id === selectedId) ?? sellable[0] ?? null;

  const leadBatch = batches.find((batch) => batch.remaining_base_qty > 0) ?? batches[0] ?? null;
  const committed = cartProductBaseQty(lines, product.id);
  const headroom = roundBaseQty(stock.available_base_qty - committed, product.base_uom);

  const add = useCallback(
    (variant: ProductVariantRow) => {
      if (variant.base_quantity > headroom + 1e-9) {
        onNotice(
          `${product.name}: only ${formatBaseQty(Math.max(0, headroom), product.base_uom)} left to allocate — ${variant.label} needs ${formatBaseQty(variant.base_quantity, product.base_uom)}.`,
        );
        return;
      }
      onNotice(null);
      addLine({
        productId: product.id,
        productName: product.name,
        productSlug: product.slug,
        category: product.category,
        variantId: variant.id,
        variantLabel: variant.label,
        baseUom: product.base_uom,
        baseQuantity: variant.base_quantity,
        customBaseQty: null,
        quantity: 1,
        unitPriceCents: tierPriceCents(variant, member),
        heroMediaUrl: product.hero_media_url,
      });
      onAdded();
    },
    [addLine, headroom, member, onAdded, onNotice, product],
  );

  const gaugePct = stock.remaining_base_qty > 0
    ? Math.min(100, Math.max(2, (stock.available_base_qty / Math.max(stock.remaining_base_qty, 1)) * 100))
    : 0;

  return (
    <Card interactive className="flex flex-col">
      {/* Media / hover reel */}
      <div className="relative aspect-[4/3] overflow-hidden border-b border-[color:var(--border-mono)] bg-gradient-to-br from-elevated to-void">
        {product.hero_media_url ? (
          <video
            src={product.hero_media_url}
            muted
            loop
            playsInline
            preload="none"
            className="size-full object-cover opacity-80"
            onMouseEnter={(event) => void event.currentTarget.play().catch(() => undefined)}
            onMouseLeave={(event) => {
              event.currentTarget.pause();
              event.currentTarget.currentTime = 0;
            }}
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <span className="font-display text-5xl font-black uppercase tracking-tighter text-white/[0.05]">
              {UOM_SYMBOL[product.base_uom]}
            </span>
          </div>
        )}

        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {leadBatch ? <Badge tone="gold">{leadBatch.batch_code}</Badge> : null}
          {stock.is_low_stock && stock.available_base_qty > 0 ? (
            <Badge tone="warn">Low Stock</Badge>
          ) : null}
          {stock.available_base_qty <= 0 ? <Badge tone="danger">Depleted</Badge> : null}
        </div>

        {product.is_featured ? (
          <Badge tone="mono" className="absolute right-3 top-3">
            Featured
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div>
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-display text-lg uppercase leading-tight tracking-wide text-white">
              {product.name}
            </h3>
            <span className="shrink-0 font-mono text-[0.5625rem] uppercase tracking-[0.2em] text-faint">
              {CATEGORY_LABEL[product.category]}
            </span>
          </div>
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted-foreground">
            {product.short_tagline}
          </p>
        </div>

        {/* Lab figures */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <LabStat label="Strain" value={product.strain.replace(/_/g, ' ')} />
          {product.thc_pct !== null ? (
            <LabStat label="THC" value={`${product.thc_pct.toFixed(1)}%`} gold />
          ) : null}
          {product.cbd_pct !== null ? (
            <LabStat label="CBD" value={`${product.cbd_pct.toFixed(1)}%`} />
          ) : null}
        </div>

        {/* Terpene pills */}
        {product.terpene_tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {product.terpene_tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="border border-[color:var(--border-mono)] px-2 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.14em] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        {/* Live stock gauge */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[0.5625rem] uppercase tracking-[0.24em] text-faint">
              Vault Balance
            </span>
            <span className="font-mono text-[0.75rem] tabular-nums text-gold">
              {stock.available_base_qty.toFixed(UOM_PRECISION[product.base_uom])}{' '}
              {UOM_SYMBOL[product.base_uom]} remaining
            </span>
          </div>
          <div className="h-1 w-full bg-white/[0.06]">
            <div
              className="h-full bg-gold-sheen transition-all duration-500"
              style={{ width: `${gaugePct}%` }}
            />
          </div>
          {committed > 0 ? (
            <span className="font-mono text-[0.5625rem] uppercase tracking-[0.18em] text-muted-foreground">
              {formatBaseQty(committed, product.base_uom)} already in your crate
            </span>
          ) : null}
        </div>

        <Separator />

        {/* Tier selector */}
        <div className="flex flex-wrap gap-1.5">
          {sellable.map((variant) => {
            const affordable = variant.base_quantity <= headroom + 1e-9;
            return (
              <button
                key={variant.id}
                type="button"
                onClick={() => setSelectedId(variant.id)}
                disabled={!affordable}
                className={cn(
                  'flex flex-col items-start border px-2.5 py-1.5 transition-colors duration-200',
                  selected?.id === variant.id
                    ? 'border-gold bg-gold/10 text-gold'
                    : 'border-[color:var(--border-mono)] text-muted-foreground hover:border-gold/50',
                  !affordable && 'cursor-not-allowed opacity-35',
                )}
              >
                <span className="font-mono text-[0.625rem] uppercase tracking-[0.12em]">
                  {variant.label}
                </span>
                <span className="font-mono text-[0.625rem] tabular-nums">
                  {formatCents(tierPriceCents(variant, member))}
                </span>
              </button>
            );
          })}
        </div>

        {/* Add */}
        <div className="mt-auto flex items-end justify-between gap-3 pt-1">
          <div className="flex flex-col">
            {selected ? (
              <>
                <span className="font-mono text-xl tabular-nums text-white">
                  {formatCents(tierPriceCents(selected, member))}
                </span>
                {isVipStanding(member) ? (
                  <span className="font-mono text-[0.5625rem] uppercase tracking-[0.18em] text-emerald-300">
                    VIP price applied
                  </span>
                ) : (
                  <span className="font-mono text-[0.5625rem] uppercase tracking-[0.18em] text-faint">
                    VIP {formatCents(vipPriceCents(selected))}
                  </span>
                )}
              </>
            ) : null}
          </div>

          <Button
            variant="gold"
            size="sm"
            disabled={!selected || selected.base_quantity > headroom + 1e-9}
            onClick={() => selected && add(selected)}
          >
            <Plus className="size-3.5" />
            Allocate
          </Button>
        </div>

        {selected && product.base_uom !== 'UNITS' ? (
          <p className="font-mono text-[0.5rem] uppercase tracking-[0.16em] text-faint">
            Deducts {formatBaseQty(selected.base_quantity, product.base_uom)} ·{' '}
            {tiersAvailable(stock.available_base_qty, selected.base_quantity)} available
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function LabStat({
  label,
  value,
  gold = false,
}: {
  label: string;
  value: string;
  gold?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-[0.5rem] uppercase tracking-[0.26em] text-faint">
        {label}
      </span>
      <span
        className={cn(
          'font-mono text-[0.8125rem] uppercase tabular-nums',
          gold ? 'text-gold' : 'text-foreground',
        )}
      >
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Multi-unit cart drawer
// ---------------------------------------------------------------------------

const UOM_ORDER: BaseUom[] = ['GRAMS', 'MILLILITERS', 'UNITS'];

function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const lines = useCartStore((state) => state.lines);
  const setLineQuantity = useCartStore((state) => state.setLineQuantity);
  const removeLine = useCartStore((state) => state.removeLine);
  const clear = useCartStore((state) => state.clear);
  const subtotal = useCartStore(selectCartSubtotalCents);
  const uomTotals = useCartStore(selectCartUomTotals);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Close crate"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-void/80 backdrop-blur-sm"
        />
      ) : null}

      <aside
        aria-label="Vault crate"
        aria-hidden={!open}
        className={cn(
          'fixed right-0 top-0 z-50 flex h-full w-[min(26rem,100vw)] flex-col border-l border-[color:var(--border-hard)] bg-surface transition-transform duration-400 ease-cartel',
          open ? 'translate-x-0' : 'pointer-events-none translate-x-full',
        )}
      >
        <header className="flex items-center justify-between border-b border-[color:var(--border-mono)] px-5 py-4">
          <div>
            <Eyebrow>Vault Crate</Eyebrow>
            <p className="mt-1 font-mono text-[0.625rem] uppercase tracking-[0.2em] text-muted-foreground">
              {lines.length} {lines.length === 1 ? 'allocation' : 'allocations'}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </header>

        {/* Multi-unit summary */}
        <div className="grid grid-cols-3 border-b border-[color:var(--border-mono)]">
          {UOM_ORDER.map((uom) => (
            <div
              key={uom}
              className="flex flex-col items-center gap-1 border-r border-[color:var(--border-mono)] px-2 py-3.5 last:border-r-0"
            >
              <span className="font-mono text-[0.5rem] uppercase tracking-[0.24em] text-faint">
                {uom === 'GRAMS' ? 'Grams' : uom === 'MILLILITERS' ? 'Millilitres' : 'Units'}
              </span>
              <span className="font-mono text-base tabular-nums text-gold">
                {(uomTotals[uom] ?? 0).toFixed(UOM_PRECISION[uom])}
                <span className="ml-0.5 text-[0.625rem] text-muted-foreground">
                  {UOM_SYMBOL[uom]}
                </span>
              </span>
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto cartel-scroll">
          {lines.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Crate is empty"
                description="Pick a tier from the reserve to begin your allocation."
              />
            </div>
          ) : (
            <ul className="divide-y divide-[color:var(--border-mono)]">
              {lines.map((line) => (
                <li key={line.key} className="flex flex-col gap-2.5 px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-sm uppercase tracking-wide text-white">
                        {line.productName}
                      </p>
                      <p className="mt-0.5 font-mono text-[0.625rem] uppercase tracking-[0.16em] text-gold">
                        {line.variantLabel}
                      </p>
                    </div>
                    <span className="font-mono text-sm tabular-nums text-white">
                      {formatCents(cartLineTotalCents(line))}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center border border-[color:var(--border-mono)]">
                      <button
                        type="button"
                        aria-label={`Decrease ${line.productName}`}
                        onClick={() => setLineQuantity(line.key, line.quantity - 1)}
                        className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:text-gold"
                      >
                        <Minus className="size-3" />
                      </button>
                      <span className="w-9 text-center font-mono text-sm tabular-nums text-white">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label={`Increase ${line.productName}`}
                        onClick={() => setLineQuantity(line.key, line.quantity + 1)}
                        className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:text-gold"
                      >
                        <Plus className="size-3" />
                      </button>
                    </div>

                    <span className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-muted-foreground">
                      {formatBaseQty(cartLineBaseQty(line), line.baseUom)} deducted
                    </span>

                    <button
                      type="button"
                      aria-label={`Remove ${line.productName}`}
                      onClick={() => removeLine(line.key)}
                      className="text-faint transition-colors hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="border-t border-[color:var(--border-mono)] p-5">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[0.625rem] uppercase tracking-[0.24em] text-faint">
              Subtotal
            </span>
            <span className="font-mono text-2xl tabular-nums text-white">
              {formatCents(subtotal)}
            </span>
          </div>
          <p className="mt-1 font-mono text-[0.5625rem] uppercase tracking-[0.18em] text-faint">
            Delivery and discounts calculated at checkout
          </p>

          <div className="mt-4 flex flex-col gap-2">
            <Button variant="gold" size="lg" block disabled={lines.length === 0} asChild>
              <Link href="/checkout">
                <Check className="size-4" />
                Proceed to Checkout
              </Link>
            </Button>
            {lines.length > 0 ? (
              <Button variant="ghost" size="sm" block onClick={clear}>
                Empty the crate
              </Button>
            ) : null}
          </div>
        </footer>
      </aside>
    </>
  );
}
