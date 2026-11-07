/**
 * Unit-of-measure engine.
 *
 * Every product holds one balance in its `base_uom`. Sellable tiers declare how
 * much of that balance they consume (`base_quantity`), so a 3.5g flower tier, a
 * 30ml elixir and a single pre-roll all deduct through one code path.
 */

import type { BaseUom, ProductCategory } from '@/types/database';

export const UOM_SYMBOL: Record<BaseUom, string> = {
  GRAMS: 'g',
  MILLILITERS: 'ml',
  UNITS: 'ea',
};

export const UOM_LABEL: Record<BaseUom, string> = {
  GRAMS: 'Grams',
  MILLILITERS: 'Millilitres',
  UNITS: 'Units',
};

export const UOM_NOUN: Record<BaseUom, string> = {
  GRAMS: 'weight',
  MILLILITERS: 'volume',
  UNITS: 'quantity',
};

/** Decimal places a base_uom balance is tracked and displayed at. */
export const UOM_PRECISION: Record<BaseUom, number> = {
  GRAMS: 2,
  MILLILITERS: 1,
  UNITS: 0,
};

/** Which base unit each catalogue category is stocked in. */
export const CATEGORY_UOM: Record<ProductCategory, BaseUom> = {
  FLOWER: 'GRAMS',
  HASH_EXTRACT: 'GRAMS',
  ELIXIR_OIL: 'MILLILITERS',
  DISTILLATE: 'MILLILITERS',
  PRE_ROLL: 'UNITS',
  EDIBLE: 'UNITS',
  VAPE: 'UNITS',
  MERCH: 'UNITS',
  ACCESSORY: 'UNITS',
};

export const CATEGORY_LABEL: Record<ProductCategory, string> = {
  FLOWER: 'Flower',
  HASH_EXTRACT: 'Hash & Extract',
  ELIXIR_OIL: 'Elixirs & Oils',
  DISTILLATE: 'Distillate',
  PRE_ROLL: 'Pre-Rolls',
  EDIBLE: 'Edibles',
  VAPE: 'Vapes',
  MERCH: 'Merch',
  ACCESSORY: 'Accessories',
};

/** POS category tabs, labelled with the unit the cashier will be entering. */
export const POS_CATEGORY_TABS: {
  category: ProductCategory;
  label: string;
  uom: BaseUom;
}[] = [
  { category: 'FLOWER', label: 'Flower', uom: 'GRAMS' },
  { category: 'HASH_EXTRACT', label: 'Hash & Extract', uom: 'GRAMS' },
  { category: 'ELIXIR_OIL', label: 'Elixirs & Oils', uom: 'MILLILITERS' },
  { category: 'DISTILLATE', label: 'Distillate', uom: 'MILLILITERS' },
  { category: 'PRE_ROLL', label: 'Pre-Rolls', uom: 'UNITS' },
  { category: 'EDIBLE', label: 'Edibles', uom: 'UNITS' },
  { category: 'VAPE', label: 'Vapes', uom: 'UNITS' },
  { category: 'MERCH', label: 'Merch', uom: 'UNITS' },
  { category: 'ACCESSORY', label: 'Accessories', uom: 'UNITS' },
];

/** Default tier ladders offered when creating a product of each base unit. */
export const DEFAULT_TIERS: Record<BaseUom, number[]> = {
  GRAMS: [1, 3.5, 5, 7, 14, 28],
  MILLILITERS: [5, 10, 30, 50],
  UNITS: [1, 3, 5, 10],
};

/** Format a base quantity with its symbol: 3.5 g, 30 ml, 2 ea. */
export function formatBaseQty(qty: number, uom: BaseUom): string {
  const precision = UOM_PRECISION[uom];
  const rounded = Number(qty.toFixed(precision));
  // Trim a trailing .0 / .00 so 3.50 g reads as 3.5 g.
  const text = Number.isInteger(rounded) ? String(rounded) : String(rounded);
  return `${text} ${UOM_SYMBOL[uom]}`;
}

/** Tier label as it appears on buttons and receipts. */
export function tierLabel(qty: number, uom: BaseUom): string {
  if (uom === 'UNITS') {
    return qty === 1 ? 'Single' : `${qty}-Pack`;
  }
  return `${Number(qty.toFixed(UOM_PRECISION[uom]))}${UOM_SYMBOL[uom]}`;
}

/** Round a base quantity to the precision its unit is tracked at. */
export function roundBaseQty(qty: number, uom: BaseUom): number {
  const factor = 10 ** UOM_PRECISION[uom];
  return Math.round(qty * factor) / factor;
}

/**
 * Validate a cashier-entered custom amount.
 * UNITS must be whole; grams and millilitres must clear the tier minimum.
 */
export function validateCustomAmount(
  amount: number,
  uom: BaseUom,
  minimum: number,
): { ok: true; value: number } | { ok: false; error: string } {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: `Enter a ${UOM_NOUN[uom]} greater than zero.` };
  }
  if (uom === 'UNITS' && !Number.isInteger(amount)) {
    return { ok: false, error: 'Units are sold whole — no fractions.' };
  }
  if (amount < minimum) {
    return {
      ok: false,
      error: `Minimum is ${formatBaseQty(minimum, uom)}.`,
    };
  }
  return { ok: true, value: roundBaseQty(amount, uom) };
}

/** Per-base-unit price, used for custom tiers and margin reporting. */
export function pricePerBaseUnitCents(priceCents: number, baseQty: number): number {
  if (baseQty <= 0) return 0;
  return Math.round(priceCents / baseQty);
}

/** How many of a tier the on-hand balance can still fill. */
export function tiersAvailable(availableBaseQty: number, tierBaseQty: number): number {
  if (tierBaseQty <= 0) return 0;
  return Math.floor(availableBaseQty / tierBaseQty);
}

export function isLowStock(availableBaseQty: number, threshold: number): boolean {
  return availableBaseQty <= threshold;
}

/** Human stock summary: "428.50 g on hand · 122 × 3.5g". */
export function stockSummary(
  availableBaseQty: number,
  uom: BaseUom,
  referenceTier?: number,
): string {
  const head = `${availableBaseQty.toFixed(UOM_PRECISION[uom])} ${UOM_SYMBOL[uom]} on hand`;
  if (!referenceTier || uom === 'UNITS') return head;
  return `${head} · ${tiersAvailable(availableBaseQty, referenceTier)} × ${tierLabel(referenceTier, uom)}`;
}
