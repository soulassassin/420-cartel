'use client';

/**
 * 420 CARTEL :: unified client data source
 *
 * Every member, cashier and admin surface talks to this module instead of
 * Supabase directly. It has two interchangeable backends:
 *
 *   SUPABASE — the real project. Reads go through RLS, writes go through the
 *              `process_cartel_order` / `adjust_batch_stock` RPCs.
 *   LOCAL    — the in-browser engine in `lib/demo/engine.ts`, used when
 *              NEXT_PUBLIC_SUPABASE_URL is absent, so the whole platform is
 *              demonstrable before any credentials exist.
 *
 * The backend is chosen once, at module load, from the environment. Switching
 * is therefore a deploy concern, never a runtime branch in a component.
 */

import type {
  AffiliateAttributionRow,
  AffiliateCodeRow,
  BranchRow,
  CartStockHoldRow,
  CatalogueCategoryRow,
  CrmInteractionChannel,
  CrmInteractionRow,
  KycDocumentRow,
  LoyaltyLedgerRow,
  LoyaltyRulesRow,
  MasterBatchRow,
  MemberCreditLedgerRow,
  MemberRow,
  OrderItemRow,
  OrderRow,
  ProcessOrderPayload,
  ProcessOrderResult,
  ProductMediaJobRow,
  ProductRow,
  ProductStockLevelRow,
  ProductVariantRow,
  ResolvedDeliveryZone,
  StockMovementRow,
  StockMovementType,
} from '@/types/database';
import { createCartelBrowserClient } from '@/lib/supabase/client';
import {
  LocalEngineError,
  localAddCrmInteraction,
  localAdjustBatchStock,
  localAdjustMemberCredit,
  localCreateBatch,
  localCreateCategory,
  localDeleteCategory,
  localListCategories,
  localSetProductCategory,
  localCreateMediaJob,
  localCreateMember,
  localCreateProduct,
  localDeleteProduct,
  localListActiveCartHolds,
  localLookupMembers,
  localProcessOrder,
  localResolveDeliveryZone,
  localReviewMemberKyc,
  localRotateMemberQrToken,
  localSaveLoyaltyRules,
  localSetAffiliateCommission,
  localSetMemberStatus,
  localSettleCommission,
  localStockLevel,
  localSyncCartHolds,
  localToggleCrmFollowUp,
  localTransferBatchStock,
  localUpdateMediaJob,
  localUpdateMemberCrmProfile,
  readLocalDb,
  subscribeLocalDb,
  type LocalCreateMemberInput,
  type LocalCreateProductInput,
  type LocalUpdateMemberCrmPatch,
} from '@/lib/demo/engine';

export type DataMode = 'SUPABASE' | 'LOCAL';

export function isDemoModeActive(): boolean {
  if (typeof window !== 'undefined') {
    try {
      if (window.localStorage.getItem('cartel-demo-mode') === 'true') return true;
      if (document.cookie.includes('cartel_demo_mode=true')) return true;
      const params = new URLSearchParams(window.location.search);
      if (params.get('demo') === '1' || params.get('demo') === 'true') return true;
    } catch {
      // Storage or cookie read blocked
    }
  }
  if (process.env.NEXT_PUBLIC_CARTEL_DEMO_UNLOCK === '1') return true;
  return !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export function setDemoMode(enabled: boolean): void {
  if (typeof window !== 'undefined') {
    try {
      if (enabled) {
        window.localStorage.setItem('cartel-demo-mode', 'true');
        document.cookie = 'cartel_demo_mode=true; path=/; max-age=86400; SameSite=Lax';
      } else {
        window.localStorage.removeItem('cartel-demo-mode');
        document.cookie = 'cartel_demo_mode=; path=/; max-age=0; SameSite=Lax';
      }
    } catch {
      // storage blocked
    }
  }
}

export function dataMode(): DataMode {
  return isDemoModeActive() ? 'LOCAL' : 'SUPABASE';
}

export const IS_LOCAL_PREVIEW =
  process.env.NEXT_PUBLIC_CARTEL_DEMO_UNLOCK === '1' ||
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function isLocalMode(): boolean {
  return IS_LOCAL_PREVIEW || isDemoModeActive();
}

/** A product with everything the catalogue, POS and admin grids need. */
export interface CatalogueEntry {
  product: ProductRow;
  variants: ProductVariantRow[];
  batches: MasterBatchRow[];
  stock: ProductStockLevelRow;
}

export class DataSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataSourceError';
  }
}

