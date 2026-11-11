/**
 * 420 CARTEL :: Supabase schema types
 *
 * Hand-maintained to mirror supabase/migrations/*.sql exactly.
 * Regenerate with `npm run db:types` once the project is linked; the shape
 * below is the contract the app compiles against in the meantime.
 */

export type BaseUom = 'GRAMS' | 'MILLILITERS' | 'UNITS';
export type MemberStatus = 'PENDING_KYC' | 'ACTIVE_MEMBER' | 'VIP' | 'SUSPENDED';
export type MemberRank = 'INITIATE' | 'SOLDIER' | 'CAPO' | 'CONSIGLIERE';
export type IdDocumentType = 'SA_ID' | 'PASSPORT';
export type KycDocumentType =
  | 'ID_FRONT'
  | 'ID_BACK'
  | 'PASSPORT_PAGE'
  | 'LIVE_SELFIE'
  | 'PROOF_OF_ADDRESS'
  | 'SIGNED_AGREEMENT';
export type KycReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type ProductCategory =
  | 'FLOWER'
  | 'HASH_EXTRACT'
  | 'ELIXIR_OIL'
  | 'DISTILLATE'
  | 'PRE_ROLL'
  | 'EDIBLE'
  | 'VAPE'
  | 'MERCH'
  | 'ACCESSORY';
export type StrainType = 'INDICA' | 'SATIVA' | 'HYBRID' | 'CBD' | 'NOT_APPLICABLE';
export type StaffRole = 'OWNER' | 'MANAGER' | 'BUDTENDER' | 'DRIVER';
export type OrderChannel = 'POS' | 'ONLINE';
export type FulfilmentType = 'IN_STORE' | 'PICKUP' | 'DELIVERY';
export type OrderStatus =
  | 'DRAFT'
  | 'AWAITING_PAYMENT'
  | 'PAID'
  | 'PREPARING'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUNDED';
export type PaymentMethod =
  | 'CASH'
  | 'CARD_TERMINAL'
  | 'EFT_INSTANT'
  | 'MANUAL_EFT'
  | 'MEMBER_CREDIT'
  | 'PAY_ON_COLLECTION'
  | 'FUTURE_GATEWAY';
export type PaymentStatus = 'PENDING' | 'AUTHORIZED' | 'CAPTURED' | 'FAILED' | 'REFUNDED';
export type StockMovementType =
  | 'INTAKE'
  | 'SALE'
  | 'RETURN'
  | 'WASTE'
  | 'SPILLAGE'
  | 'ADJUSTMENT'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN';
export type MediaJobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

/** FIFO batch allocation recorded on every sold line. */
export interface BatchAllocationEntry {
  batch_id: string;
  batch_code: string;
  base_qty: number;
  unit_cost_cents?: number;
}

export interface GalleryEntry {
  url: string;
  type: 'image' | 'video';
  poster_url?: string;
  caption?: string;
  source?: 'UPLOAD' | 'HIGGSFIELD';
}

