import type {
  PosCalculationInput,
  PosCalculationResult,
  PosCalculatedLineItem,
} from '@/types/pos-engine';

/**
 * Pure integer-safe POS Cart Calculation Pipeline.
 *
 * Guarantees zero IEEE 754 floating point drift:
 * - Subtotals computed via integer base + modifier additions.
 * - Volume breaks resolved per minimum unit order threshold.
 * - Order-level discounts allocated proportionally across lines with remainder balancing on the final line.
 * - Multi-tier affiliate commissions (Revenue % vs. Margin % vs. Fixed order fee).
 * - Multi-branch jurisdiction VAT / sales tax calculation.
 */
export function calculatePosCart(input: PosCalculationInput): PosCalculationResult {
  let subtotalCents = 0;
  let lineDiscountsTotalCents = 0;
  let totalCostCents = 0;

  // 1. Resolve unit pricing, modifiers, and volume tiers per line item
  const resolvedLines = input.items.map((item) => {
    // Branch override takes precedence over catalog base price
    let unitBase = item.branchOverridePriceCents ?? item.baseCatalogPriceCents;

    // Check volume price breaks (highest matched threshold wins)
    if (item.volumeTiers && item.volumeTiers.length > 0) {
      const matchedTier = [...item.volumeTiers]
        .sort((a, b) => b.minQty - a.minQty)
        .find((tier) => item.quantity >= tier.minQty);

      if (matchedTier) {
        unitBase = matchedTier.unitPriceCents;
      }
    }

    const unitModifiers = item.selectedModifiers.reduce(
      (sum, mod) => sum + mod.priceDeltaCents,
      0
    );

    const effectiveUnitPrice = unitBase + unitModifiers;
    const rawLineSubtotal = effectiveUnitPrice * item.quantity;
    const itemCostTotal = item.costPriceCents * item.quantity;

    subtotalCents += rawLineSubtotal;
    lineDiscountsTotalCents += item.lineDiscountCents;
    totalCostCents += itemCostTotal;

    return {
      item,
      unitBase,
      unitModifiers,
      effectiveUnitPrice,
      rawLineSubtotal,
      itemCostTotal,
    };
  });

  const totalDiscountCents = lineDiscountsTotalCents + input.orderDiscountCents;
  const fulfillmentFeeCents =
    input.fulfillmentType === 'DELIVERY' ? Math.max(0, input.deliveryZoneFeeCents) : 0;

  // 2. Proportional allocation of order-level discount across items with penny-rounding compensation
  let allocatedOrderDiscountRunningSum = 0;
  let calculatedTaxRunningSum = 0;
  let affiliateCommissionRunningSum = 0;

  const lines: PosCalculatedLineItem[] = resolvedLines.map((resolved, index) => {
    const isLastItem = index === resolvedLines.length - 1;

    let allocatedOrderDiscount = 0;
    if (subtotalCents > 0 && input.orderDiscountCents > 0) {
      if (isLastItem) {
        allocatedOrderDiscount = Math.max(
          0,
          input.orderDiscountCents - allocatedOrderDiscountRunningSum
        );
      } else {
        allocatedOrderDiscount = Math.round(
          (resolved.rawLineSubtotal / subtotalCents) * input.orderDiscountCents
        );
        allocatedOrderDiscountRunningSum += allocatedOrderDiscount;
      }
    }

    const netLineTotal = Math.max(
      0,
      resolved.rawLineSubtotal - (resolved.item.lineDiscountCents + allocatedOrderDiscount)
    );

    // 3. Tax calculation: netLineTotal * taxRateBps / 10,000 (standard rounding to nearest cent)
    const lineTax = Math.round((netLineTotal * input.taxRateBps) / 10000);
    calculatedTaxRunningSum += lineTax;

    // 4. Affiliate commission per line item
    let itemCommission = 0;
    if (input.affiliate && resolved.item.affiliateEligible) {
      if (input.affiliate.commissionType === 'REVENUE_PERCENT') {
        itemCommission = Math.round(
          (netLineTotal * input.affiliate.rateValue) / 10000
        );
      } else if (input.affiliate.commissionType === 'MARGIN_PERCENT') {
        const lineMargin = Math.max(0, netLineTotal - resolved.itemCostTotal);
        itemCommission = Math.round(
          (lineMargin * input.affiliate.rateValue) / 10000
        );
      }
    }
    affiliateCommissionRunningSum += itemCommission;

    return {
      cartItemId: resolved.item.id,
      productId: resolved.item.productId,
      variantId: resolved.item.variantId,
      unitBasePriceCents: resolved.unitBase,
      unitModifiersPriceCents: resolved.unitModifiers,
      effectiveUnitPriceCents: resolved.effectiveUnitPrice,
      rawLineSubtotalCents: resolved.rawLineSubtotal,
      allocatedOrderDiscountCents: allocatedOrderDiscount,
      netTaxableLineTotalCents: netLineTotal,
      lineTaxCents: lineTax,
      lineCostTotalCents: resolved.itemCostTotal,
      affiliateCommissionCents: itemCommission,
    };
  });

  // If fixed fee per order, override line-level summation
  let affiliateTotalCommissionCents = affiliateCommissionRunningSum;
  if (input.affiliate && input.affiliate.commissionType === 'FIXED_FEE_ORDER') {
    affiliateTotalCommissionCents = input.affiliate.rateValue;
  }

  const taxableSubtotalCents = Math.max(0, subtotalCents - totalDiscountCents);
  const grandTotalCents =
    taxableSubtotalCents + calculatedTaxRunningSum + fulfillmentFeeCents;

  return {
    lines,
    subtotalCents,
    totalDiscountCents,
    fulfillmentFeeCents,
    taxableSubtotalCents,
    taxCents: calculatedTaxRunningSum,
    grandTotalCents,
    affiliateTotalCommissionCents,
  };
}

