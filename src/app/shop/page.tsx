'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Building2,
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
import { RevealImage } from '@/components/ui/RevealImage';
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
import {
  IS_LOCAL_PREVIEW,
  listBranches,
  listCatalogue,
  listMembers,
  subscribeToData,
  type CatalogueEntry,
} from '@/lib/data/source';
import { useCartelQuery } from '@/lib/data/useCartelQuery';
import { useCartReservationSync } from '@/hooks/useCartReservationSync';
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
import { useStockBoardSync, type StockSnapshot } from '@/hooks/useStockBoardSync';
import { LEGAL_AGE } from '@/lib/sa-id';
import { useShallow } from 'zustand/react/shallow';
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
  { key: 'VAPE', label: 'Vapes & Carts (ea)' },
  { key: 'ELIXIR_OIL', label: 'Elixirs & Oils (ml)' },
  { key: 'PRE_ROLL', label: 'Hash Holes (ea)' },
  { key: 'EDIBLE', label: 'Edibles (ea)' },
  { key: 'ACCESSORY', label: 'Hardware & Gear (ea)' },
];

export default function ShopPage() {
  const router = useRouter();
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

  useCartReservationSync();

  const branchesQuery = useCartelQuery(() => listBranches(), []);
  const branches = useMemo(() => branchesQuery.data ?? [], [branchesQuery.data]);
  const catalogue = useCartelQuery(() => listCatalogue(branchId), [branchId]);

  useEffect(() => {
    return subscribeToData(() => catalogue.refresh());
  }, [catalogue]);

  /**
   * Live stock for this branch.
   *
   * Subscribes to `product_stock_board` and trims cart lines when a POS sale
   * takes the stock out from under this tab. One socket serves every card on
   * the page; `process_cartel_order` still re-checks under row locks, so this
   * is about telling the shopper early, never about trusting the browser.
   */
  const stockSync = useStockBoardSync({ branchId });

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

  useEffect(() => {
    if (!verified && !IS_LOCAL_PREVIEW) {
      router.replace('/onboarding?next=/vault');
    }
  }, [verified, router]);

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
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 " />

      <div className="container relative pt-14">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Eyebrow>Private Reserve Catalogue</Eyebrow>
            <h1 className="mt-3 display-md text-white">
              The <span className="">Vault</span>
            </h1>
            <p className="mt-3 max-w-xl type-ui leading-relaxed text-ash">
              Small-batch allocations drawn from live vault balances. Every tier shows exactly what
              it deducts in grams, millilitres or units.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {branches.length > 0 ? (
              <label className="flex items-center gap-2 border border-[color:var(--border-subtle)] bg-surface px-3 py-2.5 font-mono type-ui text-white">
                <Building2 className="size-4 text-gold" />
                <select
                  aria-label="Fulfilling Dispensary Branch"
                  value={branchId}
                  onChange={(e) => {
                    setNotice(null);
                    setBranch(e.target.value);
                  }}
                  className="bg-transparent font-mono type-ui text-white focus:outline-none"
                >
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id} className="bg-surface text-white">
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {member ? (
              <Card className="flex items-center gap-3 px-4 py-2.5">
                <ShieldCheck className="size-4 text-foreground" />
                <div className="flex flex-col">
                  <span className="font-mono type-ui text-foreground">
                    {member.member_code}
                  </span>
                  <span className="font-mono type-ui text-ash">
                    {isVipStanding(member) ? 'VIP Pricing Active' : member.status.replace(/_/g, ' ')}
                  </span>
                </div>
              </Card>
            ) : null}

            <Button variant="gold" size="lg" onClick={() => setCartOpen(true)}>
              <ShoppingBag className="size-4" />
              Crate
              {cartCount > 0 ? (
                <span className="ml-1 bg-void px-1.5 font-mono type-ui text-foreground">
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
          <p className="mt-6 border border-foreground bg-transparent px-4 py-3 font-mono type-ui text-foreground">
            {notice}
          </p>
        ) : null}

        {catalogue.error ? (
          <p className="mt-8 border border-foreground bg-transparent px-4 py-3 font-mono type-ui text-foreground">
            {catalogue.error}
          </p>
        ) : null}

        {/* Catalogue grid */}
        <div className="relative mt-8">
          {verified ? (
            <div className="grid gap-[18px] md:grid-cols-2 xl:grid-cols-3 xl:[&>*:nth-child(3n+2)]:mt-[78px]">
              {entries.map((entry) => (
                <ProductCard
                  key={entry.product.id}
                  entry={entry}
                  live={stockSync.snapshotFor(entry.product.id)}
                  liveWarning={stockSync.warnings[entry.product.id] ?? null}
                  onNotice={setNotice}
                  onAdded={() => setCartOpen(true)}
                />
              ))}
            </div>
          ) : null}

          {!catalogue.loading && entries.length === 0 && verified ? (
            <EmptyState
              title="Nothing allocated here yet"
              description="No active batches in this category at the Sandton vault. Try another category."
            />
          ) : null}

          {/* 18+ member price lock */}
          {!verified ? (
            <div className="max-w-2xl py-[43px]">
              <h2 className="display-md">
                {member ? 'Your membership is on hold' : 'Verified members only'}
              </h2>
              <p className="mt-[18px] text-[22px] leading-normal">
                {member
                  ? 'Please contact your nearest branch to restore your access to the Vault.'
                  : `The Vault is open to verified adult members of the collective. Complete the ${LEGAL_AGE}+ onboarding to enter.`}
              </p>
              <div className="mt-[18px] flex flex-col items-start gap-[13px]">
                {member ? (
                  <Link href="/contact" className="ghost-link text-[22px]">
                    Contact a branch
                  </Link>
                ) : (
                  <Link href="/onboarding" className="ghost-link text-[22px]">
                    Begin {LEGAL_AGE}+ onboarding
                  </Link>
                )}
                {/* Client-side demo sign-in: never offered on a live deployment. */}
                {IS_LOCAL_PREVIEW ? (
                  <button
                    type="button"
                    className="ghost-link text-[19px] text-ash"
                    onClick={() => void simulateMember()}
                    disabled={simulating}
                  >
                    {simulating ? 'Loading member…' : 'Simulate verified member (local preview)'}
                  </button>
                ) : null}
              </div>
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
  live,
  liveWarning,
  onNotice,
  onAdded,
}: {
  entry: CatalogueEntry;
  /** Realtime snapshot from product_stock_board, when the feed is up. */
  live: StockSnapshot | null;
  liveWarning: string | null;
  onNotice: (message: string | null) => void;
  onAdded: () => void;
}) {
  const { product, variants, batches, stock } = entry;

  /**
   * Stock source of truth for this card.
   *
   * `entry.stock` comes from `product_stock_levels`, which sits behind staff
   * RLS and so reads as zero for a member. The realtime board is the
   * member-safe projection, so it wins whenever the feed has a row — and a POS
   * sale of the last 3.5g lands here within a tick.
   */
  const availableBaseQty = live ? live.availableBaseQty : stock.available_base_qty;
  const remainingBaseQty = live
    ? Math.max(live.availableBaseQty, stock.remaining_base_qty)
    : stock.remaining_base_qty;
  const isLowStockLive = live ? live.isLowStock : stock.is_low_stock;
  const member = useSessionStore((state) => state.member);
  const addLine = useCartStore((state) => state.addLine);
  const lines = useCartStore((state) => state.lines);
  const syncedBranchId = useCartStore((state) => state.syncedBranchId);
  const syncedHolds = useCartStore((state) => state.syncedHolds);

  const sellable = variants.filter((variant) => !variant.is_custom_amount);
  const [selectedId, setSelectedId] = useState<string | null>(sellable[1]?.id ?? sellable[0]?.id ?? null);
  const selected = sellable.find((variant) => variant.id === selectedId) ?? sellable[0] ?? null;

  const leadBatch = batches.find((batch) => batch.remaining_base_qty > 0) ?? batches[0] ?? null;
  const committed = cartProductBaseQty(lines, product.id);
  const ownHeld = syncedBranchId === stock.branch_id ? (syncedHolds[product.id] ?? 0) : 0;
  const headroom = roundBaseQty(availableBaseQty + ownHeld - committed, product.base_uom);

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

  const gaugePct = remainingBaseQty > 0
    ? Math.min(100, Math.max(2, (availableBaseQty / Math.max(remainingBaseQty, 1)) * 100))
    : 0;

  return (
    <article className="flex flex-col">
      {/* Media: photography, or a hover reel once one has been generated. */}
      <div className="relative aspect-[3/4] overflow-hidden">
        {product.hero_media_url && !/\.(mp4|webm)(\?|$)/i.test(product.hero_media_url) ? (
          <RevealImage src={product.hero_media_url} alt={product.name} />
        ) : product.hero_media_url ? (
          <video
            src={product.hero_media_url}
            muted
            loop
            playsInline
            preload="none"
            className="size-full object-cover"
            onMouseEnter={(event) => void event.currentTarget.play().catch(() => undefined)}
            onMouseLeave={(event) => {
              event.currentTarget.pause();
              event.currentTarget.currentTime = 0;
            }}
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <span className="font-display text-5xl font-black uppercase text-ash">
              {UOM_SYMBOL[product.base_uom]}
            </span>
          </div>
        )}

        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5 [&>*]:bg-void">
          {leadBatch ? <Badge tone="gold">{leadBatch.batch_code}</Badge> : null}
          {isLowStockLive && availableBaseQty > 0 ? (
            <Badge tone="warn">Low Stock</Badge>
          ) : null}
          {availableBaseQty <= 0 ? <Badge tone="danger">Depleted</Badge> : null}
        </div>

        {product.is_featured ? (
          <Badge tone="mono" className="absolute right-3 top-3 bg-void">
            Featured
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-4 pt-[18px]">
        <div>
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-display text-lg uppercase leading-tight text-white">
              {product.name}
            </h3>
            <span className="shrink-0 font-mono type-ui text-ash">
              {CATEGORY_LABEL[product.category]}
            </span>
          </div>
          <p className="mt-1.5 type-ui leading-relaxed text-ash">
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
                className="border border-[color:var(--border-mono)] px-2 py-0.5 font-mono type-ui text-ash"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        {/* Live stock gauge */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <span className="font-mono type-ui text-ash">
              Vault Balance
            </span>
            <span className="font-mono type-ui tabular-nums text-foreground">
              {availableBaseQty.toFixed(UOM_PRECISION[product.base_uom])}{' '}
              {UOM_SYMBOL[product.base_uom]} remaining
            </span>
          </div>
          <div className="h-1 w-full bg-transparent">
            <div
              className="h-full bg-foreground "
              style={{ width: `${gaugePct}%` }}
            />
          </div>
          {committed > 0 ? (
            <span className="font-mono type-ui text-ash">
              {formatBaseQty(committed, product.base_uom)} already in your crate
            </span>
          ) : null}

          {/* A POS sale moved this batch while the tab was open. */}
          {liveWarning ? (
            <span className="mt-1 border border-foreground bg-transparent px-2 py-1 font-mono type-ui text-foreground">
              {liveWarning}
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
                  'flex flex-col items-start border px-2.5 py-1.5 ',
                  selected?.id === variant.id
                    ? 'border-foreground bg-transparent text-foreground'
                    : 'border-[color:var(--border-mono)] text-ash hover:border-ash',
                  !affordable && 'cursor-not-allowed opacity-35',
                )}
              >
                <span className="font-mono type-ui ">
                  {variant.label}
                </span>
                <span className="font-mono type-ui tabular-nums">
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
                  <span className="font-mono type-ui text-foreground">
                    VIP price applied
                  </span>
                ) : (
                  <span className="font-mono type-ui text-ash">
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
          <p className="font-mono type-ui text-ash">
            Deducts {formatBaseQty(selected.base_quantity, product.base_uom)} ·{' '}
            {tiersAvailable(availableBaseQty, selected.base_quantity)} available
          </p>
        ) : null}
      </div>
    </article>
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
      <span className="font-mono type-ui text-ash">
        {label}
      </span>
      <span
        className={cn(
          'font-mono type-ui tabular-nums',
          gold ? 'text-foreground' : 'text-foreground',
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
  const uomTotals = useCartStore(useShallow(selectCartUomTotals));

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
          className="fixed inset-0 z-40 bg-void/80 "
        />
      ) : null}

      <aside
        aria-label="Vault crate"
        aria-hidden={!open}
        className={cn(
          'fixed right-0 top-0 z-50 flex h-full w-[min(26rem,100vw)] flex-col border-l border-[color:var(--border-hard)] bg-surface ',
          open ? 'translate-x-0' : 'pointer-events-none translate-x-full',
        )}
      >
        <header className="flex items-center justify-between border-b border-[color:var(--border-mono)] px-5 py-4">
          <div>
            <Eyebrow>Vault Crate</Eyebrow>
            <p className="mt-1 font-mono type-ui text-ash">
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
              <span className="font-mono type-ui text-ash">
                {uom === 'GRAMS' ? 'Grams' : uom === 'MILLILITERS' ? 'Millilitres' : 'Units'}
              </span>
              <span className="font-mono type-ui tabular-nums text-foreground">
                {(uomTotals[uom] ?? 0).toFixed(UOM_PRECISION[uom])}
                <span className="ml-0.5 type-ui text-ash">
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
                      <p className="font-display text-sm uppercase text-white">
                        {line.productName}
                      </p>
                      <p className="mt-0.5 font-mono type-ui text-foreground">
                        {line.variantLabel}
                      </p>
                    </div>
                    <span className="font-mono type-ui tabular-nums text-white">
                      {formatCents(cartLineTotalCents(line))}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center border border-[color:var(--border-mono)]">
                      <button
                        type="button"
                        aria-label={`Decrease ${line.productName}`}
                        onClick={() => setLineQuantity(line.key, line.quantity - 1)}
                        className="flex size-8 items-center justify-center text-ash transition-colors hover:text-foreground"
                      >
                        <Minus className="size-3" />
                      </button>
                      <span className="w-9 text-center font-mono type-ui tabular-nums text-white">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label={`Increase ${line.productName}`}
                        onClick={() => setLineQuantity(line.key, line.quantity + 1)}
                        className="flex size-8 items-center justify-center text-ash transition-colors hover:text-foreground"
                      >
                        <Plus className="size-3" />
                      </button>
                    </div>

                    <span className="font-mono type-ui text-ash">
                      {formatBaseQty(cartLineBaseQty(line), line.baseUom)} deducted
                    </span>

                    <button
                      type="button"
                      aria-label={`Remove ${line.productName}`}
                      onClick={() => removeLine(line.key)}
                      className="text-ash transition-colors hover:text-foreground"
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
            <span className="font-mono type-ui text-ash">
              Subtotal
            </span>
            <span className="font-mono text-2xl tabular-nums text-white">
              {formatCents(subtotal)}
            </span>
          </div>
          <p className="mt-1 font-mono type-ui text-ash">
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
