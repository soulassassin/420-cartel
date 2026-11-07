'use client';

/**
 * 420 CARTEL :: local preview engine
 *
 * A faithful in-browser mirror of the Postgres layer, used when
 * NEXT_PUBLIC_SUPABASE_URL is not configured. It implements the same rules as
 * `process_cartel_order`:
 *
 *   - FIFO batch allocation by `received_at`, oldest batch first
 *   - a hard refusal when the on-hand balance cannot cover the line
 *   - one stock_movements row per batch touched, with the balance after
 *   - member credit debited and ledgered when MEMBER_CREDIT tenders
 *   - loyalty points accrued and rank re-evaluated from lifetime value
 *   - affiliate commission attributed when a referral code resolves
 *
 * It is deliberately NOT a security boundary — it runs in the browser and is
 * for demonstration and development only. The moment Supabase is configured,
 * `lib/data/source.ts` routes every call to the real database instead.
 */

import type {
  AffiliateAttributionRow,
  AffiliateCodeRow,
  BranchRow,
  DeliveryZoneRow,
  LoyaltyLedgerRow,
  LoyaltyRulesRow,
  MasterBatchRow,
  MemberCreditLedgerRow,
  MemberRank,
  MemberRow,
  OrderItemRow,
  OrderRow,
  PaymentRow,
  ProcessOrderPayload,
  ProcessOrderResult,
  ProductMediaJobRow,
  ProductRow,
  ProductStockLevelRow,
  ProductVariantRow,
  ResolvedDeliveryZone,
  StaffProfileRow,
  StockMovementRow,
  StockMovementType,
  BatchAllocationEntry,
} from '@/types/database';
import { roundBaseQty } from '@/lib/uom';
import {
  SEED_AFFILIATE_CODES,
  SEED_BATCHES,
  SEED_BRANCHES,
  SEED_DELIVERY_ZONES,
  SEED_LOYALTY_RULES,
  SEED_MEMBERS,
  SEED_PRODUCTS,
  SEED_STAFF,
  SEED_VARIANTS,
} from './fixtures';

const STORAGE_KEY = 'cartel-local-db';
const STORAGE_VERSION = 3;

export interface LocalDb {
  version: number;
  branches: BranchRow[];
  staff: StaffProfileRow[];
  members: MemberRow[];
  products: ProductRow[];
  variants: ProductVariantRow[];
  batches: MasterBatchRow[];
  movements: StockMovementRow[];
  zones: DeliveryZoneRow[];
  orders: OrderRow[];
  orderItems: OrderItemRow[];
  payments: PaymentRow[];
  creditLedger: MemberCreditLedgerRow[];
  loyaltyLedger: LoyaltyLedgerRow[];
  loyaltyRules: LoyaltyRulesRow;
  affiliateCodes: AffiliateCodeRow[];
  attributions: AffiliateAttributionRow[];
  mediaJobs: ProductMediaJobRow[];
  orderSequence: number;
}

function freshDb(): LocalDb {
  return {
    version: STORAGE_VERSION,
    branches: structuredCloneSafe(SEED_BRANCHES),
    staff: structuredCloneSafe(SEED_STAFF),
    members: structuredCloneSafe(SEED_MEMBERS),
    products: structuredCloneSafe(SEED_PRODUCTS),
    variants: structuredCloneSafe(SEED_VARIANTS),
    batches: structuredCloneSafe(SEED_BATCHES),
    movements: [],
    zones: structuredCloneSafe(SEED_DELIVERY_ZONES),
    orders: [],
    orderItems: [],
    payments: [],
    creditLedger: [],
    loyaltyLedger: [],
    loyaltyRules: structuredCloneSafe(SEED_LOYALTY_RULES),
    affiliateCodes: structuredCloneSafe(SEED_AFFILIATE_CODES),
    attributions: [],
    mediaJobs: [],
    orderSequence: 1,
  };
}

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

let cache: LocalDb | null = null;
const listeners = new Set<() => void>();

function load(): LocalDb {
  if (cache) return cache;
  if (typeof window === 'undefined') {
    cache = freshDb();
    return cache;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalDb;
      // A version bump means the fixtures changed — start clean rather than
      // merging a half-migrated shape.
      if (parsed.version === STORAGE_VERSION) {
        cache = parsed;
        return cache;
      }
    }
  } catch {
    // Corrupt or blocked storage: fall through to a fresh database.
  }
  cache = freshDb();
  persist();
  return cache;
}

function persist(): void {
  if (typeof window === 'undefined' || !cache) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Private browsing or a full quota — the session still works in memory.
  }
}

function commit<T>(mutate: (db: LocalDb) => T): T {
  const db = load();
  const result = mutate(db);
  persist();
  for (const listener of listeners) listener();
  return result;
}

