'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
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
  listCategories,
  getMember,
  listMembers,
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
  const [gradeFilter, setGradeFilter] = useState<string>('ALL');
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
  const categoriesQuery = useCartelQuery(() => listCategories(), []);
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);
  const gradeNameById = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );
  const catalogue = useCartelQuery(() => listCatalogue(branchId), [branchId]);

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
    void getMember(memberId)
      .then((fresh) => {
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
    return all.filter((entry) => {
      if (tab !== 'ALL' && entry.product.category !== tab) return false;
      if (gradeFilter !== 'ALL' && entry.product.category_id !== gradeFilter) return false;
      return true;
    });
  }, [catalogue.data, tab, gradeFilter]);

  const cartCount = useCartStore(selectCartCount);
  const cartSubtotal = useCartStore(selectCartSubtotalCents);

  return (
    <main className="relative min-h-screen bg-void pb-28 sm:pb-32">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 " />

      <div className="container relative pt-8 sm:pt-14">
        <header className="flex flex-wrap items-end justify-between gap-5 sm:gap-6">
          <div>
            <Eyebrow>Private Reserve Catalogue</Eyebrow>
            <h1 className="mt-2 sm:mt-3 font-display text-3xl uppercase text-white sm:text-4xl md:text-display-md">
              The <span className="">Vault</span>
            </h1>
            <p className="mt-2 sm:mt-3 max-w-xl text-xs sm:text-sm md:type-ui leading-relaxed text-ash">
              Small-batch allocations drawn from live vault balances. Every tier shows exactly what
              it deducts in grams, millilitres or units.
            </p>
          </div>

          <div className="flex w-full flex-col sm:w-auto sm:flex-row sm:flex-wrap sm:items-center gap-2.5 sm:gap-3">
            {branches.length > 0 ? (
              <label className="flex h-11 w-full sm:h-14 sm:w-auto items-center gap-2 border border-[color:var(--border-subtle)] bg-surface px-3 font-mono text-xs sm:type-ui text-white">
                <Building2 className="size-4 shrink-0 text-gold" />
                <select
                  aria-label="Fulfilling Dispensary Branch"
                  value={branchId}
                  onChange={(e) => {
                    setNotice(null);
                    setBranch(e.target.value);
                  }}
                  className="w-full bg-transparent font-mono text-xs sm:type-ui text-white focus:outline-none"
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
              <Card className="flex h-11 w-full sm:h-14 sm:w-auto items-center gap-3 px-3 sm:px-4">
                <ShieldCheck className="size-4 shrink-0 text-foreground" />
                <div className="flex flex-row sm:flex-col items-baseline sm:items-start justify-between w-full sm:w-auto gap-2 sm:gap-0">
                  <span className="font-mono text-xs sm:text-base sm:leading-tight text-foreground">
                    {member.member_code}
                  </span>
                  <span className="font-mono text-[11px] sm:text-sm sm:leading-tight text-ash">
                    {isVipStanding(member) ? 'VIP Pricing Active' : member.status.replace(/_/g, ' ')}
                  </span>
                </div>
              </Card>
            ) : null}

            <Button
              variant="gold"
              size="lg"
              onClick={() => setCartOpen(true)}
              className="w-full sm:w-auto h-11 sm:h-14 px-5"
            >
              <ShoppingBag className="size-4" />
              Crate
              {cartCount > 0 ? (
                <span className="ml-1 bg-void px-1.5 font-mono text-xs sm:type-ui text-foreground">
                  {cartCount}
                </span>
              ) : null}
            </Button>
          </div>
        </header>

        {/* Category tabs */}
        <div className="mt-7 sm:mt-10 border-b border-[color:var(--border-mono)] pb-3 sm:pb-4">
          <div
            role="tablist"
            aria-label="Catalogue categories"
            className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap"
          >
            {TABS.map((entry) => (
              <Button
                key={entry.key}
                role="tab"
                aria-selected={tab === entry.key}
                variant={tab === entry.key ? 'active' : 'ghost'}
                size="sm"
                className="shrink-0 px-3.5 h-9 text-xs sm:text-sm"
                onClick={() => {
                  setTab(entry.key);
                  if (entry.key !== 'FLOWER' && entry.key !== 'ALL') setGradeFilter('ALL');
                }}
              >
                {entry.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Flower Grade Filter Pills */}
        {(tab === 'ALL' || tab === 'FLOWER') && categories.length > 0 ? (
          <div className="mt-3 sm:mt-4 flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
            <span className="shrink-0 font-mono text-[11px] sm:text-xs uppercase tracking-wider text-ash pr-1">Grade:</span>
            <Button
              variant={gradeFilter === 'ALL' ? 'active' : 'ghost'}
              size="sm"
              className="shrink-0 text-xs px-3 h-8"
              onClick={() => setGradeFilter('ALL')}
            >
              All Grades
            </Button>
            {categories.map((cat) => (
              <Button
                key={cat.id}
                variant={gradeFilter === cat.id ? 'active' : 'ghost'}
                size="sm"
                className="shrink-0 text-xs px-3 h-8"
                onClick={() => setGradeFilter(cat.id)}
              >
                {cat.name}
              </Button>
            ))}
          </div>
        ) : null}

        {notice ? (
          <p className="mt-6 border border-foreground bg-transparent px-3.5 py-2.5 sm:px-4 sm:py-3 font-mono text-xs sm:type-ui text-foreground">
            {notice}
          </p>
        ) : null}

        {catalogue.error ? (
          <p className="mt-8 border border-foreground bg-transparent px-3.5 py-2.5 sm:px-4 sm:py-3 font-mono text-xs sm:type-ui text-foreground">
            {catalogue.error}
          </p>
        ) : null}

        {/* Catalogue grid */}
        <div className="relative mt-6 sm:mt-8">
          {verified ? (
            <div className="grid gap-x-6 gap-y-10 sm:gap-x-[18px] sm:gap-y-12 md:grid-cols-2 xl:grid-cols-3">
              {entries.map((entry) => (
                <ProductCard
                  key={entry.product.id}
                  entry={entry}
                  gradeName={entry.product.category_id ? gradeNameById.get(entry.product.category_id) ?? null : null}
                  live={stockSync.snapshotFor(entry.product.id)}
                  liveWarning={stockSync.warnings[entry.product.id] ?? null}
                  onNotice={setNotice}
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
                    className="ghost-link text-left text-[19px] text-ash"
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

      {cartCount > 0 && !cartOpen ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gold/40 bg-void/95 px-4 py-3 backdrop-blur-md sm:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="font-mono text-xs text-ash">
                {cartCount} {cartCount === 1 ? 'allocation' : 'allocations'}
              </span>
              <span className="font-mono text-base font-bold tabular-nums text-white">
                {formatCents(cartSubtotal)}
              </span>
            </div>
            <Button
              variant="gold"
              size="sm"
              onClick={() => setCartOpen(true)}
              className="h-10 px-5 text-xs font-mono"
            >
              <ShoppingBag className="size-4" />
              View Crate
            </Button>
          </div>
        </div>
      ) : null}

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Product card
// ---------------------------------------------------------------------------

function ProductCard({
  entry,
  gradeName,
  live,
  liveWarning,
  onNotice,
}: {
  entry: CatalogueEntry;
  gradeName?: string | null;
  /** Realtime snapshot from product_stock_board, when the feed is up. */
  live: StockSnapshot | null;
  liveWarning: string | null;
  onNotice: (message: string | null) => void;
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

  // Confirms the add in place instead of throwing the crate drawer over the page.
  const [added, setAdded] = useState(false);
  useEffect(() => {
    if (!added) return;
    const timer = window.setTimeout(() => setAdded(false), 1400);
    return () => window.clearTimeout(timer);
  }, [added]);

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
      setAdded(true);
    },
    [addLine, headroom, member, onNotice, product],
  );

  const gaugePct = remainingBaseQty > 0
    ? Math.min(100, Math.max(2, (availableBaseQty / Math.max(remainingBaseQty, 1)) * 100))
    : 0;

  return (
    <article className="flex flex-col">
      {/* Media: photography, or a hover reel once one has been generated. */}
      <div className="relative aspect-[4/3] sm:aspect-[3/4] overflow-hidden">
        {product.hero_media_url && !/\.(mp4|webm)(\?|$)/i.test(product.hero_media_url) ? (
          <RevealImage
            src={product.hero_media_url}
            alt={product.name}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
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
            <span className="font-display text-4xl sm:text-5xl font-black uppercase text-ash">
              {UOM_SYMBOL[product.base_uom]}
            </span>
          </div>
        )}

        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5 [&>*]:bg-void">
          {leadBatch ? <Badge tone="gold">{leadBatch.batch_code}</Badge> : null}
          {gradeName ? <Badge tone="mono">{gradeName}</Badge> : null}
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

      <div className="flex flex-1 flex-col gap-3 sm:gap-4 pt-3.5 sm:pt-[18px]">
        <div>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-3">
            <h3 className="font-display text-base sm:text-lg uppercase leading-tight text-white">
              {product.name}
            </h3>
            <span className="shrink-0 font-mono text-xs sm:type-ui text-ash">
              {gradeName ? `${CATEGORY_LABEL[product.category]} · ${gradeName}` : CATEGORY_LABEL[product.category]}
            </span>
          </div>
          <p className="mt-1.5 text-xs sm:text-sm md:type-ui leading-relaxed text-ash">
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
                className="border border-[color:var(--border-mono)] px-2 py-0.5 font-mono text-[11px] sm:text-xs text-ash"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : (
          // Holds the pill row's height so the gauge lines up across a grid row.
          <div aria-hidden className="hidden h-[22px] md:block" />
        )}

        {/* Live stock gauge */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-xs sm:type-ui text-ash">
              Vault Balance
            </span>
            <span className="font-mono text-xs sm:type-ui tabular-nums text-foreground">
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
            <span className="font-mono text-xs sm:type-ui text-ash">
              {formatBaseQty(committed, product.base_uom)} already in your crate
            </span>
          ) : null}

          {/* A POS sale moved this batch while the tab was open. */}
          {liveWarning ? (
            <span className="mt-1 border border-foreground bg-transparent px-2 py-1 font-mono text-xs sm:type-ui text-foreground">
              {liveWarning}
            </span>
          ) : null}
        </div>

        <Separator />

        {/* Tier selector */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-2">
          {sellable.map((variant) => {
            const affordable = variant.base_quantity <= headroom + 1e-9;
            return (
              <button
                key={variant.id}
                type="button"
                onClick={() => setSelectedId(variant.id)}
                disabled={!affordable}
                aria-pressed={selected?.id === variant.id}
                className={cn(
                  'flex min-h-[44px] flex-col items-start justify-center border px-2.5 py-2 sm:py-1.5 transition-[border-color,color,transform] duration-150 ease-out active:scale-[0.97]',
                  selected?.id === variant.id
                    ? 'border-gold bg-gold/10 text-gold'
                    : 'border-[color:var(--border-mono)] text-ash hover:border-ash',
                  !affordable && 'cursor-not-allowed opacity-35',
                )}
              >
                <span className="font-mono text-xs sm:text-sm font-medium">
                  {variant.label}
                </span>
                <span className="font-mono text-xs sm:text-sm tabular-nums">
                  {formatCents(tierPriceCents(variant, member))}
                </span>
              </button>
            );
          })}
        </div>

        {/* Add */}
        <div className="mt-auto flex flex-col gap-3 sm:gap-4">
        <div className="flex items-end justify-between gap-3 pt-1">
          <div className="flex flex-col">
            {selected ? (
              <>
                <span className="font-mono text-lg sm:text-xl tabular-nums text-white">
                  {formatCents(tierPriceCents(selected, member))}
                </span>
                {isVipStanding(member) ? (
                  <span className="font-mono text-[11px] sm:text-xs text-foreground">
                    VIP price applied
                  </span>
                ) : (
                  <span className="font-mono text-[11px] sm:text-xs text-ash">
                    VIP {formatCents(vipPriceCents(selected))}
                  </span>
                )}
              </>
            ) : null}
          </div>

        </div>

        <Button
          variant="gold"
          size="default"
          block
          disabled={!selected || selected.base_quantity > headroom + 1e-9}
          onClick={() => selected && add(selected)}
          aria-live="polite"
          className="h-12 border-gold bg-gold font-mono text-sm font-semibold uppercase tracking-wider text-void hover:bg-gold/90 hover:border-gold active:bg-gold disabled:border-[color:var(--border-mono)] disabled:bg-transparent"
        >
          {added ? (
            <>
              <Check className="size-4" />
              Added to Vault
            </>
          ) : (
            <>
              <Plus className="size-4" />
              Add to Vault
              {selected ? <span className="font-normal opacity-70">· {selected.label}</span> : null}
            </>
          )}
        </Button>

        {/* Always rendered so the price row sits on the same line in every card. */}
        <p className="min-h-[1lh] font-mono text-[11px] sm:text-xs text-ash">
          {selected && product.base_uom !== 'UNITS' ? (
            <>
              Deducts {formatBaseQty(selected.base_quantity, product.base_uom)} ·{' '}
              {tiersAvailable(availableBaseQty, selected.base_quantity)} available
            </>
          ) : null}
        </p>
        </div>
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
      <span className="font-mono text-[11px] sm:text-xs text-ash">
        {label}
      </span>
      <span
        className={cn(
          'font-mono text-xs sm:text-sm tabular-nums',
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
          'fixed right-0 top-0 z-50 flex h-full w-full sm:w-[min(26rem,100vw)] flex-col border-l border-[color:var(--border-hard)] bg-surface transition-transform ease-drawer',
          open ? 'translate-x-0 duration-300' : 'pointer-events-none translate-x-full duration-200',
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-[color:var(--border-mono)] px-4 py-3 sm:px-5 sm:py-4">
          <button
            type="button"
            onClick={onClose}
            className="-ml-1 inline-flex h-11 items-center gap-2 border border-gold/50 px-3 font-mono text-xs uppercase tracking-wider text-gold transition-[background-color,border-color,transform] duration-150 ease-out hover:border-gold hover:bg-gold/10 active:scale-[0.97]"
          >
            <ArrowLeft className="size-4" />
            Back to Vault
          </button>
          <div className="text-right">
            <Eyebrow>Vault Crate</Eyebrow>
            <p className="mt-0.5 sm:mt-1 font-mono text-xs sm:type-ui text-ash">
              {lines.length} {lines.length === 1 ? 'allocation' : 'allocations'}
            </p>
          </div>
        </header>

        {/* Multi-unit summary */}
        <div className="grid grid-cols-3 border-b border-[color:var(--border-mono)]">
          {UOM_ORDER.map((uom) => (
            <div
              key={uom}
              className="flex flex-col items-center gap-0.5 sm:gap-1 border-r border-[color:var(--border-mono)] px-1.5 py-2.5 sm:px-2 sm:py-3.5 last:border-r-0"
            >
              <span className="font-mono text-[11px] sm:text-xs text-ash">
                {uom === 'GRAMS' ? 'Grams' : uom === 'MILLILITERS' ? 'Millilitres' : 'Units'}
              </span>
              <span className="font-mono text-xs sm:text-sm tabular-nums text-foreground font-medium">
                {(uomTotals[uom] ?? 0).toFixed(UOM_PRECISION[uom])}
                <span className="ml-0.5 text-[11px] sm:text-xs text-ash">
                  {UOM_SYMBOL[uom]}
                </span>
              </span>
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto cartel-scroll">
          {lines.length === 0 ? (
            <div className="p-4 sm:p-5">
              <EmptyState
                title="Crate is empty"
                description="Pick a tier from the reserve to begin your allocation."
              />
            </div>
          ) : (
            <ul className="divide-y divide-[color:var(--border-mono)]">
              {lines.map((line) => (
                <li key={line.key} className="flex flex-col gap-2.5 px-4 py-3.5 sm:px-5 sm:py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-sm uppercase text-white">
                        {line.productName}
                      </p>
                      <p className="mt-0.5 font-mono text-xs sm:type-ui text-foreground">
                        {line.variantLabel}
                      </p>
                    </div>
                    <span className="font-mono text-sm sm:type-ui tabular-nums text-white font-medium">
                      {formatCents(cartLineTotalCents(line))}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 sm:gap-3">
                    <div className="flex items-center border border-[color:var(--border-mono)]">
                      <button
                        type="button"
                        aria-label={`Decrease ${line.productName}`}
                        onClick={() => setLineQuantity(line.key, line.quantity - 1)}
                        className="flex size-9 sm:size-8 items-center justify-center text-ash transition-colors hover:text-foreground"
                      >
                        <Minus className="size-3.5 sm:size-3" />
                      </button>
                      <span className="w-8 sm:w-9 text-center font-mono text-xs sm:type-ui tabular-nums text-white">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label={`Increase ${line.productName}`}
                        onClick={() => setLineQuantity(line.key, line.quantity + 1)}
                        className="flex size-9 sm:size-8 items-center justify-center text-ash transition-colors hover:text-foreground"
                      >
                        <Plus className="size-3.5 sm:size-3" />
                      </button>
                    </div>

                    <span className="font-mono text-[11px] sm:text-xs text-ash truncate">
                      {formatBaseQty(cartLineBaseQty(line), line.baseUom)} deducted
                    </span>

                    <button
                      type="button"
                      aria-label={`Remove ${line.productName}`}
                      onClick={() => removeLine(line.key)}
                      className="p-1.5 -mr-1.5 text-ash transition-colors hover:text-foreground"
                    >
                      <Trash2 className="size-4 sm:size-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="border-t border-[color:var(--border-mono)] p-4 pb-6 sm:p-5">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-xs sm:type-ui text-ash">
              Subtotal
            </span>
            <span className="font-mono text-xl sm:text-2xl tabular-nums text-white font-bold">
              {formatCents(subtotal)}
            </span>
          </div>
          <p className="mt-1 font-mono text-[11px] sm:text-xs text-ash">
            Delivery and discounts calculated at checkout
          </p>

          <div className="mt-4 flex flex-col gap-2">
            <Button variant="gold" size="lg" block disabled={lines.length === 0} asChild className="h-12 sm:h-14 text-sm sm:type-ui">
              <Link href="/checkout">
                <Check className="size-4" />
                Proceed to Checkout
              </Link>
            </Button>
            <Button variant="outline" size="default" block onClick={onClose} className="h-11 text-xs sm:text-sm">
              <ArrowLeft className="size-4" />
              Keep browsing
            </Button>
            {lines.length > 0 ? (
              <Button variant="ghost" size="sm" block onClick={clear} className="h-9 text-xs sm:text-sm">
                Empty the crate
              </Button>
            ) : null}
          </div>
        </footer>
      </aside>
    </>
  );
}
