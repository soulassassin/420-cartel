'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import {
  AlertTriangle,
  ArrowRightLeft,
  Boxes,
  Building2,
  Check,
  Clock,
  History,
  Loader2,
  Plus,
  ShoppingCart,
  Sliders,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Badge, Card, EmptyState, Eyebrow } from '@/components/ui/surfaces';
import { formatCents } from '@/lib/money';
import {
  CATEGORY_LABEL,
  UOM_PRECISION,
  UOM_SYMBOL,
  formatBaseQty,
} from '@/lib/uom';
import {
  IS_LOCAL_PREVIEW,
  adjustBatchStock,
  createBatch,
  createProduct,
  deleteProduct,
  listActiveCartHolds,
  listBranches,
  listCatalogue,
  listCategories,
  setProductCategory,
  listStockMovements,
  subscribeToData,
  transferBatchStock,
  type CatalogueEntry,
} from '@/lib/data/source';
import { createCartelBrowserClient } from '@/lib/supabase/client';
import { useCartelQuery } from '@/lib/data/useCartelQuery';
import { CatalogueTools } from '@/components/inventory/CatalogueTools';
import { DEFAULT_BRANCH_ID } from '@/lib/demo/fixtures';
import { cn } from '@/lib/utils';
import type {
  BaseUom,
  MasterBatchRow,
  ProductCategory,
  ProductRow,
  StockMovementType,
  StrainType,
} from '@/types/database';

/**
 * Module F — Master Batch Inventory Ledger.
 *
 * 1. Multi-Branch Vault Stock Board (GRAMS, MILLILITERS, UNITS) with product
 *    creation/deletion, branch stock allocation & inter-branch transfers,
 *    FIFO batch inspection, and manual intake/wastage/audit adjustments.
 * 2. Immutable Stock Movement Ledger showing every sale, intake, transfer, and audit.
 */

type Tab = 'BATCHES' | 'MOVEMENTS';
type AllocateMode = 'NEW_BATCH' | 'TRANSFER';

const MOVEMENT_TYPES: StockMovementType[] = [
  'INTAKE',
  'WASTE',
  'SPILLAGE',
  'ADJUSTMENT',
  'RETURN',
];

const PRODUCT_CATEGORIES: ProductCategory[] = [
  'FLOWER',
  'HASH_EXTRACT',
  'ELIXIR_OIL',
  'DISTILLATE',
  'PRE_ROLL',
  'EDIBLE',
  'VAPE',
  'MERCH',
  'ACCESSORY',
];

const BASE_UOMS: { value: BaseUom; label: string; defaultLabel: string; defaultQty: string }[] = [
  { value: 'GRAMS', label: 'Grams (g)', defaultLabel: '1g', defaultQty: '1' },
  { value: 'MILLILITERS', label: 'Milliliters (ml)', defaultLabel: '30ml', defaultQty: '30' },
  { value: 'UNITS', label: 'Units (ea)', defaultLabel: '1 Unit', defaultQty: '1' },
];

const STRAINS: StrainType[] = ['INDICA', 'SATIVA', 'HYBRID', 'CBD', 'NOT_APPLICABLE'];