export function subscribeLocalDb(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readLocalDb(): LocalDb {
  return load();
}

/** Wipes the local preview database back to the seeded fixtures. */
export function resetLocalDb(): void {
  cache = freshDb();
  persist();
  for (const listener of listeners) listener();
}

// ---------------------------------------------------------------------------
// Derived reads
// ---------------------------------------------------------------------------

export function localStockLevel(
  db: LocalDb,
  product: ProductRow,
  branchId: string,
): ProductStockLevelRow {
  const batches = db.batches.filter(
    (batch) => batch.product_id === product.id && batch.branch_id === branchId && batch.is_active,
  );
  const remaining = batches.reduce((total, batch) => total + batch.remaining_base_qty, 0);
  const reserved = batches.reduce((total, batch) => total + batch.reserved_base_qty, 0);
  const threshold = batches.reduce(
    (highest, batch) => Math.max(highest, batch.low_stock_threshold),
    0,
  );
  const available = roundBaseQty(remaining - reserved, product.base_uom);

  return {
    product_id: product.id,
    sku: product.sku,
    name: product.name,
    category: product.category,
    base_uom: product.base_uom,
    branch_id: branchId,
    remaining_base_qty: roundBaseQty(remaining, product.base_uom),
    reserved_base_qty: roundBaseQty(reserved, product.base_uom),
    available_base_qty: available,
    low_stock_threshold: threshold,
    is_low_stock: available <= threshold,
    open_batch_count: batches.filter((batch) => batch.remaining_base_qty > 0).length,
  };
}

// ---------------------------------------------------------------------------
// Stock adjustment — mirrors `adjust_batch_stock`
// ---------------------------------------------------------------------------

export class LocalEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalEngineError';
  }
}

export function localAdjustBatchStock(input: {
  batchId: string;
  movementType: StockMovementType;
  baseQty: number;
  reason?: string;
  performedBy?: string | null;
}): MasterBatchRow {
  return commit((db) => {
    const batch = db.batches.find((candidate) => candidate.id === input.batchId);
    if (!batch) throw new LocalEngineError('That batch no longer exists.');

    const product = db.products.find((candidate) => candidate.id === batch.product_id);
    if (!product) throw new LocalEngineError('That batch has no parent product.');

    // Intake and returns add; everything else removes.
    const additive =
      input.movementType === 'INTAKE' ||
      input.movementType === 'RETURN' ||
      input.movementType === 'TRANSFER_IN';
    const magnitude = Math.abs(input.baseQty);
    if (magnitude <= 0) throw new LocalEngineError('Enter an amount greater than zero.');

    const delta = additive ? magnitude : -magnitude;
    const next = roundBaseQty(batch.remaining_base_qty + delta, product.base_uom);

    if (next < 0) {
      throw new LocalEngineError(
        `${batch.batch_code} only holds ${batch.remaining_base_qty} — cannot remove ${magnitude}.`,
      );
    }

    batch.remaining_base_qty = next;
    if (additive) {
      batch.received_base_qty = roundBaseQty(
        batch.received_base_qty + magnitude,
        product.base_uom,
      );
    }
    batch.updated_at = new Date().toISOString();

    db.movements.unshift({
      id: newId(),
      master_batch_id: batch.id,
      product_id: batch.product_id,
      branch_id: batch.branch_id,
      movement_type: input.movementType,
      base_uom: product.base_uom,
      base_qty_delta: delta,
      balance_after: next,
      unit_cost_cents: batch.cost_per_base_unit_cents,
      order_id: null,
      performed_by: input.performedBy ?? null,
      reason: input.reason ?? null,
      metadata: {},
      created_at: new Date().toISOString(),
    });

    return structuredCloneSafe(batch);
  });
}

export function localCreateBatch(input: {
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
  createdBy?: string | null;
}): MasterBatchRow {
  return commit((db) => {
    if (db.batches.some((batch) => batch.batch_code === input.batchCode)) {
      throw new LocalEngineError(`Batch code ${input.batchCode} is already in use.`);
    }
    const product = db.products.find((candidate) => candidate.id === input.productId);
    if (!product) throw new LocalEngineError('Pick a product for this batch.');

    const now = new Date().toISOString();
    const batch: MasterBatchRow = {
      id: newId(),
      product_id: input.productId,
      branch_id: input.branchId,
      batch_code: input.batchCode,
      harvest_date: input.harvestDate,
      production_date: input.harvestDate,
      expiry_date: input.expiryDate,
      lab_thc_pct: input.thcPct,
      lab_cbd_pct: input.cbdPct,
      lab_report_url: null,
      terpene_profile: input.terpeneProfile,
      cost_per_base_unit_cents: input.costPerBaseUnitCents,
      received_base_qty: input.receivedBaseQty,
      remaining_base_qty: input.receivedBaseQty,
      reserved_base_qty: 0,
      low_stock_threshold: input.lowStockThreshold,
      is_active: true,
      received_at: now,
      created_by: input.createdBy ?? null,
      created_at: now,
      updated_at: now,
      // Higgsfield promo columns (migration 0005): populated by the media
      // pipeline, never at intake.
      higgsfield_job_id: null,
      higgsfield_promo_video_url: null,
      higgsfield_poster_url: null,
      higgsfield_generated_at: null,
    };

    db.batches.push(batch);
    db.movements.unshift({
      id: newId(),
      master_batch_id: batch.id,
      product_id: batch.product_id,
      branch_id: batch.branch_id,
      movement_type: 'INTAKE',
      base_uom: product.base_uom,
      base_qty_delta: input.receivedBaseQty,
      balance_after: input.receivedBaseQty,
      unit_cost_cents: input.costPerBaseUnitCents,
      order_id: null,
      performed_by: input.createdBy ?? null,
      reason: 'Harvest / production intake',
      metadata: {},
      created_at: now,
    });

    return structuredCloneSafe(batch);
  });
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

function rankForLifetimeValue(rules: LoyaltyRulesRow, cents: number): MemberRank {
  const entries = Object.entries(rules.rank_thresholds) as [MemberRank, number][];
  return entries
    .slice()
    .sort((a, b) => a[1] - b[1])
    .reduce<MemberRank>((best, [rank, threshold]) => (cents >= threshold ? rank : best), 'INITIATE');
}

function nextMemberCode(db: LocalDb): string {
  // Four digits, never colliding with an existing member.
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const candidate = `CARTEL-${String(Math.floor(1000 + Math.random() * 8999))}`;
    if (!db.members.some((member) => member.member_code === candidate)) return candidate;
  }
  return `CARTEL-${Date.now().toString().slice(-4)}`;
}

