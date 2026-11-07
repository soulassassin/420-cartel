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
  LoyaltyRulesRow,
  MasterBatchRow,
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
  localAdjustBatchStock,
  localAdjustMemberCredit,
  localCreateBatch,
  localCreateMediaJob,
  localCreateMember,
  localLookupMembers,
  localProcessOrder,
  localResolveDeliveryZone,
  localSaveLoyaltyRules,
  localSetAffiliateCommission,
  localSetMemberStatus,
  localSettleCommission,
  localStockLevel,
  localUpdateMediaJob,
  readLocalDb,
  subscribeLocalDb,
  type LocalCreateMemberInput,
} from '@/lib/demo/engine';

export type DataMode = 'SUPABASE' | 'LOCAL';

export function dataMode(): DataMode {
  return process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? 'SUPABASE'
    : 'LOCAL';
}

export const IS_LOCAL_PREVIEW = dataMode() === 'LOCAL';

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
  if (IS_LOCAL_PREVIEW) return readLocalDb().branches;
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
  if (IS_LOCAL_PREVIEW) {
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

export async function listMembers(): Promise<MemberRow[]> {
  if (IS_LOCAL_PREVIEW) return readLocalDb().members;
  const supabase = createCartelBrowserClient();
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw wrap(error);
  return data ?? [];
}

export async function lookupMembers(query: string): Promise<MemberRow[]> {
  if (IS_LOCAL_PREVIEW) return localLookupMembers(query);
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
  if (IS_LOCAL_PREVIEW) return readLocalDb().orders.slice(0, limit);
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
  if (IS_LOCAL_PREVIEW) {
    return readLocalDb().orderItems.filter((item) => orderIds.includes(item.order_id));
  }
  const supabase = createCartelBrowserClient();
  const { data, error } = await supabase.from('order_items').select('*').in('order_id', orderIds);
  if (error) throw wrap(error);
  return data ?? [];
}

export async function listStockMovements(limit = 300): Promise<StockMovementRow[]> {
  if (IS_LOCAL_PREVIEW) return readLocalDb().movements.slice(0, limit);
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
  if (IS_LOCAL_PREVIEW) return readLocalDb().loyaltyRules;
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
  if (IS_LOCAL_PREVIEW) return readLocalDb().affiliateCodes;
  const supabase = createCartelBrowserClient();
  const { data, error } = await supabase
    .from('affiliate_codes')
    .select('*')
    .order('order_count', { ascending: false });
  if (error) throw wrap(error);
  return data ?? [];
}

export async function listAffiliateAttributions(): Promise<AffiliateAttributionRow[]> {
  if (IS_LOCAL_PREVIEW) return readLocalDb().attributions;
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
  if (IS_LOCAL_PREVIEW) return readLocalDb().mediaJobs;
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
  if (IS_LOCAL_PREVIEW) {
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
  if (IS_LOCAL_PREVIEW) {
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
  if (IS_LOCAL_PREVIEW) {
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

export async function createMember(input: LocalCreateMemberInput): Promise<MemberRow> {
  if (IS_LOCAL_PREVIEW) {
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
  if (IS_LOCAL_PREVIEW) {
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
  if (IS_LOCAL_PREVIEW) {
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
  if (IS_LOCAL_PREVIEW) {
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
  if (IS_LOCAL_PREVIEW) {
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
  if (IS_LOCAL_PREVIEW) {
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
  if (IS_LOCAL_PREVIEW) return localResolveDeliveryZone(branchId, lat, lng);
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
  if (IS_LOCAL_PREVIEW) {
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
  if (IS_LOCAL_PREVIEW) {
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

/**
 * Fires whenever local-engine data changes, so grids refetch after a sale. On
 * Supabase this is a no-op: callers refetch explicitly or subscribe to
 * Realtime themselves.
 */
export function subscribeToData(listener: () => void): () => void {
  if (IS_LOCAL_PREVIEW) return subscribeLocalDb(listener);
  return () => undefined;
}

export type { LocalCreateMemberInput };