function wrap(error: unknown): DataSourceError {
  if (error instanceof LocalEngineError || error instanceof DataSourceError) {
    return new DataSourceError(error.message);
  }
  if (error instanceof Error) {
    // Surface the Postgres exception text the SQL layer raises on purpose.
    const match = /CARTEL_[A-Z_]+:\s*(.*)/.exec(error.message);
    return new DataSourceError(match?.[1]?.trim() || error.message);
  }
  return new DataSourceError('Something went wrong. Try again.');
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listBranches(): Promise<BranchRow[]> {
  if (isLocalMode()) return readLocalDb().branches;
  const supabase = createCartelBrowserClient();
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .eq('is_active', true)
    .order('name');
  if (error) throw wrap(error);
  return data ?? [];
}

export async function listCatalogue(branchId: string): Promise<CatalogueEntry[]> {
  if (isLocalMode()) {
    const db = readLocalDb();
    return db.products
      .filter((product) => product.is_active)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((product) => ({
        product,
        variants: db.variants
          .filter((variant) => variant.product_id === product.id && variant.is_active)
          .sort((a, b) => a.sort_order - b.sort_order),
        batches: db.batches
          .filter((batch) => batch.product_id === product.id && batch.branch_id === branchId)
          .sort((a, b) => a.received_at.localeCompare(b.received_at)),
        stock: localStockLevel(db, product, branchId),
      }));
  }

  const supabase = createCartelBrowserClient();
  const [products, variants, batches, levels] = await Promise.all([
    supabase.from('products').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('product_variants').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('master_batches').select('*').eq('branch_id', branchId).order('received_at'),
    supabase.from('product_stock_levels').select('*').eq('branch_id', branchId),
  ]);

  const failure = products.error ?? variants.error ?? batches.error ?? levels.error;
  if (failure) throw wrap(failure);

  return (products.data ?? []).map((product) => {
    const productBatches = (batches.data ?? []).filter(
      (batch) => batch.product_id === product.id,
    );
    const level = (levels.data ?? []).find((row) => row.product_id === product.id);

    return {
      product,
      variants: (variants.data ?? []).filter((variant) => variant.product_id === product.id),
      batches: productBatches,
      stock:
        level ?? {
          product_id: product.id,
          sku: product.sku,
          name: product.name,
          category: product.category,
          base_uom: product.base_uom,
          branch_id: branchId,
          remaining_base_qty: 0,
          reserved_base_qty: 0,
          available_base_qty: 0,
          low_stock_threshold: 0,
          is_low_stock: true,
          open_batch_count: 0,
        },
    };
  });
}

function normalizeMember(member: MemberRow): MemberRow {
  return {
    ...member,
    crm_tags: Array.isArray(member.crm_tags) ? member.crm_tags : [],
  };
}

export async function listMembers(): Promise<MemberRow[]> {
  if (isLocalMode()) return readLocalDb().members.map(normalizeMember);
  const supabase = createCartelBrowserClient();
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw wrap(error);
  return (data ?? []).map(normalizeMember);
}

export async function lookupMembers(query: string): Promise<MemberRow[]> {
  if (isLocalMode()) return localLookupMembers(query);
  const needle = query.trim();
  if (needle.length < 2) return [];

  const supabase = createCartelBrowserClient();
  const escaped = needle.replace(/[%,()]/g, '');
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .or(
      [
        `member_code.ilike.%${escaped}%`,
        `qr_token.eq.${escaped}`,
        `first_name.ilike.%${escaped}%`,
        `last_name.ilike.%${escaped}%`,
        `email.ilike.%${escaped}%`,
        `phone.ilike.%${escaped}%`,
        `sa_id_number.ilike.%${escaped}%`,
      ].join(','),
    )
    .limit(20);
  if (error) throw wrap(error);
  return data ?? [];
}

export async function listOrders(limit = 200): Promise<OrderRow[]> {
  if (isLocalMode()) return readLocalDb().orders.slice(0, limit);
  const supabase = createCartelBrowserClient();
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw wrap(error);
  return data ?? [];
}

export async function listOrderItems(orderIds: string[]): Promise<OrderItemRow[]> {
  if (orderIds.length === 0) return [];
  if (isLocalMode()) {
    return readLocalDb().orderItems.filter((item) => orderIds.includes(item.order_id));
  }
  const supabase = createCartelBrowserClient();
  const { data, error } = await supabase.from('order_items').select('*').in('order_id', orderIds);
  if (error) throw wrap(error);
  return data ?? [];
}

export async function listStockMovements(limit = 300): Promise<StockMovementRow[]> {
  if (isLocalMode()) return readLocalDb().movements.slice(0, limit);
  const supabase = createCartelBrowserClient();
  const { data, error } = await supabase
    .from('stock_movements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw wrap(error);
  return data ?? [];
}

export async function getLoyaltyRules(): Promise<LoyaltyRulesRow> {
  if (isLocalMode()) return readLocalDb().loyaltyRules;
  const supabase = createCartelBrowserClient();
  const { data, error } = await supabase
    .from('loyalty_rules')
    .select('*')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (error) throw wrap(error);
  if (!data) throw new DataSourceError('No active loyalty rule set is configured.');
  return data;
}

export async function listAffiliateCodes(): Promise<AffiliateCodeRow[]> {
  if (isLocalMode()) return readLocalDb().affiliateCodes;
  const supabase = createCartelBrowserClient();
  const { data, error } = await supabase
    .from('affiliate_codes')
    .select('*')
    .order('order_count', { ascending: false });
  if (error) throw wrap(error);
  return data ?? [];
}

export async function listAffiliateAttributions(): Promise<AffiliateAttributionRow[]> {
  if (isLocalMode()) return readLocalDb().attributions;
  const supabase = createCartelBrowserClient();
  const { data, error } = await supabase
    .from('affiliate_attributions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw wrap(error);
  return data ?? [];
}

export async function listMediaJobs(): Promise<ProductMediaJobRow[]> {
  if (isLocalMode()) return readLocalDb().mediaJobs;
  const supabase = createCartelBrowserClient();
  const { data, error } = await supabase
    .from('product_media_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw wrap(error);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function processOrder(payload: ProcessOrderPayload): Promise<ProcessOrderResult> {
  if (isLocalMode()) {
    try {
      return localProcessOrder(payload);
    } catch (error) {
      throw wrap(error);
    }
  }
  const supabase = createCartelBrowserClient();
  const { data, error } = await supabase.rpc('process_cartel_order', { p_payload: payload });
  if (error) throw wrap(error);
  return data as unknown as ProcessOrderResult;
}

export async function adjustBatchStock(input: {
  batchId: string;
  movementType: StockMovementType;
  baseQty: number;
  reason: string;
}): Promise<MasterBatchRow> {
  if (isLocalMode()) {
    try {
      return localAdjustBatchStock(input);
    } catch (error) {
      throw wrap(error);
    }
  }
  const supabase = createCartelBrowserClient();
  const { data, error } = await supabase.rpc('adjust_batch_stock', {
    p_batch_id: input.batchId,
    p_movement_type: input.movementType,
    p_base_qty: input.baseQty,
    p_reason: input.reason,
  });
  if (error) throw wrap(error);
  return data as unknown as MasterBatchRow;
}

export interface CreateBatchInput {
  productId: string;
  branchId: string;
  batchCode: string;
  receivedBaseQty: number;
  costPerBaseUnitCents: number;
  lowStockThreshold: number;
  thcPct: number | null;
  cbdPct: number | null;
  terpeneProfile: Record<string, number>;
  harvestDate: string | null;
  expiryDate: string | null;
}

export async function createBatch(input: CreateBatchInput): Promise<MasterBatchRow> {
  if (isLocalMode()) {
    try {
      return localCreateBatch(input);
    } catch (error) {
      throw wrap(error);
    }
  }
  const supabase = createCartelBrowserClient();
  const { data, error } = await supabase
    .from('master_batches')
    .insert({
      product_id: input.productId,
      branch_id: input.branchId,
      batch_code: input.batchCode,
      received_base_qty: input.receivedBaseQty,
      remaining_base_qty: input.receivedBaseQty,
      cost_per_base_unit_cents: input.costPerBaseUnitCents,
      low_stock_threshold: input.lowStockThreshold,
      lab_thc_pct: input.thcPct,
      lab_cbd_pct: input.cbdPct,
      terpene_profile: input.terpeneProfile,
      harvest_date: input.harvestDate,
      expiry_date: input.expiryDate,
    })
    .select('*')
    .single();
  if (error) throw wrap(error);
  return data;
}

export type CreateProductInput = LocalCreateProductInput;

export async function createProduct(input: CreateProductInput): Promise<ProductRow> {
  if (isLocalMode()) {
    try {
      return localCreateProduct(input);
    } catch (error) {
      throw wrap(error);
    }
  }

  const supabase = createCartelBrowserClient();
  const sku = input.sku.trim().toUpperCase();
  const name = input.name.trim();
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || `product-${Date.now()}`;

  const { data: product, error: prodError } = await supabase
    .from('products')
    .insert({
      sku,
      name,
      slug,
      category: input.category,
      base_uom: input.baseUom,
      strain: input.strain,
      short_tagline: input.shortTagline?.trim() || null,
      thc_pct: input.thcPct ?? null,
      cbd_pct: input.cbdPct ?? null,
      hero_media_url: input.heroMediaUrl?.trim() || null,
      category_id: input.categoryId ?? null,
      is_active: true,
      is_member_only: false,
    })
    .select('*')
    .single();

  if (prodError || !product) throw wrap(prodError ?? new Error('Could not create product.'));

  const { error: varError } = await supabase.from('product_variants').insert({
    product_id: product.id,
    label: input.variantLabel.trim() || 'Standard',
    base_quantity: input.variantBaseQty,
    price_cents: Math.round(input.variantPriceCents),
    is_active: true,
    is_custom_amount: false,
    pos_quick_key: true,
    sort_order: 1,
  });
  if (varError) throw wrap(varError);

  // Weighed and poured products also get an open tier, so the till can sell
  // any typed amount at the per-unit rate of the default tier.
  if (input.baseUom !== 'UNITS' && input.variantBaseQty > 0) {
    const { error: customError } = await supabase.from('product_variants').insert({
      product_id: product.id,
      label: input.baseUom === 'GRAMS' ? 'Custom g' : 'Custom ml',
      base_quantity: input.baseUom === 'GRAMS' ? 0.1 : 1,
      price_cents: Math.round(input.variantPriceCents / input.variantBaseQty),
      is_active: true,
      is_custom_amount: true,
      pos_quick_key: false,
      sort_order: 99,
    });
    if (customError) throw wrap(customError);
  }

  const alloc = input.initialAllocation;
  if (alloc && alloc.quantity > 0) {
    const batchCode = (
      alloc.batchCode?.trim() || `${sku}-${Date.now().toString(36).slice(-4)}`
    ).toUpperCase();
    const { data: batch, error: batchErr } = await supabase
      .from('master_batches')
      .insert({
        product_id: product.id,
        branch_id: alloc.branchId,
        batch_code: batchCode,
        received_base_qty: alloc.quantity,
        remaining_base_qty: alloc.quantity,
        cost_per_base_unit_cents: Math.max(0, Math.round(alloc.costPerBaseUnitCents)),
        low_stock_threshold: Math.max(0, alloc.lowStockThreshold ?? 10),
        lab_thc_pct: input.thcPct ?? null,
        lab_cbd_pct: input.cbdPct ?? null,
      })
      .select('*')
      .single();

    if (batchErr) throw wrap(batchErr);

    if (batch) {
      await supabase.from('stock_movements').insert({
        master_batch_id: batch.id,
        product_id: product.id,
        branch_id: alloc.branchId,
        movement_type: 'INTAKE',
        base_uom: input.baseUom,
        base_qty_delta: alloc.quantity,
        balance_after: alloc.quantity,
        unit_cost_cents: batch.cost_per_base_unit_cents,
        reason: 'Initial product branch allocation',
      });
    }
  }

  return product;
}

// ---------------------------------------------------------------------------
// Catalogue categories (flower grades and other shelf groupings)
// ---------------------------------------------------------------------------

export async function listCategories(): Promise<CatalogueCategoryRow[]> {
  if (isLocalMode()) return localListCategories();
  const supabase = createCartelBrowserClient();
  const { data, error } = await supabase
    .from('catalogue_categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw wrap(error);
  return data ?? [];
}

export async function createCategory(
  name: string,
  productType: CatalogueCategoryRow['product_type'],
): Promise<CatalogueCategoryRow> {
  if (isLocalMode()) {
    try {
      return localCreateCategory(name, productType);
    } catch (error) {
      throw wrap(error);
    }
  }
  const trimmed = name.trim();
  if (!trimmed) throw new DataSourceError('Give the category a name.');
  const supabase = createCartelBrowserClient();
  const { data, error } = await supabase
    .from('catalogue_categories')
    .insert({ name: trimmed, product_type: productType, sort_order: Math.floor(Date.now() / 1000) })
    .select('*')
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new DataSourceError(`A category named "${trimmed}" already exists.`);
    }
    throw wrap(error);
  }
  return data;
}

/** Removes a category; its products stay, uncategorised. */
export async function deleteCategory(categoryId: string): Promise<void> {
  if (isLocalMode()) {
    try {
      localDeleteCategory(categoryId);
      return;
    } catch (error) {
      throw wrap(error);
    }
  }
  const supabase = createCartelBrowserClient();
  const { error } = await supabase.from('catalogue_categories').delete().eq('id', categoryId);
  if (error) throw wrap(error);
}

export async function setProductCategory(
  productId: string,
  categoryId: string | null,
): Promise<void> {
  if (isLocalMode()) {
    try {
      localSetProductCategory(productId, categoryId);
      return;
    } catch (error) {
      throw wrap(error);
    }
  }
  const supabase = createCartelBrowserClient();
  const { error } = await supabase
    .from('products')
    .update({ category_id: categoryId })
    .eq('id', productId);
  if (error) throw wrap(error);
}

export async function deleteProduct(
  productId: string,
): Promise<{ deleted: boolean; archived: boolean }> {
  if (isLocalMode()) {
    try {
      return localDeleteProduct(productId);
    } catch (error) {
      throw wrap(error);
    }
  }

  const supabase = createCartelBrowserClient();
  const { error: deleteErr } = await supabase.from('products').delete().eq('id', productId);
  if (!deleteErr) {
    return { deleted: true, archived: false };
  }

  if ((deleteErr as { code?: string }).code === '23503') {
    const { error: archErr } = await supabase
      .from('products')
      .update({ is_active: false })
      .eq('id', productId);
    if (archErr) throw wrap(archErr);

    await Promise.all([
      supabase.from('product_variants').update({ is_active: false }).eq('product_id', productId),
      supabase.from('master_batches').update({ is_active: false }).eq('product_id', productId),
    ]);
    return { deleted: false, archived: true };
  }

  throw wrap(deleteErr);
}

export async function transferBatchStock(input: {
  sourceBatchId: string;
  targetBranchId: string;
  baseQty: number;
  reason?: string;
}): Promise<MasterBatchRow> {
  if (isLocalMode()) {
    try {
      return localTransferBatchStock(input);
    } catch (error) {
      throw wrap(error);
    }
  }

  const supabase = createCartelBrowserClient();
  const { data: source, error: srcErr } = await supabase
    .from('master_batches')
    .select('*')
    .eq('id', input.sourceBatchId)
    .single();
  if (srcErr || !source) throw wrap(srcErr ?? new Error('Source batch not found.'));

  const { error: outErr } = await supabase.rpc('adjust_batch_stock', {
    p_batch_id: source.id,
    p_movement_type: 'TRANSFER_OUT',
    p_base_qty: input.baseQty,
    p_reason: input.reason ?? 'Inter-branch transfer out',
    p_metadata: { target_branch_id: input.targetBranchId },
  });
  if (outErr) throw wrap(outErr);

  const { data: existingDest } = await supabase
    .from('master_batches')
    .select('*')
    .eq('branch_id', input.targetBranchId)
    .eq('product_id', source.product_id)
    .eq('batch_code', source.batch_code)
    .eq('is_active', true)
    .maybeSingle();

  if (existingDest) {
    const { data: updated, error: inErr } = await supabase.rpc('adjust_batch_stock', {
      p_batch_id: existingDest.id,
      p_movement_type: 'TRANSFER_IN',
      p_base_qty: input.baseQty,
      p_reason: input.reason ?? 'Inter-branch transfer in',
      p_metadata: { source_branch_id: source.branch_id },
    });
    if (inErr) throw wrap(inErr);
    return updated as unknown as MasterBatchRow;
  }

  const { data: created, error: createErr } = await supabase
    .from('master_batches')
    .insert({
      product_id: source.product_id,
      branch_id: input.targetBranchId,
      batch_code: source.batch_code,
      harvest_date: source.harvest_date,
      production_date: source.production_date,
      expiry_date: source.expiry_date,
      lab_thc_pct: source.lab_thc_pct,
      lab_cbd_pct: source.lab_cbd_pct,
      terpene_profile: source.terpene_profile,
      cost_per_base_unit_cents: source.cost_per_base_unit_cents,
      received_base_qty: input.baseQty,
      remaining_base_qty: input.baseQty,
      low_stock_threshold: source.low_stock_threshold,
    })
    .select('*')
    .single();
  if (createErr || !created) throw wrap(createErr ?? new Error('Could not create target batch.'));

  const { data: prod } = await supabase
    .from('products')
    .select('base_uom')
    .eq('id', source.product_id)
    .single();

  if (prod) {
    await supabase.from('stock_movements').insert({
      master_batch_id: created.id,
      product_id: source.product_id,
      branch_id: input.targetBranchId,
      movement_type: 'TRANSFER_IN',
      base_uom: prod.base_uom,
      base_qty_delta: input.baseQty,
      balance_after: input.baseQty,
      unit_cost_cents: source.cost_per_base_unit_cents,
      reason: input.reason ?? `Transfer from ${source.batch_code}`,
      metadata: { source_branch_id: source.branch_id },
    });
  }

  return created;
}

export interface MemberDossier {
  member: MemberRow;
  documents: KycDocumentRow[];
  orders: OrderRow[];
  orderItems: OrderItemRow[];
  products: ProductRow[];
  loyaltyLedger: LoyaltyLedgerRow[];
  creditLedger: MemberCreditLedgerRow[];
  loyaltyRules: LoyaltyRulesRow;
  affiliateCode: AffiliateCodeRow | null;
  attributions: AffiliateAttributionRow[];
  referrer: MemberRow | null;
  referrals: MemberRow[];
  interactions: CrmInteractionRow[];
}

export async function getMemberDossier(memberId: string): Promise<MemberDossier | null> {
  if (isLocalMode()) {
    const db = readLocalDb();
    const rawMember = db.members.find((m) => m.id === memberId);
    if (!rawMember) return null;
    const member = normalizeMember(rawMember);
    const orders = db.orders
      .filter((o) => o.member_id === memberId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const orderIds = new Set(orders.map((o) => o.id));
    const orderItems = db.orderItems.filter((item) => orderIds.has(item.order_id));
    const affiliateCode =
      db.affiliateCodes.find(
        (c) => c.owner_member_id === memberId || c.code === member.referral_code,
      ) ?? null;
    const attributions = affiliateCode
      ? db.attributions.filter((a) => a.affiliate_code_id === affiliateCode.id)
      : [];
    const referrer = member.referred_by_code
      ? db.members.find((m) => m.referral_code === member.referred_by_code) ?? null
      : null;
    const referrals = db.members
      .filter((m) => m.referred_by_code === member.referral_code && m.id !== member.id)
      .map(normalizeMember);
    const interactions = db.interactions
      .filter((i) => i.member_id === memberId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    return {
      member,
      documents: db.kycDocuments.filter((d) => d.member_id === memberId),
      orders,
      orderItems,
      products: db.products,
      loyaltyLedger: db.loyaltyLedger.filter((l) => l.member_id === memberId),
      creditLedger: db.creditLedger.filter((c) => c.member_id === memberId),
      loyaltyRules: db.loyaltyRules,
      affiliateCode,
      attributions,
      referrer: referrer ? normalizeMember(referrer) : null,
      referrals,
      interactions,
    };
  }

  const supabase = createCartelBrowserClient();
  const { data: memberData, error: memberErr } = await supabase
    .from('members')
    .select('*')
    .eq('id', memberId)
    .maybeSingle();
  if (memberErr) throw wrap(memberErr);
  if (!memberData) return null;

  const member = normalizeMember(memberData);

  const [
    documentsRes,
    ordersRes,
    loyaltyRes,
    creditRes,
    rulesRes,
    productsRes,
    affiliateRes,
    referralsRes,
    interactionsRes,
  ] = await Promise.all([
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
      .limit(50),
    supabase
      .from('loyalty_ledger')
      .select('*')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('member_credit_ledger')
      .select('*')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase.from('loyalty_rules').select('*').eq('is_active', true).limit(1).maybeSingle(),
    supabase.from('products').select('*'),
    supabase
      .from('affiliate_codes')
      .select('*')
      .eq('owner_member_id', memberId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('members')
      .select('*')
      .eq('referred_by_code', member.referral_code)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('crm_interactions')
      .select('*')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const orders = ordersRes.data ?? [];
  const orderIds = orders.map((o) => o.id);
  const [orderItems, attributionsRes, referrerRes] = await Promise.all([
    orderIds.length > 0 ? listOrderItems(orderIds) : Promise.resolve([]),
    affiliateRes.data
      ? supabase
          .from('affiliate_attributions')
          .select('*')
          .eq('affiliate_code_id', affiliateRes.data.id)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as AffiliateAttributionRow[] }),
    member.referred_by_code
      ? supabase
          .from('members')
          .select('*')
          .eq('referral_code', member.referred_by_code)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const fallbackRules: LoyaltyRulesRow = rulesRes.data ?? (await getLoyaltyRules());

  return {
    member,
    documents: documentsRes.data ?? [],
    orders,
    orderItems,
    products: productsRes.data ?? [],
    loyaltyLedger: loyaltyRes.data ?? [],
    creditLedger: creditRes.data ?? [],
    loyaltyRules: fallbackRules,
    affiliateCode: affiliateRes.data ?? null,
    attributions: attributionsRes.data ?? [],
    referrer: referrerRes.data ? normalizeMember(referrerRes.data) : null,
    referrals: (referralsRes.data ?? []).map(normalizeMember),
    interactions: interactionsRes.data ?? [],
  };
}

export async function updateMemberCrmProfile(
  memberId: string,
  patch: LocalUpdateMemberCrmPatch,
): Promise<MemberRow> {
  if (isLocalMode()) {
    try {
      return localUpdateMemberCrmProfile(memberId, patch);
    } catch (error) {
      throw wrap(error);
    }
  }
  const supabase = createCartelBrowserClient();
  const updatePayload: Partial<MemberRow> = {};
  if (patch.homeBranchId !== undefined) updatePayload.home_branch_id = patch.homeBranchId;
  if (patch.preferredUom !== undefined) updatePayload.preferred_uom = patch.preferredUom;
  if (patch.marketingOptIn !== undefined) updatePayload.marketing_opt_in = patch.marketingOptIn;
  if (patch.email !== undefined) updatePayload.email = patch.email.trim();
  if (patch.phone !== undefined) updatePayload.phone = patch.phone.trim();
  if (patch.internalNotes !== undefined) {
    updatePayload.internal_notes = patch.internalNotes?.trim() || null;
  }
  if (patch.crmTags !== undefined) {
    updatePayload.crm_tags = Array.from(
      new Set(patch.crmTags.map((t) => t.trim().toUpperCase().replace(/\s+/g, '_')).filter(Boolean)),
    );
  }

  const { data, error } = await supabase
    .from('members')
    .update(updatePayload)
    .eq('id', memberId)
    .select('*')
    .single();
  if (error) throw wrap(error);
  return normalizeMember(data);
}

export async function reviewMemberKyc(
  memberId: string,
  approve: boolean,
  reason?: string | null,
): Promise<MemberRow> {
  if (isLocalMode()) {
    try {
      return localReviewMemberKyc(memberId, approve, reason);
    } catch (error) {
      throw wrap(error);
    }
  }
  const supabase = createCartelBrowserClient();
  const { data, error } = await supabase.rpc('review_member_kyc', {
    p_member_id: memberId,
    p_approve: approve,
    p_reason: reason ?? undefined,
  });
  if (error) throw wrap(error);
  return normalizeMember(data as unknown as MemberRow);
}

export async function rotateMemberQrPass(memberId: string): Promise<string> {
  if (isLocalMode()) {
    try {
      return localRotateMemberQrToken(memberId);
    } catch (error) {
      throw wrap(error);
    }
  }
  const supabase = createCartelBrowserClient();
  const { data, error } = await supabase.rpc('staff_rotate_member_qr_token', {
    p_member_id: memberId,
  });
  if (error) throw wrap(error);
  return data;
}

export async function listCrmInteractions(memberId?: string): Promise<CrmInteractionRow[]> {
  if (isLocalMode()) {
    const all = readLocalDb().interactions;
    return (memberId ? all.filter((row) => row.member_id === memberId) : all).sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
  }
  const supabase = createCartelBrowserClient();
  let query = supabase
    .from('crm_interactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (memberId) query = query.eq('member_id', memberId);
  const { data, error } = await query;
  if (error) throw wrap(error);
  return data ?? [];
}

export async function addCrmInteraction(input: {
  memberId: string;
  branchId?: string | null;
  channel: CrmInteractionChannel;
  summary: string;
  followUpAt?: string | null;
}): Promise<CrmInteractionRow> {
  if (isLocalMode()) {
    try {
      return localAddCrmInteraction(input);
    } catch (error) {
      throw wrap(error);
    }
  }
  const supabase = createCartelBrowserClient();
  const { data, error } = await supabase
    .from('crm_interactions')
    .insert({
      member_id: input.memberId,
      branch_id: input.branchId ?? null,
      channel: input.channel,
      summary: input.summary.trim(),
      follow_up_at: input.followUpAt || null,
      follow_up_done: false,
    })
    .select('*')
    .single();
  if (error) throw wrap(error);
  return data;
}

export async function toggleCrmFollowUp(
  interactionId: string,
  done: boolean,
): Promise<CrmInteractionRow> {
  if (isLocalMode()) {
    try {
      return localToggleCrmFollowUp(interactionId, done);
    } catch (error) {
      throw wrap(error);
    }
  }
  const supabase = createCartelBrowserClient();
  const { data, error } = await supabase
    .from('crm_interactions')
    .update({ follow_up_done: done })
    .eq('id', interactionId)
    .select('*')
    .single();
  if (error) throw wrap(error);
  return data;
}

export async function syncCartReservations(input: {
  cartSessionId: string;
  branchId: string;
  items: { productId: string; baseQty: number }[];
  memberLabel?: string | null;
}): Promise<void> {
  if (isLocalMode()) {
    try {
      localSyncCartHolds(input);
      return;
    } catch (error) {
      throw wrap(error);
    }
  }
  const supabase = createCartelBrowserClient();
  const payload = input.items
    .filter((i) => i.baseQty > 0)
    .map((i) => ({ product_id: i.productId, base_qty: i.baseQty }));
  const { error } = await supabase.rpc('sync_cart_stock_holds', {
    p_cart_session_id: input.cartSessionId,
    p_branch_id: input.branchId,
    p_holds: payload,
    p_member_label: input.memberLabel ?? null,
  });
  if (error) throw wrap(error);
}

export async function listActiveCartHolds(branchId?: string): Promise<CartStockHoldRow[]> {
  if (isLocalMode()) return localListActiveCartHolds(branchId);
  const supabase = createCartelBrowserClient();
  let query = supabase
    .from('inventory_reservations')
    .select('*')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(200);
  if (branchId) query = query.eq('branch_id', branchId);
  const { data, error } = await query;
  if (error) throw wrap(error);
  return data ?? [];
}

export type CreateMemberInput = LocalCreateMemberInput;

export async function createMember(input: LocalCreateMemberInput): Promise<MemberRow> {
  if (isLocalMode()) {
    try {
      return localCreateMember(input);
    } catch (error) {
      throw wrap(error);
    }
  }
  const supabase = createCartelBrowserClient();
  const { data, error } = await supabase.rpc('submit_member_kyc', {
    p_payload: {
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email,
      phone: input.phone,
      id_document_type: input.idDocumentType,
      sa_id_number: input.saIdNumber ?? null,
      passport_number: input.passportNumber ?? null,
      passport_country: input.passportCountry ?? null,
      date_of_birth: input.dateOfBirth,
      nationality: input.nationality ?? null,
      gender: input.gender ?? null,
      preferred_uom: input.preferredUom ?? 'GRAMS',
      marketing_opt_in: input.marketingOptIn ?? false,
      home_branch_id: input.homeBranchId ?? null,
      referred_by_code: input.referredByCode ?? null,
    },
  });
  if (error) throw wrap(error);
  return data as unknown as MemberRow;
}

export async function setMemberStatus(
  memberId: string,
  status: MemberRow['status'],
  reason?: string | null,
): Promise<MemberRow> {
  if (isLocalMode()) {
    try {
      return localSetMemberStatus(memberId, status, reason);
    } catch (error) {
      throw wrap(error);
    }
  }
  const supabase = createCartelBrowserClient();

  // Approve / reject runs through the audited RPC; VIP and suspension are
  // straight column updates guarded by the staff RLS policy.
  if (status === 'ACTIVE_MEMBER') {
    const { data, error } = await supabase.rpc('review_member_kyc', {
      p_member_id: memberId,
      p_approve: true,
    });
    if (error) throw wrap(error);
    return data as unknown as MemberRow;
  }

  const { data, error } = await supabase
    .from('members')
    .update({
      status,
      ...(status === 'SUSPENDED'
        ? { suspended_reason: reason ?? 'Suspended by an administrator.' }
        : { suspended_reason: null }),
    })
    .eq('id', memberId)
    .select('*')
    .single();
  if (error) throw wrap(error);
  return data;
}

export async function adjustMemberCredit(
  memberId: string,
  deltaCents: number,
  reason: string,
): Promise<MemberRow> {
  if (isLocalMode()) {
    try {
      return localAdjustMemberCredit(memberId, deltaCents, reason);
    } catch (error) {
      throw wrap(error);
    }
  }
  const supabase = createCartelBrowserClient();
  const { error } = await supabase.rpc('adjust_member_credit', {
    p_member_id: memberId,
    p_delta_cents: deltaCents,
    p_reason: reason,
  });
  if (error) throw wrap(error);

  const { data, error: readError } = await supabase
    .from('members')
    .select('*')
    .eq('id', memberId)
    .single();
  if (readError) throw wrap(readError);
  return data;
}

export async function saveLoyaltyRules(
  patch: Partial<LoyaltyRulesRow>,
): Promise<LoyaltyRulesRow> {
  if (isLocalMode()) {
    try {
      return localSaveLoyaltyRules(patch);
    } catch (error) {
      throw wrap(error);
    }
  }
  const supabase = createCartelBrowserClient();
  const current = await getLoyaltyRules();
  const { data, error } = await supabase
    .from('loyalty_rules')
    .update(patch)
    .eq('id', current.id)
    .select('*')
    .single();
  if (error) throw wrap(error);
  return data;
}

export async function setAffiliateCommission(
  codeId: string,
  bps: number,
): Promise<AffiliateCodeRow> {
  if (isLocalMode()) {
    try {
      return localSetAffiliateCommission(codeId, bps);
    } catch (error) {
      throw wrap(error);
    }
  }
  const supabase = createCartelBrowserClient();
  const { data, error } = await supabase
    .from('affiliate_codes')
    .update({ commission_bps: Math.round(bps) })
    .eq('id', codeId)
    .select('*')
    .single();
  if (error) throw wrap(error);
  return data;
}

export async function settleCommission(
  attributionId: string,
  mode: 'CREDIT' | 'EFT',
): Promise<void> {
  if (isLocalMode()) {
    try {
      localSettleCommission(attributionId, mode);
      return;
    } catch (error) {
      throw wrap(error);
    }
  }
  const supabase = createCartelBrowserClient();

  if (mode === 'CREDIT') {
    const { data: attribution, error: readError } = await supabase
      .from('affiliate_attributions')
      .select('*, affiliate_codes(owner_member_id, code)')
      .eq('id', attributionId)
      .single();
    if (readError) throw wrap(readError);

    const joined = attribution as AffiliateAttributionRow & {
      affiliate_codes?: { owner_member_id: string | null; code: string } | null;
    };
    const ownerId = joined.affiliate_codes?.owner_member_id ?? null;

    if (ownerId) {
      const { error } = await supabase.rpc('adjust_member_credit', {
        p_member_id: ownerId,
        p_delta_cents: joined.commission_cents,
        p_reason: `Affiliate commission converted to credit (${joined.affiliate_codes?.code ?? 'referral'})`,
      });
      if (error) throw wrap(error);
    }
  }

  const { error } = await supabase
    .from('affiliate_attributions')
    .delete()
    .eq('id', attributionId);
  if (error) throw wrap(error);
}

export async function resolveDeliveryZone(
  branchId: string,
  lat: number,
  lng: number,
): Promise<ResolvedDeliveryZone | null> {
  if (isLocalMode()) return localResolveDeliveryZone(branchId, lat, lng);
  const supabase = createCartelBrowserClient();
  const { data, error } = await supabase.rpc('resolve_delivery_zone', {
    p_branch_id: branchId,
    p_lat: lat,
    p_lng: lng,
  });
  if (error) throw wrap(error);
  const rows = data as unknown as ResolvedDeliveryZone[] | null;
  return rows?.[0] ?? null;
}

export async function createMediaJob(input: {
  productId: string;
  prompt: string;
  kind: string;
  params: Record<string, string | number | boolean>;
}): Promise<ProductMediaJobRow> {
  if (isLocalMode()) {
    try {
      return localCreateMediaJob(input);
    } catch (error) {
      throw wrap(error);
    }
  }
  const supabase = createCartelBrowserClient();
  const { data, error } = await supabase
    .from('product_media_jobs')
    .insert({
      product_id: input.productId,
      provider: 'higgsfield',
      kind: input.kind,
      prompt: input.prompt,
      params: input.params,
      status: 'QUEUED',
    })
    .select('*')
    .single();
  if (error) throw wrap(error);
  return data;
}

export async function updateMediaJob(
  jobId: string,
  patch: Partial<ProductMediaJobRow>,
): Promise<ProductMediaJobRow> {
  if (isLocalMode()) {
    try {
      return localUpdateMediaJob(jobId, patch);
    } catch (error) {
      throw wrap(error);
    }
  }
  const supabase = createCartelBrowserClient();
  const { data, error } = await supabase
    .from('product_media_jobs')
    .update(patch)
    .eq('id', jobId)
    .select('*')
    .single();
  if (error) throw wrap(error);
  return data;
}

// ---------------------------------------------------------------------------
// Change notification
// ---------------------------------------------------------------------------

const LIVE_TABLES = ['products', 'product_variants', 'catalogue_categories', 'master_batches'];
const liveListeners = new Set<() => void>();
let liveChannel: ReturnType<ReturnType<typeof createCartelBrowserClient>['channel']> | null = null;
let liveTimer: ReturnType<typeof setTimeout> | null = null;

function notifyLiveListeners() {
  // One import or one sale touches many rows; refetch once, not per row.
  if (liveTimer) clearTimeout(liveTimer);
  liveTimer = setTimeout(() => {
    for (const listener of liveListeners) listener();
  }, 400);
}

/**
 * Fires whenever catalogue or stock data changes, so every open screen
 * refetches: a product or category added in the back office appears on the
 * tills without a reload. Local preview listens to the in-browser engine;
 * Supabase listens to Realtime on the catalogue and stock tables through one
 * shared channel.
 */
export function subscribeToData(listener: () => void): () => void {
  if (isLocalMode()) return subscribeLocalDb(listener);
  if (typeof window === 'undefined') return () => undefined;

  liveListeners.add(listener);
  if (!liveChannel) {
    const supabase = createCartelBrowserClient();
    let channel = supabase.channel('cartel-catalogue-live');
    for (const table of LIVE_TABLES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        notifyLiveListeners,
      );
    }
    liveChannel = channel.subscribe();
  }

  return () => {
    liveListeners.delete(listener);
    if (liveListeners.size === 0 && liveChannel) {
      void createCartelBrowserClient().removeChannel(liveChannel);
      liveChannel = null;
    }
  };
}

export type { LocalCreateMemberInput, LocalUpdateMemberCrmPatch };
