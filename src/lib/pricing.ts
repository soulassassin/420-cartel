/**
 * Member pricing.
 *
 * `product_variants.price_cents` is the standard member price. VIP standing
 * earns a flat discount off every tier, and that discount is the single knob —
 * no per-variant VIP column to keep in sync, so a price change can never leave
 * a stale VIP price behind it.
 *
 * Custom (scale) tiers price per base unit, so their `price_cents` is a rate
 * and must be multiplied by the weight or volume before display.
 */

import type { MemberRow, ProductVariantRow } from '@/types/database';

/** VIP discount in basis points: 1000 = 10% off. */
export const VIP_DISCOUNT_BPS = 1_000;

export function isVipStanding(member: MemberRow | null): boolean {
  return member?.status === 'VIP';
}

/** The price this member pays for one of this tier. */
export function tierPriceCents(
  variant: ProductVariantRow,
  member: MemberRow | null,
): number {
  const base = variant.price_cents;
  if (!isVipStanding(member)) return base;
  return Math.round((base * (10_000 - VIP_DISCOUNT_BPS)) / 10_000);
}

/** The VIP price, regardless of who is looking — for the "VIP" strikethrough. */
export function vipPriceCents(variant: ProductVariantRow): number {
  return Math.round((variant.price_cents * (10_000 - VIP_DISCOUNT_BPS)) / 10_000);
}

/** Price for an exact weight or volume off a custom tier. */
export function customAmountPriceCents(
  variant: ProductVariantRow,
  baseQty: number,
  member: MemberRow | null,
): number {
  return Math.round(tierPriceCents(variant, member) * baseQty);
}

/**
 * The weight or volume a target Rand amount buys off a custom tier.
 * Used by the POS "ring me R400 of this" flow.
 */
export function baseQtyForTargetCents(
  variant: ProductVariantRow,
  targetCents: number,
  member: MemberRow | null,
): number {
  const rate = tierPriceCents(variant, member);
  if (rate <= 0) return 0;
  return Math.round((targetCents / rate) * 1000) / 1000;
}

export const VAT_RATE_BPS = 1_500; // 15% South African VAT

/** VAT already contained in a VAT-inclusive total. */
export function vatPortionCents(inclusiveCents: number): number {
  return Math.round((inclusiveCents * VAT_RATE_BPS) / (10_000 + VAT_RATE_BPS));
}

export function exVatCents(inclusiveCents: number): number {
  return inclusiveCents - vatPortionCents(inclusiveCents);
}
