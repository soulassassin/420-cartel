/**
 * Enterprise POS Core Types
 * Float-safe monetary units (integer cents), basis points, dynamic calculations,
 * multi-tier affiliate attributions, and real-time inventory hold models.
 */

export type PosFulfillmentType = 'IN_STORE' | 'PICKUP' | 'DELIVERY';

export type PosCommissionType = 'FIXED_FEE_ORDER' | 'MARGIN_PERCENT' | 'REVENUE_PERCENT';

export interface PosModifierOption {
  id: string;
  groupName: string;
  name: string;
  priceDeltaCents: number;
}

export interface PosVolumeTier {
  minQty: number;
  unitPriceCents: number;
}

export interface PosCartLineItem {
  id: string; // Unique ticket line identifier
  productId: string;
  variantId: string;
  sku?: string;
  productName: string;
  variantLabel: string;
  quantity: number;
  baseCatalogPriceCents: number;
  branchOverridePriceCents?: number;
  costPriceCents: number;
  volumeTiers?: PosVolumeTier[];
  selectedModifiers: PosModifierOption[];
  lineDiscountCents: number;
  affiliateEligible: boolean;
}

export interface PosAffiliateContext {
  id: string;
  code: string;
  partnerName: string;
  commissionType: PosCommissionType;
  /**
   * Cents if commissionType is FIXED_FEE_ORDER;
   * Basis points (e.g., 500 = 5.00%, 1000 = 10.00%) if percentage-based.
   */
  rateValue: number;
}

export interface PosCalculationInput {
  branchId: string;
  taxRateBps: number; // e.g. 1500 for South African 15% VAT, 825 for 8.25%
  fulfillmentType: PosFulfillmentType;
  deliveryZoneFeeCents: number;
  orderDiscountCents: number;
  affiliate?: PosAffiliateContext | null;
  items: PosCartLineItem[];
}

export interface PosCalculatedLineItem {
  cartItemId: string;
  productId: string;
  variantId: string;
  unitBasePriceCents: number;
  unitModifiersPriceCents: number;
  effectiveUnitPriceCents: number;
  rawLineSubtotalCents: number;
  allocatedOrderDiscountCents: number;
  netTaxableLineTotalCents: number;
  lineTaxCents: number;
  lineCostTotalCents: number;
  affiliateCommissionCents: number;
}

export interface PosCalculationResult {
  lines: PosCalculatedLineItem[];
  subtotalCents: number;
  totalDiscountCents: number;
  fulfillmentFeeCents: number;
  taxableSubtotalCents: number;
  taxCents: number;
  grandTotalCents: number;
  affiliateTotalCommissionCents: number;
}

export interface InventoryReservationRequest {
  cartSessionId: string;
  branchId: string;
  productId: string;
  quantity: number;
  holdDurationMinutes?: number;
}

export interface InventoryReservationResult {
  success: boolean;
  reservationId?: string;
  expiresAt?: string;
  error?: string;
}