export interface BranchRow {
  id: string;
  name: string;
  slug: string;
  address_line: string;
  suburb: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  latitude: number;
  longitude: number;
  phone: string | null;
  is_active: boolean;
  timezone: string;
  pickup_slot_minutes: number;
  opens_at: string;
  closes_at: string;
  delivery_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface StaffProfileRow {
  id: string;
  branch_id: string | null;
  role: StaffRole;
  display_name: string;
  pos_pin_hash: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MemberRow {
  id: string;
  member_code: string;
  qr_token: string;
  status: MemberStatus;
  rank: MemberRank;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  id_document_type: IdDocumentType;
  sa_id_number: string | null;
  passport_number: string | null;
  passport_country: string | null;
  date_of_birth: string;
  nationality: string | null;
  gender: string | null;
  age_verified_at: string | null;
  kyc_submitted_at: string | null;
  kyc_approved_at: string | null;
  kyc_approved_by: string | null;
  agreement_signed_at: string | null;
  agreement_version: string | null;
  agreement_signature_path: string | null;
  preferred_uom: BaseUom;
  marketing_opt_in: boolean;
  home_branch_id: string | null;
  lifetime_value_cents: number;
  order_count: number;
  credit_balance_cents: number;
  points_balance: number;
  referral_code: string;
  referred_by_code: string | null;
  suspended_reason: string | null;
  internal_notes: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface KycDocumentRow {
  id: string;
  member_id: string;
  doc_type: KycDocumentType;
  storage_path: string;
  mime_type: string | null;
  byte_size: number | null;
  review_status: KycReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export interface ProductRow {
  id: string;
  sku: string;
  name: string;
  slug: string;
  category: ProductCategory;
  base_uom: BaseUom;
  strain: StrainType;
  short_tagline: string | null;
  description: string | null;
  brand: string | null;
  thc_pct: number | null;
  cbd_pct: number | null;
  terpene_tags: string[];
  extraction_purity_pct: number | null;
  is_active: boolean;
  is_member_only: boolean;
  is_featured: boolean;
  sort_order: number;
  hero_media_url: string | null;
  gallery: GalleryEntry[];
  model_glb_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductVariantRow {
  id: string;
  product_id: string;
  label: string;
  base_quantity: number;
  price_cents: number;
  compare_at_cents: number | null;
  barcode: string | null;
  is_active: boolean;
  is_custom_amount: boolean;
  pos_quick_key: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface MasterBatchRow {
  id: string;
  product_id: string;
  branch_id: string;
  batch_code: string;
  harvest_date: string | null;
  production_date: string | null;
  expiry_date: string | null;
  lab_thc_pct: number | null;
  lab_cbd_pct: number | null;
  lab_report_url: string | null;
  terpene_profile: Record<string, number>;
  cost_per_base_unit_cents: number;
  received_base_qty: number;
  remaining_base_qty: number;
  reserved_base_qty: number;
  low_stock_threshold: number;
  is_active: boolean;
  received_at: string;
  created_by: string | null;
  /** Higgsfield MCP job that produced this batch's promo reel. */
  higgsfield_job_id: string | null;
  higgsfield_promo_video_url: string | null;
  higgsfield_poster_url: string | null;
  higgsfield_generated_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Member-safe realtime projection of `master_batches`, written by trigger.
 * The storefront reads and subscribes to this; it never touches the batch
 * table, which is staff-only because it carries cost prices.
 */
export interface ProductStockBoardRow {
  product_id: string;
  branch_id: string;
  base_uom: BaseUom;
  remaining_base_qty: number;
  reserved_base_qty: number;
  available_base_qty: number;
  open_batch_count: number;
  low_stock_threshold: number;
  is_low_stock: boolean;
  featured_batch_id: string | null;
  featured_batch_code: string | null;
  lab_thc_pct: number | null;
  lab_cbd_pct: number | null;
  terpene_profile: Record<string, number>;
  expiry_date: string | null;
  promo_video_url: string | null;
  promo_poster_url: string | null;
  updated_at: string;
}

/** Row shape of the `inventory_ledger` view. */
export interface InventoryLedgerRow {
  id: string;
  created_at: string;
  movement_type: StockMovementType;
  base_uom: BaseUom;
  base_qty_delta: number;
  balance_after: number;
  unit_cost_cents: number;
  reason: string | null;
  metadata: Json;
  order_id: string | null;
  order_number: string | null;
  master_batch_id: string;
  batch_code: string;
  product_id: string;
  product_name: string;
  sku: string;
  branch_id: string;
  branch_name: string;
  performed_by: string | null;
  performed_by_name: string | null;
}

export interface ProductStockLevelRow {
  product_id: string;
  sku: string;
  name: string;
  category: ProductCategory;
  base_uom: BaseUom;
  branch_id: string;
  remaining_base_qty: number;
  reserved_base_qty: number;
  available_base_qty: number;
  low_stock_threshold: number;
  is_low_stock: boolean;
  open_batch_count: number;
}

export interface StockMovementRow {
  id: string;
  master_batch_id: string;
  product_id: string;
  branch_id: string;
  movement_type: StockMovementType;
  base_uom: BaseUom;
  base_qty_delta: number;
  balance_after: number;
  unit_cost_cents: number;
  order_id: string | null;
  performed_by: string | null;
  reason: string | null;
  metadata: Json;
  created_at: string;
}

export interface DeliveryZoneRow {
  id: string;
  branch_id: string;
  name: string;
  polygon: [number, number][] | null;
  max_radius_km: number | null;
  fee_cents: number;
  min_order_cents: number;
  free_over_cents: number | null;
  eta_minutes: number;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrderRow {
  id: string;
  order_number: string;
  channel: OrderChannel;
  status: OrderStatus;
  fulfilment_type: FulfilmentType;
  branch_id: string;
  member_id: string | null;
  staff_id: string | null;
  subtotal_cents: number;
  discount_cents: number;
  delivery_fee_cents: number;
  total_cents: number;
  cost_cents: number;
  points_earned: number;
  points_redeemed: number;
  delivery_zone_id: string | null;
  delivery_address: string | null;
  delivery_suburb: string | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
  delivery_distance_km: number | null;
  delivery_instructions: string | null;
  driver_id: string | null;
  pickup_slot_start: string | null;
  pickup_slot_end: string | null;
  referral_code: string | null;
  notes: string | null;
  cancelled_reason: string | null;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
  completed_at: string | null;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string;
  variant_id: string | null;
  product_name: string;
  variant_label: string;
  base_uom: BaseUom;
  base_qty: number;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  cost_cents: number;
  batch_allocation: BatchAllocationEntry[];
  created_at: string;
}

export interface PaymentRow {
  id: string;
  order_id: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount_cents: number;
  tendered_cents: number | null;
  change_cents: number | null;
  provider: string;
  provider_ref: string | null;
  provider_payload: Json;
  captured_at: string | null;
  failure_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemberCreditLedgerRow {
  id: string;
  member_id: string;
  order_id: string | null;
  delta_cents: number;
  balance_after: number;
  reason: string;
  created_by: string | null;
  created_at: string;
}

export interface LoyaltyRulesRow {
  id: string;
  name: string;
  is_active: boolean;
  points_per_100_cents: number;
  point_value_cents: number;
  min_redeem_points: number;
  rank_thresholds: Record<MemberRank, number>;
  category_multipliers: Partial<Record<ProductCategory, number>>;
  /** Commission applied to new affiliate codes, in basis points. 500 = 5%. */
  default_commission_bps: number;
  /** Lifetime of the `?ref=` attribution cookie, in days. */
  referral_window_days: number;
  signup_bonus_points: number;
  referrer_bonus_points: number;
  /** member_rank -> the street name shown on badges. Tunable wording. */
  rank_labels: Record<MemberRank, string>;
  created_at: string;
  updated_at: string;
}

export interface LoyaltyLedgerRow {
  id: string;
  member_id: string;
  order_id: string | null;
  points_delta: number;
  balance_after: number;
  reason: string;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface AffiliateCodeRow {
  id: string;
  code: string;
  owner_member_id: string | null;
  label: string | null;
  commission_bps: number;
  click_count: number;
  signup_count: number;
  order_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AffiliateAttributionRow {
  id: string;
  affiliate_code_id: string;
  member_id: string | null;
  order_id: string | null;
  commission_cents: number;
  landing_path: string | null;
  /** Set when the commission has been paid out as member credit. */
  paid_at: string | null;
  payout_reference: string | null;
  created_at: string;
}

/** Shape returned by `settle_affiliate_commissions`. */
export interface AffiliatePayoutResult {
  affiliate_code: string;
  settled_cents: number;
  attribution_count: number;
  credit_balance_cents: number;
  payout_reference: string | null;
}

export interface ProductMediaJobRow {
  id: string;
  product_id: string;
  provider: string;
  provider_job_id: string | null;
  kind: string;
  prompt: string;
  params: Json;
  status: MediaJobStatus;
  output_url: string | null;
  poster_url: string | null;
  duration_seconds: number | null;
  error_message: string | null;
  attempts: number;
  requested_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface AuditLogRow {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before_data: Json | null;
  after_data: Json | null;
  ip_address: string | null;
  created_at: string;
}

/** Shape returned by `resolve_delivery_zone`. */
export interface ResolvedDeliveryZone {
  zone_id: string;
  zone_name: string;
  fee_cents: number;
  min_order_cents: number;
  free_over_cents: number | null;
  eta_minutes: number;
  distance_km: number;
  matched_by: 'POLYGON' | 'RADIUS';
}

/** Shape returned by `lookup_member_for_pos`. */
export interface PosMemberLookupRow {
  member_id: string;
  member_code: string;
  full_name: string;
  status: MemberStatus;
  rank: MemberRank;
  age_verified: boolean;
  date_of_birth: string;
  age_years: number;
  preferred_uom: BaseUom;
  credit_balance_cents: number;
  points_balance: number;
  lifetime_value_cents: number;
  order_count: number;
  last_order_at: string | null;
}

/** Payload accepted by `process_cartel_order`. */
export interface ProcessOrderItemInput {
  variant_id: string;
  quantity: number;
  /** Required for `is_custom_amount` tiers (Custom g / Custom ml). */
  base_qty_override?: number;
}

export interface ProcessOrderPaymentInput {
  method: PaymentMethod;
  amount_cents: number;
  tendered_cents?: number;
  provider?: string;
  provider_ref?: string;
  provider_payload?: Json;
}

export interface ProcessOrderPayload {
  channel: OrderChannel;
  fulfilment_type: FulfilmentType;
  branch_id: string;
  member_id?: string | null;
  staff_id?: string | null;
  items: ProcessOrderItemInput[];
  payments?: ProcessOrderPaymentInput[];
  delivery?: {
    address: string;
    suburb?: string;
    lat: number;
    lng: number;
    instructions?: string;
  };
  pickup_slot_start?: string;
  pickup_slot_end?: string;
  discount_cents?: number;
  points_redeemed?: number;
  referral_code?: string | null;
  notes?: string;
  idempotency_key?: string;
  ignore_reservations?: boolean;
}

/** Receipt payload returned by `process_cartel_order`. */
export interface ProcessOrderResult {
  order_id: string;
  order_number: string;
  status: OrderStatus;
  channel: OrderChannel;
  fulfilment_type: FulfilmentType;
  item_count: number;
  subtotal_cents: number;
  discount_cents: number;
  delivery_fee_cents: number;
  total_cents: number;
  captured_cents: number;
  outstanding_cents: number;
  pending_cents: number;
  points_earned: number;
  points_redeemed: number;
  replayed: boolean;
  items: {
    product_name: string;
    variant_label: string;
    base_uom: BaseUom;
    base_qty: number;
    quantity: number;
    unit_price_cents: number;
    line_total_cents: number;
    batch_allocation: BatchAllocationEntry[];
  }[];
}

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      branches: Table<BranchRow>;
      staff_profiles: Table<StaffProfileRow>;
      members: Table<MemberRow>;
      kyc_documents: Table<
        KycDocumentRow,
        Pick<KycDocumentRow, 'member_id' | 'doc_type' | 'storage_path'> &
          Partial<KycDocumentRow>
      >;
      products: Table<ProductRow>;
      product_variants: Table<ProductVariantRow>;
      master_batches: Table<MasterBatchRow>;
      /** Trigger-maintained. Readable by everyone, writable by nobody. */
      product_stock_board: Table<ProductStockBoardRow, never, never>;
      stock_movements: Table<StockMovementRow>;
      delivery_zones: Table<DeliveryZoneRow>;
      orders: Table<OrderRow>;
      order_items: Table<OrderItemRow>;
      payments: Table<PaymentRow>;
      member_credit_ledger: Table<MemberCreditLedgerRow>;
      loyalty_rules: Table<LoyaltyRulesRow>;
      loyalty_ledger: Table<LoyaltyLedgerRow>;
      affiliate_codes: Table<AffiliateCodeRow>;
      affiliate_attributions: Table<AffiliateAttributionRow>;
      product_media_jobs: Table<ProductMediaJobRow>;
      audit_logs: Table<AuditLogRow>;
    };
    Views: {
      product_stock_levels: { Row: ProductStockLevelRow; Relationships: [] };
      inventory_ledger: { Row: InventoryLedgerRow; Relationships: [] };
    };
    Functions: {
      process_cartel_order: {
        Args: { p_payload: ProcessOrderPayload };
        Returns: ProcessOrderResult;
      };
      cancel_cartel_order: {
        Args: { p_order_id: string; p_reason: string; p_restock?: boolean };
        Returns: OrderRow;
      };
      submit_member_kyc: {
        Args: { p_payload: Record<string, Json> };
        Returns: MemberRow;
      };
      sign_membership_agreement: {
        Args: { p_version: string; p_signature_path: string };
        Returns: MemberRow;
      };
      review_member_kyc: {
        Args: { p_member_id: string; p_approve: boolean; p_reason?: string };
        Returns: MemberRow;
      };
      lookup_member_for_pos: {
        Args: { p_query: string };
        Returns: PosMemberLookupRow[];
      };
      rotate_member_qr_token: { Args: Record<string, never>; Returns: string };
      adjust_batch_stock: {
        Args: {
          p_batch_id: string;
          p_movement_type: StockMovementType;
          p_base_qty: number;
          p_reason?: string;
          p_metadata?: Json;
        };
        Returns: MasterBatchRow;
      };
      adjust_member_credit: {
        Args: { p_member_id: string; p_delta_cents: number; p_reason: string };
        Returns: number;
      };
      reserve_product_stock: {
        Args: { p_product_id: string; p_branch_id: string; p_base_qty: number };
        Returns: { reserved: number; allocation: BatchAllocationEntry[] };
      };
      release_product_reservation: {
        Args: { p_allocation: BatchAllocationEntry[] };
        Returns: undefined;
      };
      resolve_delivery_zone: {
        Args: { p_branch_id: string; p_lat: number; p_lng: number };
        Returns: ResolvedDeliveryZone[];
      };
      settle_affiliate_commissions: {
        Args: { p_affiliate_code_id: string; p_reference?: string | null };
        Returns: AffiliatePayoutResult;
      };
      refresh_product_stock_board: {
        Args: { p_product_id: string; p_branch_id: string };
        Returns: undefined;
      };
      sa_id_luhn_valid: { Args: { p_id: string }; Returns: boolean };
      sa_id_to_dob: { Args: { p_id: string }; Returns: string | null };
      is_of_legal_age: { Args: { p_dob: string }; Returns: boolean };
      /** Counter PIN. Resolves the operator from auth.uid(), never from an argument. */
      verify_pos_pin: { Args: { p_pin: string }; Returns: boolean };
      has_pos_pin: { Args: Record<string, never>; Returns: boolean };
      set_pos_pin: { Args: { p_staff_id: string; p_pin: string }; Returns: undefined };
    };
    Enums: {
      base_uom: BaseUom;
      member_status: MemberStatus;
      member_rank: MemberRank;
      id_document_type: IdDocumentType;
      kyc_document_type: KycDocumentType;
      kyc_review_status: KycReviewStatus;
      product_category: ProductCategory;
      strain_type: StrainType;
      staff_role: StaffRole;
      order_channel: OrderChannel;
      fulfilment_type: FulfilmentType;
      order_status: OrderStatus;
      payment_method: PaymentMethod;
      payment_status: PaymentStatus;
      stock_movement_type: StockMovementType;
      media_job_status: MediaJobStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