export interface LocalCreateMemberInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  idDocumentType: 'SA_ID' | 'PASSPORT';
  saIdNumber?: string | null;
  passportNumber?: string | null;
  passportCountry?: string | null;
  dateOfBirth: string;
  nationality?: string | null;
  gender?: string | null;
  preferredUom?: MemberRow['preferred_uom'];
  marketingOptIn?: boolean;
  homeBranchId?: string | null;
  referredByCode?: string | null;
  /** Walk-ins rung up at the till are approved on the spot by the cashier. */
  autoApprove?: boolean;
}

export function localCreateMember(input: LocalCreateMemberInput): MemberRow {
  return commit((db) => {
    const normalizedId = input.saIdNumber?.replace(/\D/g, '') ?? null;
    if (normalizedId) {
      const clash = db.members.find((member) => member.sa_id_number === normalizedId);
      if (clash) {
        throw new LocalEngineError(
          `That ID number is already registered to ${clash.member_code}.`,
        );
      }
    }

    const now = new Date().toISOString();
    const code = nextMemberCode(db);
    const member: MemberRow = {
      id: newId(),
      member_code: code,
      qr_token: `CARTELPASS${code.replace('CARTEL-', '')}${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      status: input.autoApprove ? 'ACTIVE_MEMBER' : 'PENDING_KYC',
      rank: 'INITIATE',
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email,
      phone: input.phone,
      id_document_type: input.idDocumentType,
      sa_id_number: normalizedId,
      passport_number: input.passportNumber ?? null,
      passport_country: input.passportCountry ?? null,
      date_of_birth: input.dateOfBirth,
      nationality: input.nationality ?? null,
      gender: input.gender ?? null,
      age_verified_at: now,
      kyc_submitted_at: now,
      kyc_approved_at: input.autoApprove ? now : null,
      kyc_approved_by: null,
      agreement_signed_at: input.autoApprove ? now : null,
      agreement_version: input.autoApprove ? '2026.1' : null,
      agreement_signature_path: null,
      preferred_uom: input.preferredUom ?? 'GRAMS',
      marketing_opt_in: input.marketingOptIn ?? false,
      home_branch_id: input.homeBranchId ?? null,
      lifetime_value_cents: 0,
      order_count: 0,
      credit_balance_cents: 0,
      points_balance: 0,
      referral_code: code,
      referred_by_code: input.referredByCode ?? null,
      suspended_reason: null,
      internal_notes: null,
      last_seen_at: now,
      created_at: now,
      updated_at: now,
    };

    db.members.unshift(member);

    // Issue the new member their own affiliate code immediately.
    db.affiliateCodes.push({
      id: newId(),
      code,
      owner_member_id: member.id,
      label: `${member.first_name} ${member.last_name}`,
      commission_bps: 500,
      click_count: 0,
      signup_count: 0,
      order_count: 0,
      is_active: true,
      created_at: now,
      updated_at: now,
    });

    // Credit the referrer with a signup, if the code resolves.
    if (member.referred_by_code) {
      const referrer = db.affiliateCodes.find(
        (candidate) => candidate.code === member.referred_by_code,
      );
      if (referrer) referrer.signup_count += 1;
    }

    return structuredCloneSafe(member);
  });
}

export function localSetMemberStatus(
  memberId: string,
  status: MemberRow['status'],
  reason?: string | null,
): MemberRow {
  return commit((db) => {
    const member = db.members.find((candidate) => candidate.id === memberId);
    if (!member) throw new LocalEngineError('That member no longer exists.');

    const now = new Date().toISOString();
    member.status = status;
    member.updated_at = now;

    if (status === 'ACTIVE_MEMBER' || status === 'VIP') {
      member.kyc_approved_at = member.kyc_approved_at ?? now;
      member.age_verified_at = member.age_verified_at ?? now;
      member.agreement_signed_at = member.agreement_signed_at ?? now;
      member.agreement_version = member.agreement_version ?? '2026.1';
      member.suspended_reason = null;
    }
    if (status === 'SUSPENDED') {
      member.suspended_reason = reason ?? 'Suspended by an administrator.';
    }

    return structuredCloneSafe(member);
  });
}

export function localAdjustMemberCredit(
  memberId: string,
  deltaCents: number,
  reason: string,
): MemberRow {
  return commit((db) => {
    const member = db.members.find((candidate) => candidate.id === memberId);
    if (!member) throw new LocalEngineError('That member no longer exists.');

    const next = member.credit_balance_cents + Math.round(deltaCents);
    if (next < 0) throw new LocalEngineError('A member’s credit balance cannot go negative.');

    member.credit_balance_cents = next;
    member.updated_at = new Date().toISOString();

    db.creditLedger.unshift({
      id: newId(),
      member_id: member.id,
      order_id: null,
      delta_cents: Math.round(deltaCents),
      balance_after: next,
      reason,
      created_by: null,
      created_at: new Date().toISOString(),
    });

    return structuredCloneSafe(member);
  });
}

/** Mirror of `lookup_member_for_pos` — code, QR token, phone, ID or name. */
export function localLookupMembers(query: string): MemberRow[] {
  const db = load();
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  const digits = needle.replace(/\D/g, '');

  return db.members
    .filter((member) => {
      if (member.member_code.toLowerCase() === needle) return true;
      if (member.qr_token.toLowerCase() === needle) return true;
      if (member.member_code.toLowerCase().includes(needle)) return true;
      if (`${member.first_name} ${member.last_name}`.toLowerCase().includes(needle)) return true;
      if (member.email.toLowerCase().includes(needle)) return true;
      if (digits.length >= 4) {
        if (member.phone.replace(/\D/g, '').includes(digits)) return true;
        if ((member.sa_id_number ?? '').includes(digits)) return true;
      }
      return false;
    })
    .slice(0, 20)
    .map((member) => structuredCloneSafe(member));
}

// ---------------------------------------------------------------------------
// Delivery zones — mirror of `resolve_delivery_zone`
// ---------------------------------------------------------------------------

export function haversineKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 100) / 100;
}

export function localResolveDeliveryZone(
  branchId: string,
  lat: number,
  lng: number,
): ResolvedDeliveryZone | null {
  const db = load();
  const branch = db.branches.find((candidate) => candidate.id === branchId);
  if (!branch || !branch.delivery_enabled) return null;

  const distanceKm = haversineKm(
    { lat: branch.latitude, lng: branch.longitude },
    { lat, lng },
  );

  const match = db.zones
    .filter((zone) => zone.branch_id === branchId && zone.is_active)
    .sort((a, b) => a.priority - b.priority)
    .find((zone) => zone.max_radius_km !== null && distanceKm <= zone.max_radius_km);

  if (!match) return null;

  return {
    zone_id: match.id,
    zone_name: match.name,
    fee_cents: match.fee_cents,
    min_order_cents: match.min_order_cents,
    free_over_cents: match.free_over_cents,
    eta_minutes: match.eta_minutes,
    distance_km: distanceKm,
    matched_by: 'RADIUS',
  };
}

// ---------------------------------------------------------------------------
// Order processing — mirror of `process_cartel_order`
// ---------------------------------------------------------------------------

interface PlannedLine {
  variant: ProductVariantRow;
  product: ProductRow;
  baseQtyPerUnit: number;
  quantity: number;
  totalBaseQty: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export function localProcessOrder(payload: ProcessOrderPayload): ProcessOrderResult {
  return commit((db) => {
    // --- Idempotency: replay the stored receipt rather than double-deducting.
    if (payload.idempotency_key) {
      const existing = db.orders.find(
        (order) => order.idempotency_key === payload.idempotency_key,
      );
      if (existing) return buildReceipt(db, existing, true);
    }

    if (payload.items.length === 0) {
      throw new LocalEngineError('An order needs at least one line.');
    }

    const branch = db.branches.find((candidate) => candidate.id === payload.branch_id);
    if (!branch) throw new LocalEngineError('Unknown branch.');

    const member = payload.member_id
      ? db.members.find((candidate) => candidate.id === payload.member_id)
      : null;

    if (payload.member_id && !member) throw new LocalEngineError('Unknown member.');
    if (member && member.status === 'SUSPENDED') {
      throw new LocalEngineError(
        `${member.member_code} is suspended and cannot transact.`,
      );
    }

    // --- Resolve and price every line ------------------------------------
    const planned: PlannedLine[] = payload.items.map((item) => {
      const variant = db.variants.find((candidate) => candidate.id === item.variant_id);
      if (!variant) throw new LocalEngineError('A line references a tier that no longer exists.');

      const product = db.products.find((candidate) => candidate.id === variant.product_id);
      if (!product) throw new LocalEngineError('A line references a product that no longer exists.');

      if (item.quantity <= 0 || !Number.isInteger(item.quantity)) {
        throw new LocalEngineError(`${product.name}: quantity must be a whole number above zero.`);
      }

      if (variant.is_custom_amount && item.base_qty_override === undefined) {
        throw new LocalEngineError(
          `${product.name}: a custom tier needs an exact ${product.base_uom === 'GRAMS' ? 'weight' : 'volume'}.`,
        );
      }

      const baseQtyPerUnit = variant.is_custom_amount
        ? roundBaseQty(item.base_qty_override ?? 0, product.base_uom)
        : variant.base_quantity;

      if (baseQtyPerUnit <= 0) {
        throw new LocalEngineError(`${product.name}: the amount must be above zero.`);
      }

      // A custom tier's price_cents is the per-base-unit rate.
      const unitPriceCents = variant.is_custom_amount
        ? Math.round(variant.price_cents * baseQtyPerUnit)
        : variant.price_cents;

      return {
        variant,
        product,
        baseQtyPerUnit,
        quantity: item.quantity,
        totalBaseQty: roundBaseQty(baseQtyPerUnit * item.quantity, product.base_uom),
        unitPriceCents,
        lineTotalCents: unitPriceCents * item.quantity,
      };
    });

    // --- Check the whole order against stock before touching anything ----
    // Several lines can draw on the same product, so demand is summed first.
    const demandByProduct = new Map<string, number>();
    for (const line of planned) {
      demandByProduct.set(
        line.product.id,
        (demandByProduct.get(line.product.id) ?? 0) + line.totalBaseQty,
      );
    }

    for (const [productId, demand] of demandByProduct) {
      const product = db.products.find((candidate) => candidate.id === productId);
      if (!product) continue;
      const level = localStockLevel(db, product, payload.branch_id);
      const availableQty = payload.ignore_reservations
        ? level.remaining_base_qty
        : level.available_base_qty;
      if (availableQty + 1e-9 < demand) {
        throw new LocalEngineError(
          `${product.name}: only ${availableQty} on hand, ${roundBaseQty(demand, product.base_uom)} requested.`,
        );
      }
    }

    const subtotalCents = planned.reduce((total, line) => total + line.lineTotalCents, 0);

    // --- Delivery fee ------------------------------------------------------
    let deliveryFeeCents = 0;
    let resolvedZone: ResolvedDeliveryZone | null = null;

    if (payload.fulfilment_type === 'DELIVERY') {
      if (!payload.delivery) throw new LocalEngineError('A delivery order needs an address.');
      resolvedZone = localResolveDeliveryZone(
        payload.branch_id,
        payload.delivery.lat,
        payload.delivery.lng,
      );
      if (!resolvedZone) {
        throw new LocalEngineError('That address is outside every delivery zone.');
      }
      if (subtotalCents < resolvedZone.min_order_cents) {
        throw new LocalEngineError(
          `${resolvedZone.zone_name} has a minimum order of R${(resolvedZone.min_order_cents / 100).toFixed(2)}.`,
        );
      }
      const qualifiesFree =
        resolvedZone.free_over_cents !== null && subtotalCents >= resolvedZone.free_over_cents;
      deliveryFeeCents = qualifiesFree ? 0 : resolvedZone.fee_cents;
    }

    // --- Points redemption and discount ----------------------------------
    const rules = db.loyaltyRules;
    const pointsRedeemed = Math.max(0, Math.floor(payload.points_redeemed ?? 0));

    if (pointsRedeemed > 0) {
      if (!member) throw new LocalEngineError('Points can only be redeemed by a member.');
      if (pointsRedeemed > member.points_balance) {
        throw new LocalEngineError(`${member.member_code} holds ${member.points_balance} points.`);
      }
      if (pointsRedeemed < rules.min_redeem_points) {
        throw new LocalEngineError(`Minimum redemption is ${rules.min_redeem_points} points.`);
      }
    }

    const redemptionCents = pointsRedeemed * rules.point_value_cents;
    const discountCents = Math.min(
      subtotalCents,
      Math.max(0, Math.round(payload.discount_cents ?? 0)) + redemptionCents,
    );
    const totalCents = subtotalCents - discountCents + deliveryFeeCents;

    // --- Validate tender --------------------------------------------------
    const tenders = payload.payments ?? [];
    const creditTender = tenders
      .filter((tender) => tender.method === 'MEMBER_CREDIT')
      .reduce((total, tender) => total + tender.amount_cents, 0);

    if (creditTender > 0) {
      if (!member) throw new LocalEngineError('Store credit requires a member on the ticket.');
      if (creditTender > member.credit_balance_cents) {
        throw new LocalEngineError(
          `${member.member_code} has R${(member.credit_balance_cents / 100).toFixed(2)} of credit — R${(creditTender / 100).toFixed(2)} tendered.`,
        );
      }
    }

    const IMMEDIATE: ReadonlySet<string> = new Set([
      'CASH',
      'CARD_TERMINAL',
      'EFT_INSTANT',
      'MEMBER_CREDIT',
    ]);
    const capturedCents = tenders
      .filter((tender) => IMMEDIATE.has(tender.method))
      .reduce((total, tender) => total + tender.amount_cents, 0);
    const pendingCents = tenders
      .filter((tender) => !IMMEDIATE.has(tender.method))
      .reduce((total, tender) => total + tender.amount_cents, 0);

    if (capturedCents + pendingCents > totalCents + 1) {
      throw new LocalEngineError('Tendered amount exceeds the order total.');
    }

    // --- Write the order --------------------------------------------------
    const now = new Date().toISOString();
    const settled = capturedCents >= totalCents;
    const orderNumber = `${payload.channel === 'POS' ? 'P' : 'W'}${String(db.orderSequence).padStart(6, '0')}`;
    db.orderSequence += 1;

    const orderId = newId();
    let costCents = 0;

    // --- FIFO allocation, batch by batch ---------------------------------
    const items: OrderItemRow[] = [];

    for (const line of planned) {
      const allocation: BatchAllocationEntry[] = [];
      let outstanding = line.totalBaseQty;

      const candidates = db.batches
        .filter(
          (batch) =>
            batch.product_id === line.product.id &&
            batch.branch_id === payload.branch_id &&
            batch.is_active &&
            batch.remaining_base_qty > 0,
        )
        .sort((a, b) => a.received_at.localeCompare(b.received_at));

      for (const batch of candidates) {
        if (outstanding <= 1e-9) break;
        const take = roundBaseQty(
          Math.min(batch.remaining_base_qty, outstanding),
          line.product.base_uom,
        );
        if (take <= 0) continue;

        batch.remaining_base_qty = roundBaseQty(
          batch.remaining_base_qty - take,
          line.product.base_uom,
        );
        batch.updated_at = now;
        outstanding = roundBaseQty(outstanding - take, line.product.base_uom);

        allocation.push({
          batch_id: batch.id,
          batch_code: batch.batch_code,
          base_qty: take,
          unit_cost_cents: batch.cost_per_base_unit_cents,
        });

        costCents += Math.round(take * batch.cost_per_base_unit_cents);

        db.movements.unshift({
          id: newId(),
          master_batch_id: batch.id,
          product_id: batch.product_id,
          branch_id: batch.branch_id,
          movement_type: 'SALE',
          base_uom: line.product.base_uom,
          base_qty_delta: -take,
          balance_after: batch.remaining_base_qty,
          unit_cost_cents: batch.cost_per_base_unit_cents,
          order_id: orderId,
          performed_by: payload.staff_id ?? null,
          reason: `${orderNumber} · ${line.product.name} ${line.variant.label}`,
          metadata: {},
          created_at: now,
        });
      }

      if (outstanding > 1e-9) {
        // Cannot happen after the pre-check, but a torn write must not sell air.
        throw new LocalEngineError(
          `${line.product.name}: stock ran out mid-allocation. Nothing was charged.`,
        );
      }

      items.push({
        id: newId(),
        order_id: orderId,
        product_id: line.product.id,
        variant_id: line.variant.id,
        product_name: line.product.name,
        variant_label: line.variant.is_custom_amount
          ? `${line.baseQtyPerUnit}${line.product.base_uom === 'GRAMS' ? 'g' : line.product.base_uom === 'MILLILITERS' ? 'ml' : 'ea'} (scale)`
          : line.variant.label,
        base_uom: line.product.base_uom,
        base_qty: line.totalBaseQty,
        quantity: line.quantity,
        unit_price_cents: line.unitPriceCents,
        line_total_cents: line.lineTotalCents,
        cost_cents: 0,
        batch_allocation: allocation,
        created_at: now,
      });
    }

    // --- Loyalty accrual --------------------------------------------------
    const eligibleCents = Math.max(0, subtotalCents - discountCents);
    const categories = planned.map((line) => line.product.category);
    const bestMultiplier = categories.reduce((highest, category) => {
      const multiplier = rules.category_multipliers[category];
      return multiplier && multiplier > highest ? multiplier : highest;
    }, 1);
    const pointsEarned =
      member && member.status !== 'SUSPENDED'
        ? Math.floor(Math.floor((eligibleCents / 100) * rules.points_per_100_cents) * bestMultiplier)
        : 0;

    const order: OrderRow = {
      id: orderId,
      order_number: orderNumber,
      channel: payload.channel,
      status: settled ? 'PAID' : 'AWAITING_PAYMENT',
      fulfilment_type: payload.fulfilment_type,
      branch_id: payload.branch_id,
      member_id: member?.id ?? null,
      staff_id: payload.staff_id ?? null,
      subtotal_cents: subtotalCents,
      discount_cents: discountCents,
      delivery_fee_cents: deliveryFeeCents,
      total_cents: totalCents,
      cost_cents: costCents,
      points_earned: pointsEarned,
      points_redeemed: pointsRedeemed,
      delivery_zone_id: resolvedZone?.zone_id ?? null,
      delivery_address: payload.delivery?.address ?? null,
      delivery_suburb: payload.delivery?.suburb ?? null,
      delivery_lat: payload.delivery?.lat ?? null,
      delivery_lng: payload.delivery?.lng ?? null,
      delivery_distance_km: resolvedZone?.distance_km ?? null,
      delivery_instructions: payload.delivery?.instructions ?? null,
      driver_id: null,
      pickup_slot_start: payload.pickup_slot_start ?? null,
      pickup_slot_end: payload.pickup_slot_end ?? null,
      referral_code: payload.referral_code ?? null,
      notes: payload.notes ?? null,
      cancelled_reason: null,
      idempotency_key: payload.idempotency_key ?? null,
      created_at: now,
      updated_at: now,
      paid_at: settled ? now : null,
      completed_at:
        settled && payload.fulfilment_type === 'IN_STORE' ? now : null,
    };

    if (settled && payload.fulfilment_type === 'IN_STORE') order.status = 'COMPLETED';

    db.orders.unshift(order);
    db.orderItems.push(...items);

    // --- Payments ---------------------------------------------------------
    for (const tender of tenders) {
      const immediate = IMMEDIATE.has(tender.method);
      db.payments.unshift({
        id: newId(),
        order_id: orderId,
        method: tender.method,
        status: immediate ? 'CAPTURED' : 'PENDING',
        amount_cents: tender.amount_cents,
        tendered_cents: tender.tendered_cents ?? null,
        change_cents:
          tender.tendered_cents !== undefined
            ? Math.max(0, tender.tendered_cents - tender.amount_cents)
            : null,
        provider: tender.provider ?? 'in-house',
        provider_ref: tender.provider_ref ?? null,
        provider_payload: tender.provider_payload ?? {},
        captured_at: immediate ? now : null,
        failure_reason: null,
        created_by: payload.staff_id ?? null,
        created_at: now,
        updated_at: now,
      });
    }

    // --- Member side effects ---------------------------------------------
    if (member) {
      if (creditTender > 0) {
        member.credit_balance_cents -= creditTender;
        db.creditLedger.unshift({
          id: newId(),
          member_id: member.id,
          order_id: orderId,
          delta_cents: -creditTender,
          balance_after: member.credit_balance_cents,
          reason: `Order ${orderNumber}`,
          created_by: payload.staff_id ?? null,
          created_at: now,
        });
      }

      if (pointsRedeemed > 0) {
        member.points_balance -= pointsRedeemed;
        db.loyaltyLedger.unshift({
          id: newId(),
          member_id: member.id,
          order_id: orderId,
          points_delta: -pointsRedeemed,
          balance_after: member.points_balance,
          reason: `Redeemed against ${orderNumber}`,
          expires_at: null,
          created_by: payload.staff_id ?? null,
          created_at: now,
        });
      }

      if (pointsEarned > 0) {
        member.points_balance += pointsEarned;
        db.loyaltyLedger.unshift({
          id: newId(),
          member_id: member.id,
          order_id: orderId,
          points_delta: pointsEarned,
          balance_after: member.points_balance,
          reason: `Earned on ${orderNumber}`,
          expires_at: null,
          created_by: payload.staff_id ?? null,
          created_at: now,
        });
      }

      member.lifetime_value_cents += totalCents;
      member.order_count += 1;
      member.last_seen_at = now;
      member.rank = rankForLifetimeValue(rules, member.lifetime_value_cents);
      member.updated_at = now;
    }

    // --- Affiliate attribution -------------------------------------------
    const referral = payload.referral_code ?? member?.referred_by_code ?? null;
    if (referral) {
      const code = db.affiliateCodes.find(
        (candidate) => candidate.code === referral && candidate.is_active,
      );
      // A member never earns commission on their own order.
      if (code && code.owner_member_id && code.owner_member_id !== member?.id) {
        const commissionCents = Math.round((eligibleCents * code.commission_bps) / 10_000);
        code.order_count += 1;
        code.updated_at = now;
        db.attributions.unshift({
          id: newId(),
          affiliate_code_id: code.id,
          member_id: member?.id ?? null,
          order_id: orderId,
          commission_cents: commissionCents,
          landing_path: null,
          // Unpaid until settle_affiliate_commissions runs.
          paid_at: null,
          payout_reference: null,
          created_at: now,
        });
      }
    }

    return buildReceipt(db, order, false);
  });
}

function buildReceipt(db: LocalDb, order: OrderRow, replayed: boolean): ProcessOrderResult {
  const items = db.orderItems.filter((item) => item.order_id === order.id);
  const payments = db.payments.filter((payment) => payment.order_id === order.id);

  const capturedCents = payments
    .filter((payment) => payment.status === 'CAPTURED')
    .reduce((total, payment) => total + payment.amount_cents, 0);
  const pendingCents = payments
    .filter((payment) => payment.status === 'PENDING')
    .reduce((total, payment) => total + payment.amount_cents, 0);

  return {
    order_id: order.id,
    order_number: order.order_number,
    status: order.status,
    channel: order.channel,
    fulfilment_type: order.fulfilment_type,
    item_count: items.reduce((total, item) => total + item.quantity, 0),
    subtotal_cents: order.subtotal_cents,
    discount_cents: order.discount_cents,
    delivery_fee_cents: order.delivery_fee_cents,
    total_cents: order.total_cents,
    captured_cents: capturedCents,
    outstanding_cents: Math.max(0, order.total_cents - capturedCents),
    pending_cents: pendingCents,
    points_earned: order.points_earned,
    points_redeemed: order.points_redeemed,
    replayed,
    items: items.map((item) => ({
      product_name: item.product_name,
      variant_label: item.variant_label,
      base_uom: item.base_uom,
      base_qty: item.base_qty,
      quantity: item.quantity,
      unit_price_cents: item.unit_price_cents,
      line_total_cents: item.line_total_cents,
      batch_allocation: item.batch_allocation,
    })),
  };
}

// ---------------------------------------------------------------------------
// Loyalty rules & affiliate settlement
// ---------------------------------------------------------------------------

export function localSaveLoyaltyRules(patch: Partial<LoyaltyRulesRow>): LoyaltyRulesRow {
  return commit((db) => {
    db.loyaltyRules = { ...db.loyaltyRules, ...patch, updated_at: new Date().toISOString() };
    // Re-rank every member against the new thresholds.
    for (const member of db.members) {
      member.rank = rankForLifetimeValue(db.loyaltyRules, member.lifetime_value_cents);
    }
    return structuredCloneSafe(db.loyaltyRules);
  });
}

export function localSetAffiliateCommission(codeId: string, bps: number): AffiliateCodeRow {
  return commit((db) => {
    const code = db.affiliateCodes.find((candidate) => candidate.id === codeId);
    if (!code) throw new LocalEngineError('Unknown affiliate code.');
    code.commission_bps = Math.max(0, Math.min(10_000, Math.round(bps)));
    code.updated_at = new Date().toISOString();
    return structuredCloneSafe(code);
  });
}

/**
 * Settle a commission either as member store credit or as a recorded EFT
 * payout. Settled rows are removed from the outstanding ledger.
 */
export function localSettleCommission(
  attributionId: string,
  mode: 'CREDIT' | 'EFT',
): void {
  commit((db) => {
    const index = db.attributions.findIndex((candidate) => candidate.id === attributionId);
    if (index === -1) throw new LocalEngineError('Unknown commission row.');
    const attribution = db.attributions[index];
    if (!attribution) throw new LocalEngineError('Unknown commission row.');

    const code = db.affiliateCodes.find(
      (candidate) => candidate.id === attribution.affiliate_code_id,
    );
    const ownerId = code?.owner_member_id ?? null;

    if (mode === 'CREDIT' && ownerId) {
      const owner = db.members.find((candidate) => candidate.id === ownerId);
      if (owner) {
        owner.credit_balance_cents += attribution.commission_cents;
        db.creditLedger.unshift({
          id: newId(),
          member_id: owner.id,
          order_id: attribution.order_id,
          delta_cents: attribution.commission_cents,
          balance_after: owner.credit_balance_cents,
          reason: `Affiliate commission converted to credit (${code?.code ?? 'referral'})`,
          created_by: null,
          created_at: new Date().toISOString(),
        });
      }
    }

    db.attributions.splice(index, 1);
  });
}

// ---------------------------------------------------------------------------
// Higgsfield media jobs
// ---------------------------------------------------------------------------

export function localCreateMediaJob(input: {
  productId: string;
  prompt: string;
  kind: string;
  params: Record<string, string | number | boolean>;
}): ProductMediaJobRow {
  return commit((db) => {
    const now = new Date().toISOString();
    const job: ProductMediaJobRow = {
      id: newId(),
      product_id: input.productId,
      provider: 'higgsfield',
      provider_job_id: null,
      kind: input.kind,
      prompt: input.prompt,
      params: input.params,
      status: 'QUEUED',
      output_url: null,
      poster_url: null,
      duration_seconds: null,
      error_message: null,
      attempts: 1,
      requested_by: null,
      created_at: now,
      updated_at: now,
      completed_at: null,
    };
    db.mediaJobs.unshift(job);
    return structuredCloneSafe(job);
  });
}

export function localUpdateMediaJob(
  jobId: string,
  patch: Partial<ProductMediaJobRow>,
): ProductMediaJobRow {
  return commit((db) => {
    const job = db.mediaJobs.find((candidate) => candidate.id === jobId);
    if (!job) throw new LocalEngineError('Unknown media job.');
    Object.assign(job, patch, { updated_at: new Date().toISOString() });

    // A completed reel becomes the product's hero media.
    if (patch.status === 'COMPLETED' && patch.output_url) {
      const product = db.products.find((candidate) => candidate.id === job.product_id);
      if (product) {
        product.hero_media_url = patch.output_url;
        product.gallery = [
          { url: patch.output_url, type: 'video', source: 'HIGGSFIELD' },
          ...product.gallery.filter((entry) => entry.url !== patch.output_url),
        ];
      }
    }

    return structuredCloneSafe(job);
  });
}