export default function AdminInventoryPage() {
  const branchesQuery = useCartelQuery(() => listBranches(), []);
  const branches = useMemo(() => branchesQuery.data ?? [], [branchesQuery.data]);

  const [branchId, setBranchId] = useState<string>(DEFAULT_BRANCH_ID);
  const [tab, setTab] = useState<Tab>('BATCHES');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (branches.length > 0 && !branches.some((b) => b.id === branchId)) {
      setBranchId(branches[0]!.id);
    }
  }, [branches, branchId]);

  const branchNameById = useMemo(
    () => new Map(branches.map((b) => [b.id, b.name])),
    [branches],
  );

  const catalogue = useCartelQuery(() => listCatalogue(branchId), [branchId]);
  const movements = useCartelQuery(() => listStockMovements(150), []);
  const allCartHolds = useCartelQuery(() => listActiveCartHolds(), []);
  const categoriesQuery = useCartelQuery(() => listCategories(), []);
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);

  useEffect(() => {
    const refreshAll = () => {
      catalogue.refresh();
      movements.refresh();
      allCartHolds.refresh();
    };
    const unsubscribeLocal = subscribeToData(refreshAll);

    if (IS_LOCAL_PREVIEW) {
      return unsubscribeLocal;
    }

    const supabase = createCartelBrowserClient();
    const channel = supabase
      .channel('ims-live-inventory-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'master_batches' },
        refreshAll,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_reservations' },
        refreshAll,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_movements' },
        refreshAll,
      )
      .subscribe();

    return () => {
      unsubscribeLocal();
      supabase.removeChannel(channel);
    };
  }, [catalogue, movements, allCartHolds]);

  // Batch adjustment state
  const [adjustingBatch, setAdjustingBatch] = useState<MasterBatchRow | null>(null);
  const [adjType, setAdjType] = useState<StockMovementType>('INTAKE');
  const [adjQty, setAdjQty] = useState('25');
  const [adjReason, setAdjReason] = useState('Scheduled vault recount / harvest top-up');
  const [adjBusy, setAdjBusy] = useState(false);

  // New batch intake form (bottom card)
  const [newProductId, setNewProductId] = useState('');
  const [newBatchBranchId, setNewBatchBranchId] = useState('');
  const [newBatchCode, setNewBatchCode] = useState('');
  const [newQty, setNewQty] = useState('250');
  const [newCostCents, setNewCostCents] = useState('6500');
  const [newThc, setNewThc] = useState('28.4');
  const [creatingBatch, setCreatingBatch] = useState(false);

  // Add Product modal state
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [prodName, setProdName] = useState('');
  const [prodSku, setProdSku] = useState('');
  const [prodCategory, setProdCategory] = useState<ProductCategory>('FLOWER');
  const [prodCategoryId, setProdCategoryId] = useState('');
  const [prodUom, setProdUom] = useState<BaseUom>('GRAMS');
  const [prodStrain, setProdStrain] = useState<StrainType>('HYBRID');
  const [prodThc, setProdThc] = useState('24.0');
  const [prodImageUrl, setProdImageUrl] = useState('');
  const [prodVariantLabel, setProdVariantLabel] = useState('1g');
  const [prodVariantQty, setProdVariantQty] = useState('1');
  const [prodPriceCents, setProdPriceCents] = useState('18000');
  const [prodAllocBranchId, setProdAllocBranchId] = useState('');
  const [prodAllocQty, setProdAllocQty] = useState('100');
  const [prodAllocCostCents, setProdAllocCostCents] = useState('6500');
  const [prodBatchCode, setProdBatchCode] = useState('');
  const [creatingProduct, setCreatingProduct] = useState(false);

  // Delete Product modal state
  const [deletingProduct, setDeletingProduct] = useState<ProductRow | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  // Allocate Quantity & Branch modal state
  const [allocEntry, setAllocEntry] = useState<CatalogueEntry | null>(null);
  const [allocMode, setAllocMode] = useState<AllocateMode>('NEW_BATCH');
  const [allocTargetBranchId, setAllocTargetBranchId] = useState('');
  const [allocSourceBatchId, setAllocSourceBatchId] = useState('');
  const [allocQty, setAllocQty] = useState('50');
  const [allocCostCents, setAllocCostCents] = useState('6500');
  const [allocThreshold, setAllocThreshold] = useState('15');
  const [allocBatchCode, setAllocBatchCode] = useState('');
  const [allocReason, setAllocReason] = useState('');
  const [allocBusy, setAllocBusy] = useState(false);

  const entries = useMemo(() => catalogue.data ?? [], [catalogue.data]);
  const productById = useMemo(
    () => new Map(entries.map((e) => [e.product.id, e.product])),
    [entries],
  );
  const activeHolds = useMemo(() => allCartHolds.data ?? [], [allCartHolds.data]);
  const activeBranchHoldCount = useMemo(
    () => activeHolds.filter((h) => h.branch_id === branchId).length,
    [activeHolds, branchId],
  );

  const handleUomChange = (nextUom: BaseUom) => {
    setProdUom(nextUom);
    const meta = BASE_UOMS.find((u) => u.value === nextUom);
    if (meta) {
      setProdVariantLabel(meta.defaultLabel);
      setProdVariantQty(meta.defaultQty);
    }
  };

  const openAddProductModal = () => {
    setProdAllocBranchId(branchId);
    setShowAddProduct(true);
    setError(null);
  };

  const openAllocateModal = (entry: CatalogueEntry) => {
    const activeBatches = entry.batches.filter(
      (b) => b.is_active && b.remaining_base_qty - b.reserved_base_qty > 0,
    );
    const otherBranch = branches.find((b) => b.id !== branchId);
    setAllocEntry(entry);
    setAllocMode('NEW_BATCH');
    setAllocTargetBranchId(branchId);
    setAllocSourceBatchId(activeBatches[0]?.id ?? '');
    setAllocQty('50');
    setAllocCostCents(String(activeBatches[0]?.cost_per_base_unit_cents ?? 6500));
    setAllocThreshold('15');
    setAllocBatchCode('');
    setAllocReason(otherBranch ? `Branch stock allocation` : '');
    setError(null);
  };

  const submitAdjustment = useCallback(async () => {
    if (!adjustingBatch) return;
    const qty = Number.parseFloat(adjQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Enter a valid positive quantity.');
      return;
    }
    setAdjBusy(true);
    setError(null);
    try {
      await adjustBatchStock({
        batchId: adjustingBatch.id,
        movementType: adjType,
        baseQty: qty,
        reason: adjReason.trim() || 'Vault adjustment',
      });
      setNotice(`Adjusted ${adjustingBatch.batch_code} (${adjType} ${qty}).`);
      setAdjustingBatch(null);
      catalogue.refresh();
      movements.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Stock adjustment failed.');
    } finally {
      setAdjBusy(false);
    }
  }, [adjustingBatch, adjQty, adjType, adjReason, catalogue, movements]);

  const handleCreateBatch = useCallback(async () => {
    const targetProductId = newProductId || entries[0]?.product.id;
    const targetBranchId = newBatchBranchId || branchId;
    if (!targetProductId || !newBatchCode.trim()) {
      setError('Provide a product and unique batch code.');
      return;
    }
    setCreatingBatch(true);
    setError(null);
    try {
      const batch = await createBatch({
        productId: targetProductId,
        branchId: targetBranchId,
        batchCode: newBatchCode.trim().toUpperCase(),
        receivedBaseQty: Number.parseFloat(newQty) || 100,
        costPerBaseUnitCents: Number.parseInt(newCostCents, 10) || 5000,
        lowStockThreshold: 25,
        thcPct: Number.parseFloat(newThc) || null,
        cbdPct: 0.4,
        terpeneProfile: { Limonene: 1.1, Caryophyllene: 0.8 },
        harvestDate: new Date().toISOString().slice(0, 10),
        expiryDate: null,
      });
      const destName = branchNameById.get(targetBranchId) ?? 'branch';
      setNotice(`Allocated master batch ${batch.batch_code} to ${destName}.`);
      setNewBatchCode('');
      catalogue.refresh();
      movements.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create batch.');
    } finally {
      setCreatingBatch(false);
    }
  }, [
    newProductId,
    entries,
    newBatchBranchId,
    branchId,
    newBatchCode,
    newQty,
    newCostCents,
    newThc,
    branchNameById,
    catalogue,
    movements,
  ]);

  const handleCreateProduct = useCallback(async () => {
    if (!prodName.trim() || !prodSku.trim()) {
      setError('Provide both a product name and unique SKU.');
      return;
    }
    const baseQty = Number.parseFloat(prodVariantQty);
    const priceCents = Number.parseInt(prodPriceCents, 10);
    const allocQtyVal = Number.parseFloat(prodAllocQty) || 0;
    const allocCostVal = Number.parseInt(prodAllocCostCents, 10) || 0;
    const targetBranch = prodAllocBranchId || branchId;

    if (!Number.isFinite(baseQty) || baseQty <= 0) {
      setError('Default sellable tier quantity must be greater than zero.');
      return;
    }
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      setError('Enter a valid non-negative selling price in cents.');
      return;
    }

    setCreatingProduct(true);
    setError(null);
    try {
      const created = await createProduct({
        sku: prodSku.trim().toUpperCase(),
        name: prodName.trim(),
        category: prodCategory,
        categoryId: prodCategoryId || null,
        baseUom: prodUom,
        strain: prodStrain,
        thcPct: Number.parseFloat(prodThc) || null,
        cbdPct: null,
        heroMediaUrl: prodImageUrl.trim() || null,
        variantLabel: prodVariantLabel.trim() || 'Standard',
        variantBaseQty: baseQty,
        variantPriceCents: priceCents,
        initialAllocation:
          allocQtyVal > 0
            ? {
                branchId: targetBranch,
                quantity: allocQtyVal,
                costPerBaseUnitCents: allocCostVal,
                lowStockThreshold: 15,
                batchCode: prodBatchCode.trim() || undefined,
              }
            : null,
      });

      const destName = branchNameById.get(targetBranch) ?? 'selected branch';
      setNotice(
        allocQtyVal > 0
          ? `Added product ${created.name} (${created.sku}) and allocated ${allocQtyVal} ${UOM_SYMBOL[prodUom]} to ${destName}.`
          : `Added product ${created.name} (${created.sku}).`,
      );
      setShowAddProduct(false);
      setProdName('');
      setProdSku('');
      setProdImageUrl('');
      setProdBatchCode('');
      catalogue.refresh();
      movements.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not add product.');
    } finally {
      setCreatingProduct(false);
    }
  }, [
    prodName,
    prodSku,
    prodCategory,
    prodCategoryId,
    prodUom,
    prodStrain,
    prodThc,
    prodImageUrl,
    prodVariantLabel,
    prodVariantQty,
    prodPriceCents,
    prodAllocBranchId,
    branchId,
    prodAllocQty,
    prodAllocCostCents,
    prodBatchCode,
    branchNameById,
    catalogue,
    movements,
  ]);

  const handleDeleteProduct = useCallback(async () => {
    if (!deletingProduct) return;
    setDeletingBusy(true);
    setError(null);
    try {
      const res = await deleteProduct(deletingProduct.id);
      setNotice(
        res.archived
          ? `Archived ${deletingProduct.name} (${deletingProduct.sku}) — removed from POS & storefront while preserving historical ledger records.`
          : `Deleted ${deletingProduct.name} (${deletingProduct.sku}) from inventory.`,
      );
      setDeletingProduct(null);
      catalogue.refresh();
      movements.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete product.');
    } finally {
      setDeletingBusy(false);
    }
  }, [deletingProduct, catalogue, movements]);

  const handleSubmitAllocation = useCallback(async () => {
    if (!allocEntry) return;
    const qty = Number.parseFloat(allocQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Enter a valid positive allocation quantity.');
      return;
    }

    const targetBranch = allocTargetBranchId || branchId;
    const destName = branchNameById.get(targetBranch) ?? 'branch';

    setAllocBusy(true);
    setError(null);
    try {
      if (allocMode === 'TRANSFER') {
        if (!allocSourceBatchId) {
          throw new Error('Select a source batch to transfer from.');
        }
        if (targetBranch === branchId) {
          throw new Error('Choose a different destination branch for an inter-branch transfer.');
        }
        await transferBatchStock({
          sourceBatchId: allocSourceBatchId,
          targetBranchId: targetBranch,
          baseQty: qty,
          reason:
            allocReason.trim() ||
            `Transfer ${qty} ${UOM_SYMBOL[allocEntry.product.base_uom]} to ${destName}`,
        });
        setNotice(
          `Transferred ${qty} ${UOM_SYMBOL[allocEntry.product.base_uom]} of ${allocEntry.product.name} to ${destName}.`,
        );
      } else {
        const code = (
          allocBatchCode.trim() ||
          `${allocEntry.product.sku}-${Date.now().toString(36).slice(-4)}`
        ).toUpperCase();
        await createBatch({
          productId: allocEntry.product.id,
          branchId: targetBranch,
          batchCode: code,
          receivedBaseQty: qty,
          costPerBaseUnitCents: Number.parseInt(allocCostCents, 10) || 5000,
          lowStockThreshold: Number.parseFloat(allocThreshold) || 15,
          thcPct: allocEntry.product.thc_pct,
          cbdPct: allocEntry.product.cbd_pct,
          terpeneProfile: {},
          harvestDate: new Date().toISOString().slice(0, 10),
          expiryDate: null,
        });
        setNotice(
          `Allocated ${qty} ${UOM_SYMBOL[allocEntry.product.base_uom]} of ${allocEntry.product.name} (${code}) to ${destName}.`,
        );
      }

      setAllocEntry(null);
      catalogue.refresh();
      movements.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Stock allocation failed.');
    } finally {
      setAllocBusy(false);
    }
  }, [
    allocEntry,
    allocQty,
    allocTargetBranchId,
    branchId,
    branchNameById,
    allocMode,
    allocSourceBatchId,
    allocReason,
    allocBatchCode,
    allocCostCents,
    allocThreshold,
    catalogue,
    movements,
  ]);

  return (
    <main className="min-h-screen bg-void pb-28 pt-12">
      <div className="container">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Back Office · Module F</Eyebrow>
            <h1 className="mt-2 display-lg text-white">
              Vault <span className="">Inventory</span>
            </h1>
            <p className="mt-2 max-w-2xl type-ui text-ash">
              Multi-branch master batch balances in base units (g, ml, units), product catalog
              controls, branch stock allocation, and immutable FIFO movement ledger.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 border border-[color:var(--border-subtle)] bg-surface px-3 py-1.5 font-mono type-ui text-white">
              <Building2 className="size-3.5 text-ash" />
              <select
                aria-label="Active Branch"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="bg-transparent font-mono type-ui text-white focus:outline-none"
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id} className="bg-surface text-white">
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>

            <Button variant="gold" size="sm" onClick={openAddProductModal}>
              <Plus className="size-3.5" />
              Add Product
            </Button>

            {(
              [
                ['BATCHES', 'Master Batches', Boxes],
                ['MOVEMENTS', 'Movement Ledger', History],
              ] as const
            ).map(([key, label, Icon]) => (
              <Button
                key={key}
                variant={tab === key ? 'active' : 'surface'}
                size="sm"
                onClick={() => setTab(key)}
              >
                <Icon className="size-3.5" />
                {label}
              </Button>
            ))}
          </div>
        </header>

        {notice ? (
          <p className="mt-6 border border-foreground bg-transparent px-4 py-3 font-mono type-ui text-foreground">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="mt-6 border border-foreground bg-transparent px-4 py-3 font-mono type-ui text-foreground">
            {error}
          </p>
        ) : null}

        {/* TAB 1: MASTER BATCHES */}
        {tab === 'BATCHES' ? (
          <div className="mt-8 space-y-8">
            <CatalogueTools
              branchId={branchId}
              branchName={branchNameById.get(branchId) ?? 'Selected branch'}
              entries={entries}
              categories={categories}
              onNotice={setNotice}
              onError={setError}
              onChanged={() => {
                catalogue.refresh();
                categoriesQuery.refresh();
                movements.refresh();
              }}
            />

            {/* Real-Time Cart Holds Banner / Feed */}
            <Card className="border-[color:var(--border-subtle)] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <ShoppingCart className="size-4 text-accent" />
                  <div>
                    <Eyebrow>Live Cart Sync · Multi-Branch Holds</Eyebrow>
                    <h2 className="mt-0.5 font-display text-base uppercase text-white">
                      Active Member Cart Reservations
                    </h2>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={activeHolds.length > 0 ? 'warn' : 'live'}>
                    {activeHolds.length} Active Hold{activeHolds.length === 1 ? '' : 's'} (All Branches)
                  </Badge>
                  <Badge tone="mono">
                    {activeBranchHoldCount} at {branchNameById.get(branchId) ?? 'Active Branch'}
                  </Badge>
                </div>
              </div>

              {activeHolds.length === 0 ? (
                <p className="mt-3 font-mono type-ui text-ash">
                  No member carts currently holding stock. Adding items in The Vault or Checkout updates reserved quantities here immediately.
                </p>
              ) : (
                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {activeHolds.map((hold) => {
                    const prod = productById.get(hold.product_id);
                    const bName = branchNameById.get(hold.branch_id) ?? hold.branch_id;
                    const minsLeft = Math.max(
                      0,
                      Math.ceil((new Date(hold.expires_at).getTime() - Date.now()) / 60_000),
                    );
                    return (
                      <button
                        key={hold.id}
                        type="button"
                        onClick={() => setBranchId(hold.branch_id)}
                        className={cn(
                          'flex items-center justify-between gap-3 border px-3 py-2.5 text-left font-mono type-ui transition-colors',
                          hold.branch_id === branchId
                            ? 'border-accent bg-void text-white'
                            : 'border-[color:var(--border-mono)] bg-void text-ash hover:border-foreground hover:text-white',
                        )}
                        title="Click to inspect this branch's inventory"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-white">
                            {prod?.name ?? hold.product_id}
                          </p>
                          <p className="truncate text-xs text-accent">
                            {bName} · {hold.member_label ?? hold.cart_session_id}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-semibold tabular-nums text-white">
                            {prod ? formatBaseQty(hold.base_qty, prod.base_uom) : hold.base_qty}
                          </p>
                          <p className="inline-flex items-center gap-1 text-xs text-ash">
                            <Clock className="size-3" />
                            {minsLeft}m TTL
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {entries.map((entry) => {
                const { product, batches, stock } = entry;
                return (
                  <Card key={product.id} className="flex flex-col justify-between gap-4 p-5">
                    <div>
                      {product.hero_media_url ? (
                        <div className="relative mb-4 aspect-[4/3] w-full overflow-hidden rounded border border-[color:var(--border-mono)] bg-void">
                          <Image
                            src={product.hero_media_url}
                            alt={product.name}
                            fill
                            unoptimized={
                              !product.hero_media_url.startsWith('/') &&
                              !product.hero_media_url.includes('storage.googleapis.com') &&
                              !product.hero_media_url.includes('supabase.co')
                            }
                            className="object-cover"
                            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                          />
                        </div>
                      ) : null}
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="font-mono type-ui text-ash">
                            {product.sku} · {CATEGORY_LABEL[product.category]}
                          </span>
                          <h2 className="mt-1 font-display text-lg uppercase text-white">
                            {product.name}
                          </h2>
                          <select
                            aria-label={`Category for ${product.name}`}
                            value={product.category_id ?? ''}
                            onChange={(event) => {
                              setError(null);
                              void setProductCategory(product.id, event.target.value || null)
                                .then(() => catalogue.refresh())
                                .catch((caught: unknown) =>
                                  setError(
                                    caught instanceof Error
                                      ? caught.message
                                      : 'Could not change the category.',
                                  ),
                                );
                            }}
                            className="mt-2 h-9 border border-[color:var(--border-mono)] bg-surface px-2 font-mono type-ui text-white"
                          >
                            <option value="">Uncategorised</option>
                            {categories.map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        {stock.is_low_stock ? (
                          <Badge tone="warn">
                            <AlertTriangle className="size-3" />
                            Low Stock (≤ {stock.low_stock_threshold} {UOM_SYMBOL[product.base_uom]})
                          </Badge>
                        ) : (
                          <Badge tone="live">In Stock</Badge>
                        )}
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-2 border border-[color:var(--border-mono)] bg-void p-3 font-mono">
                        <div>
                          <span className="block text-[10px] uppercase tracking-wider text-ash">
                            On Hand
                          </span>
                          <span className="text-sm tabular-nums text-white">
                            {stock.remaining_base_qty.toFixed(UOM_PRECISION[product.base_uom])}{' '}
                            {UOM_SYMBOL[product.base_uom]}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] uppercase tracking-wider text-ash">
                            Cart Holds
                          </span>
                          <span
                            className={cn(
                              'text-sm tabular-nums',
                              stock.reserved_base_qty > 0 ? 'text-accent' : 'text-ash',
                            )}
                          >
                            {stock.reserved_base_qty.toFixed(UOM_PRECISION[product.base_uom])}{' '}
                            {UOM_SYMBOL[product.base_uom]}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="block text-[10px] uppercase tracking-wider text-ash">
                            Net ({branchNameById.get(branchId) ?? 'Branch'})
                          </span>
                          <span className="text-sm font-semibold tabular-nums text-foreground">
                            {stock.available_base_qty.toFixed(UOM_PRECISION[product.base_uom])}{' '}
                            {UOM_SYMBOL[product.base_uom]}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 space-y-2">
                        <span className="font-mono type-ui text-ash">
                          Active FIFO Batches ({batches.length})
                        </span>
                        {batches.length === 0 ? (
                          <p className="border border-dashed border-[color:var(--border-mono)] px-3 py-2 font-mono type-ui text-ash">
                            No stock allocated at this branch yet.
                          </p>
                        ) : (
                          batches.map((batch) => (
                            <div
                              key={batch.id}
                              className="flex items-center justify-between border border-[color:var(--border-mono)] px-3 py-2 font-mono type-ui"
                            >
                              <div>
                                <p className="text-white">
                                  {batch.batch_code}
                                  {batch.lab_thc_pct !== null && batch.lab_thc_pct !== undefined ? (
                                    <span className="ml-2 text-xs text-ash">
                                      THC: {batch.lab_thc_pct}%
                                    </span>
                                  ) : null}
                                  {batch.reserved_base_qty > 0 ? (
                                    <span className="ml-2 text-xs text-accent">
                                      Held: {formatBaseQty(batch.reserved_base_qty, product.base_uom)}
                                    </span>
                                  ) : null}
                                </p>
                                <p className="type-ui text-ash">
                                  {formatBaseQty(batch.remaining_base_qty, product.base_uom)} /{' '}
                                  {formatBaseQty(batch.received_base_qty, product.base_uom)} · Cost{' '}
                                  {formatCents(batch.cost_per_base_unit_cents)}/
                                  {UOM_SYMBOL[product.base_uom]}
                                </p>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setAdjustingBatch(batch)}
                              >
                                <Sliders className="size-3" />
                                Adjust
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-[color:var(--border-mono)] pt-3">
                      <Button
                        variant="surface"
                        size="sm"
                        onClick={() => openAllocateModal(entry)}
                      >
                        <ArrowRightLeft className="size-3.5" />
                        Allocate / Branch
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-ash hover:text-white"
                        onClick={() => {
                          setDeletingProduct(product);
                          setError(null);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                        Delete
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* New Harvest Batch Intake Card */}
            <Card className="space-y-5 p-6">
              <div>
                <Eyebrow>Harvest & Branch Allocation</Eyebrow>
                <h2 className="mt-1 font-display text-lg uppercase text-white">
                  Allocate New Master Batch to Branch
                </h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
                <Field label="Product" htmlFor="nb_product">
                  <select
                    id="nb_product"
                    value={newProductId || entries[0]?.product.id || ''}
                    onChange={(e) => setNewProductId(e.target.value)}
                    className="h-11 w-full border border-[color:var(--border-subtle)] bg-surface px-3 font-mono type-ui text-white"
                  >
                    {entries.map((e) => (
                      <option key={e.product.id} value={e.product.id}>
                        {e.product.name} ({UOM_SYMBOL[e.product.base_uom]})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Target Branch" htmlFor="nb_branch">
                  <select
                    id="nb_branch"
                    value={newBatchBranchId || branchId}
                    onChange={(e) => setNewBatchBranchId(e.target.value)}
                    className="h-11 w-full border border-[color:var(--border-subtle)] bg-surface px-3 font-mono type-ui text-white"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Batch Code" htmlFor="nb_code">
                  <Input
                    id="nb_code"
                    value={newBatchCode}
                    onChange={(e) => setNewBatchCode(e.target.value.toUpperCase())}
                    placeholder="JHB-SOV-2612A"
                    className="font-mono"
                  />
                </Field>
                <Field label="Allocated Qty" htmlFor="nb_qty">
                  <Input
                    id="nb_qty"
                    type="number"
                    value={newQty}
                    onChange={(e) => setNewQty(e.target.value)}
                    className="font-mono"
                  />
                </Field>
                <Field label="Unit Cost (cents)" htmlFor="nb_cost">
                  <Input
                    id="nb_cost"
                    type="number"
                    value={newCostCents}
                    onChange={(e) => setNewCostCents(e.target.value)}
                    className="font-mono"
                  />
                </Field>
                <Field label="Lab THC %" htmlFor="nb_thc">
                  <Input
                    id="nb_thc"
                    type="number"
                    step="0.1"
                    value={newThc}
                    onChange={(e) => setNewThc(e.target.value)}
                    className="font-mono"
                  />
                </Field>
              </div>
              <Button
                variant="gold"
                disabled={creatingBatch || !newBatchCode.trim()}
                onClick={() => void handleCreateBatch()}
              >
                {creatingBatch ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Log Harvest Batch into Branch
              </Button>
            </Card>
          </div>
        ) : null}

        {/* TAB 2: MOVEMENT LEDGER */}
        {tab === 'MOVEMENTS' ? (
          <Card className="mt-8 overflow-hidden">
            <div className="border-b border-[color:var(--border-mono)] px-5 py-4">
              <Eyebrow>Immutable Stock Audit Trail</Eyebrow>
            </div>
            {(movements.data ?? []).length === 0 ? (
              <div className="p-8">
                <EmptyState
                  title="No stock movements recorded yet"
                  description="Ring up a POS sale, complete an online allocation, or adjust a batch to populate the ledger."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono type-ui">
                  <thead className="border-b border-[color:var(--border-mono)] bg-void type-ui text-ash">
                    <tr>
                      <th className="px-4 py-3">Timestamp</th>
                      <th className="px-4 py-3">Branch</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Delta</th>
                      <th className="px-4 py-3">Balance After</th>
                      <th className="px-4 py-3">Reason / Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--border-mono)]">
                    {(movements.data ?? []).map((m) => (
                      <tr key={m.id} className="bg-transparent">
                        <td className="px-4 py-3 text-ash">
                          {new Date(m.created_at).toLocaleTimeString('en-ZA', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>
                        <td className="px-4 py-3 text-ash">
                          {branchNameById.get(m.branch_id) ?? m.branch_id.slice(0, 8)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={m.base_qty_delta >= 0 ? 'live' : 'gold'}>
                            {m.movement_type}
                          </Badge>
                        </td>
                        <td
                          className={cn(
                            'px-4 py-3 tabular-nums',
                            m.base_qty_delta >= 0 ? 'text-foreground' : 'text-foreground',
                          )}
                        >
                          {m.base_qty_delta >= 0 ? '+' : ''}
                          {formatBaseQty(m.base_qty_delta, m.base_uom)}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-white">
                          {formatBaseQty(m.balance_after, m.base_uom)}
                        </td>
                        <td className="px-4 py-3 text-ash">{m.reason ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        ) : null}
      </div>

      {/* Add Product Modal */}
      {showAddProduct ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-void/80 p-4">
          <Card className="w-full max-w-2xl space-y-5 border-foreground p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Eyebrow>Catalog Management</Eyebrow>
                <h3 className="mt-1 font-display text-lg uppercase text-white">
                  Add New Product & Branch Allocation
                </h3>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowAddProduct(false)}>
                <X className="size-4" />
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Product Name" htmlFor="ap_name">
                <Input
                  id="ap_name"
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  placeholder="Sandton Reserve OG"
                />
              </Field>
              <Field label="SKU" htmlFor="ap_sku">
                <Input
                  id="ap_sku"
                  value={prodSku}
                  onChange={(e) => setProdSku(e.target.value.toUpperCase())}
                  placeholder="CRT-FL-099"
                  className="font-mono"
                />
              </Field>

              <Field label="Product type" htmlFor="ap_cat">
                <select
                  id="ap_cat"
                  value={prodCategory}
                  onChange={(e) => {
                    setProdCategory(e.target.value as ProductCategory);
                    setProdCategoryId('');
                  }}
                  className="h-11 w-full border border-[color:var(--border-subtle)] bg-surface px-3 font-mono type-ui text-white"
                >
                  {PRODUCT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_LABEL[cat]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Category / grade" htmlFor="ap_grade">
                <select
                  id="ap_grade"
                  value={prodCategoryId}
                  onChange={(e) => setProdCategoryId(e.target.value)}
                  className="h-11 w-full border border-[color:var(--border-subtle)] bg-surface px-3 font-mono type-ui text-white"
                >
                  <option value="">Uncategorised</option>
                  {categories
                    .filter((category) => category.product_type === prodCategory)
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Base Unit (UOM)" htmlFor="ap_uom">
                <select
                  id="ap_uom"
                  value={prodUom}
                  onChange={(e) => handleUomChange(e.target.value as BaseUom)}
                  className="h-11 w-full border border-[color:var(--border-subtle)] bg-surface px-3 font-mono type-ui text-white"
                >
                  {BASE_UOMS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Strain Profile" htmlFor="ap_strain">
                <select
                  id="ap_strain"
                  value={prodStrain}
                  onChange={(e) => setProdStrain(e.target.value as StrainType)}
                  className="h-11 w-full border border-[color:var(--border-subtle)] bg-surface px-3 font-mono type-ui text-white"
                >
                  {STRAINS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="THC % (Optional)" htmlFor="ap_thc">
                <Input
                  id="ap_thc"
                  type="number"
                  step="0.1"
                  value={prodThc}
                  onChange={(e) => setProdThc(e.target.value)}
                  className="font-mono"
                />
              </Field>

              <Field label="Default POS Tier Label" htmlFor="ap_vlabel">
                <Input
                  id="ap_vlabel"
                  value={prodVariantLabel}
                  onChange={(e) => setProdVariantLabel(e.target.value)}
                  placeholder="1g / 30ml / 1 Unit"
                  className="font-mono"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={`Tier Qty (${UOM_SYMBOL[prodUom]})`} htmlFor="ap_vqty">
                  <Input
                    id="ap_vqty"
                    type="number"
                    step="0.5"
                    value={prodVariantQty}
                    onChange={(e) => setProdVariantQty(e.target.value)}
                    className="font-mono"
                  />
                </Field>
                <Field label="Sell Price (cents)" htmlFor="ap_vprice">
                  <Input
                    id="ap_vprice"
                    type="number"
                    value={prodPriceCents}
                    onChange={(e) => setProdPriceCents(e.target.value)}
                    className="font-mono"
                  />
                </Field>
              </div>
            </div>

            <Field label="Product Image URL (Optional)" htmlFor="ap_img">
              <Input
                id="ap_img"
                value={prodImageUrl}
                onChange={(e) => setProdImageUrl(e.target.value)}
                placeholder="https://..."
                className="font-mono"
              />
            </Field>

            <div className="space-y-3 border border-[color:var(--border-mono)] bg-void p-4">
              <Eyebrow>Initial Branch Stock Allocation</Eyebrow>
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Allocate to Branch" htmlFor="ap_branch">
                  <select
                    id="ap_branch"
                    value={prodAllocBranchId || branchId}
                    onChange={(e) => setProdAllocBranchId(e.target.value)}
                    className="h-11 w-full border border-[color:var(--border-subtle)] bg-surface px-3 font-mono type-ui text-white"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={`Quantity (${UOM_SYMBOL[prodUom]})`} htmlFor="ap_aqty">
                  <Input
                    id="ap_aqty"
                    type="number"
                    step="0.5"
                    value={prodAllocQty}
                    onChange={(e) => setProdAllocQty(e.target.value)}
                    className="font-mono"
                  />
                </Field>
                <Field label="Unit Cost (cents)" htmlFor="ap_acost">
                  <Input
                    id="ap_acost"
                    type="number"
                    value={prodAllocCostCents}
                    onChange={(e) => setProdAllocCostCents(e.target.value)}
                    className="font-mono"
                  />
                </Field>
                <Field label="Batch Code (Auto if blank)" htmlFor="ap_bcode">
                  <Input
                    id="ap_bcode"
                    value={prodBatchCode}
                    onChange={(e) => setProdBatchCode(e.target.value.toUpperCase())}
                    placeholder="AUTO"
                    className="font-mono"
                  />
                </Field>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setShowAddProduct(false)}>
                Cancel
              </Button>
              <Button
                variant="gold"
                disabled={creatingProduct || !prodName.trim() || !prodSku.trim()}
                onClick={() => void handleCreateProduct()}
              >
                {creatingProduct ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                Create Product
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {/* Allocate Quantity & Branch Modal */}
      {allocEntry ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-void/80 p-4">
          <Card className="w-full max-w-lg space-y-4 border-foreground p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Eyebrow>Stock Allocation & Branch Routing</Eyebrow>
                <h3 className="mt-1 font-display text-lg uppercase text-white">
                  {allocEntry.product.name}
                </h3>
                <p className="font-mono type-ui text-ash">
                  Current Branch: {branchNameById.get(branchId) ?? branchId} · Available{' '}
                  {allocEntry.stock.available_base_qty.toFixed(
                    UOM_PRECISION[allocEntry.product.base_uom],
                  )}{' '}
                  {UOM_SYMBOL[allocEntry.product.base_uom]}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setAllocEntry(null)}>
                <X className="size-4" />
              </Button>
            </div>

            <div className="flex gap-2">
              <Button
                variant={allocMode === 'NEW_BATCH' ? 'active' : 'surface'}
                size="sm"
                onClick={() => {
                  setAllocMode('NEW_BATCH');
                  setAllocTargetBranchId(branchId);
                }}
              >
                <Plus className="size-3.5" />
                Allocate New Stock
              </Button>
              <Button
                variant={allocMode === 'TRANSFER' ? 'active' : 'surface'}
                size="sm"
                disabled={
                  allocEntry.batches.filter(
                    (b) => b.is_active && b.remaining_base_qty - b.reserved_base_qty > 0,
                  ).length === 0 || branches.length < 2
                }
                onClick={() => {
                  setAllocMode('TRANSFER');
                  const other = branches.find((b) => b.id !== branchId);
                  if (other) setAllocTargetBranchId(other.id);
                }}
              >
                <ArrowRightLeft className="size-3.5" />
                Transfer to Branch
              </Button>
            </div>

            {allocMode === 'TRANSFER' ? (
              <Field label="Source Batch (Current Branch)" htmlFor="al_src">
                <select
                  id="al_src"
                  value={allocSourceBatchId}
                  onChange={(e) => setAllocSourceBatchId(e.target.value)}
                  className="h-11 w-full border border-[color:var(--border-subtle)] bg-surface px-3 font-mono type-ui text-white"
                >
                  {allocEntry.batches
                    .filter((b) => b.is_active && b.remaining_base_qty - b.reserved_base_qty > 0)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.batch_code} (Avail:{' '}
                        {formatBaseQty(
                          b.remaining_base_qty - b.reserved_base_qty,
                          allocEntry.product.base_uom,
                        )}
                        )
                      </option>
                    ))}
                </select>
              </Field>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Destination Branch" htmlFor="al_branch">
                <select
                  id="al_branch"
                  value={allocTargetBranchId}
                  onChange={(e) => setAllocTargetBranchId(e.target.value)}
                  className="h-11 w-full border border-[color:var(--border-subtle)] bg-surface px-3 font-mono type-ui text-white"
                >
                  {(allocMode === 'TRANSFER'
                    ? branches.filter((b) => b.id !== branchId)
                    : branches
                  ).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label={`Quantity (${UOM_SYMBOL[allocEntry.product.base_uom]})`}
                htmlFor="al_qty"
              >
                <Input
                  id="al_qty"
                  type="number"
                  step="0.5"
                  value={allocQty}
                  onChange={(e) => setAllocQty(e.target.value)}
                  className="font-mono"
                />
              </Field>
            </div>

            {allocMode === 'NEW_BATCH' ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Batch Code (Optional)" htmlFor="al_code">
                  <Input
                    id="al_code"
                    value={allocBatchCode}
                    onChange={(e) => setAllocBatchCode(e.target.value.toUpperCase())}
                    placeholder="AUTO"
                    className="font-mono"
                  />
                </Field>
                <Field label="Unit Cost (cents)" htmlFor="al_cost">
                  <Input
                    id="al_cost"
                    type="number"
                    value={allocCostCents}
                    onChange={(e) => setAllocCostCents(e.target.value)}
                    className="font-mono"
                  />
                </Field>
                <Field label="Low Stock Alert" htmlFor="al_thresh">
                  <Input
                    id="al_thresh"
                    type="number"
                    value={allocThreshold}
                    onChange={(e) => setAllocThreshold(e.target.value)}
                    className="font-mono"
                  />
                </Field>
              </div>
            ) : (
              <Field label="Transfer Reason / Manifest Note" htmlFor="al_reason">
                <Input
                  id="al_reason"
                  value={allocReason}
                  onChange={(e) => setAllocReason(e.target.value)}
                  placeholder="Rebalancing branch inventory"
                />
              </Field>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setAllocEntry(null)}>
                Cancel
              </Button>
              <Button
                variant="gold"
                disabled={allocBusy}
                onClick={() => void handleSubmitAllocation()}
              >
                {allocBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                {allocMode === 'TRANSFER' ? 'Confirm Branch Transfer' : 'Allocate Stock'}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {/* Delete Product Confirmation Modal */}
      {deletingProduct ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-4">
          <Card className="w-full max-w-md space-y-4 border-foreground p-6">
            <Eyebrow>Catalog Removal</Eyebrow>
            <h3 className="font-display text-lg uppercase text-white">
              Delete {deletingProduct.name}?
            </h3>
            <p className="type-ui text-ash">
              SKU <span className="font-mono text-white">{deletingProduct.sku}</span> will be
              removed from the POS terminal, inventory board, and storefront. Products with
              recorded sales or stock movements are archived safely to preserve your audit trail.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setDeletingProduct(null)}>
                Cancel
              </Button>
              <Button
                variant="gold"
                disabled={deletingBusy}
                onClick={() => void handleDeleteProduct()}
              >
                {deletingBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                Confirm Delete
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {/* Batch Adjustment Modal */}
      {adjustingBatch ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-4 ">
          <Card className="w-full max-w-md space-y-4 border-foreground p-6">
            <Eyebrow>Batch Balance Adjustment</Eyebrow>
            <h3 className="font-display text-lg uppercase text-white">
              {adjustingBatch.batch_code}
            </h3>

            <Field label="Movement Type" htmlFor="adj_type">
              <select
                id="adj_type"
                value={adjType}
                onChange={(e) => setAdjType(e.target.value as StockMovementType)}
                className="h-11 w-full border border-[color:var(--border-subtle)] bg-surface px-3 font-mono type-ui text-white"
              >
                {MOVEMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Base Quantity" htmlFor="adj_qty">
              <Input
                id="adj_qty"
                type="number"
                step="0.5"
                value={adjQty}
                onChange={(e) => setAdjQty(e.target.value)}
                className="font-mono"
              />
            </Field>

            <Field label="Audit Reason" htmlFor="adj_reason">
              <Input
                id="adj_reason"
                value={adjReason}
                onChange={(e) => setAdjReason(e.target.value)}
              />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setAdjustingBatch(null)}>
                Cancel
              </Button>
              <Button variant="gold" disabled={adjBusy} onClick={() => void submitAdjustment()}>
                {adjBusy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Commit Adjustment
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </main>
  );
}
