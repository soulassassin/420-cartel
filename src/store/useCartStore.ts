'use client';

/**
 * 420 CARTEL :: multi-unit online cart (Module 4)
 *
 * This is the import surface Module 4 specifies. The store itself lives in
 * `@/lib/store/cart` — it was already wired into TierSelector, /shop and
 * /checkout, so inverting the dependency would have meant editing three
 * working surfaces to no benefit. Everything below re-exports that store and
 * adds the Part 2 layer on top of it:
 *
 *   - `selectCartSummary` — total grams, millilitres, discrete units and
 *     subtotal in one readout, the figure the cart drawer and checkout header
 *     both render.
 *   - `cartLineUnitBaseQty` / `cartLineBaseQty` — how much of the parent master
 *     batch one of a line, and the whole line, deducts (`totalUomDeducted`).
 *   - `selectHeadroom` — sellable room left for a product once what is already
 *     in the cart is accounted for.
 *   - `selectIsCartReady` — whether the fulfilment choice is complete enough to
 *     submit.
 *
 * LIVE STOCK: the realtime half lives in `@/hooks/useStockBoardSync`, which
 * subscribes to `product_stock_board` (the member-safe projection of
 * `master_batches`) and trims cart lines through this store's public API when a
 * POS sale takes the stock out from under a shopper. It is a hook rather than
 * store internals so the subscription follows a mounted component's lifetime
 * and one socket is shared by every surface on the page.
 *
 * Money is integer cents here, in the database and in the payment adapters.
 * Rand values appear only at the formatting boundary (`@/lib/money`).
 */

import { useShallow } from 'zustand/react/shallow';
import type { BaseUom } from '@/types/database';
import {
  useCartStore,
  cartLineBaseQty,
  cartLineTotalCents,
  selectCartCount,
  selectCartSubtotalCents,
  selectCartUomTotals,
  type CartLine,
  type CartState,
} from '@/lib/store/cart';

export {
  useCartStore,
  cartLineBaseQty,
  cartLineTotalCents,
  cartProductBaseQty,
  selectCartCount,
  selectCartSubtotalCents,
  selectCartUomTotals,
  selectOrderItems,
} from '@/lib/store/cart';

export type { CartLine, CartState } from '@/lib/store/cart';

/**
 * ⚠ Zustand v5 + React 19: a selector that builds a NEW object or array on
 * every call re-renders forever.
 *
 * v5 hands the selector straight to `useSyncExternalStore` with no equality
 * check, so a fresh object is never `Object.is`-equal to the last snapshot and
 * React keeps re-rendering until it throws "Maximum update depth exceeded".
 * `selectCartSummary` and `selectCartUomTotals` both build objects, so they
 * must be wrapped:
 *
 *     const summary = useCartStore(useShallow(selectCartSummary));
 *
 * The two hooks below do that for you — prefer them in components. Scalar
 * selectors (`selectCartCount`, `selectCartSubtotalCents`) are safe bare.
 */
export function useCartSummary(): CartSummary {
  return useCartStore(useShallow(selectCartSummary));
}

/** Base-unit totals per unit of measure, safely memoised. */
export function useCartUomTotals(): Partial<Record<BaseUom, number>> {
  return useCartStore(useShallow(selectCartUomTotals));
}

/** Base units ONE of a line consumes — the variant tier, or the exact amount. */
export function cartLineUnitBaseQty(line: CartLine): number {
  return line.customBaseQty ?? line.baseQuantity;
}

export interface CartSummary {
  lineCount: number;
  itemCount: number;
  subtotalCents: number;
  /** Total grams in the cart. */
  grams: number;
  /** Total millilitres in the cart. */
  millilitres: number;
  /** Total discrete units in the cart. */
  units: number;
}

/**
 * The one cart readout. Totals are kept per unit of measure rather than summed,
 * because adding grams to millilitres is meaningless — a cart holding 14 g of
 * flower and 30 ml of elixir reports both, never "44".
 */
export function selectCartSummary(state: CartState): CartSummary {
  const totals: Record<BaseUom, number> = { GRAMS: 0, MILLILITERS: 0, UNITS: 0 };

  for (const line of state.lines) {
    totals[line.baseUom] += cartLineBaseQty(line);
  }

  return {
    lineCount: state.lines.length,
    itemCount: selectCartCount(state),
    subtotalCents: selectCartSubtotalCents(state),
    // Round at the display boundary only, at each unit's tracked precision.
    grams: Math.round(totals.GRAMS * 100) / 100,
    millilitres: Math.round(totals.MILLILITERS * 10) / 10,
    units: Math.round(totals.UNITS),
  };
}

/**
 * Sellable headroom for a product: what the open batch still holds, less what
 * this cart has already claimed. Returns null when stock is unknown, so a
 * caller can tell "none left" from "not loaded yet".
 */
export function selectHeadroom(
  state: CartState,
  productId: string,
  availableBaseQty: number | null | undefined,
): number | null {
  if (availableBaseQty === null || availableBaseQty === undefined) return null;

  const committed = state.lines
    .filter((line) => line.productId === productId)
    .reduce((total, line) => total + cartLineBaseQty(line), 0);

  return Math.max(0, availableBaseQty - committed);
}

/** How many more of a tier the headroom can fill. */
export function tiersFillable(
  headroomBaseQty: number | null,
  tierBaseQty: number,
): number | null {
  if (headroomBaseQty === null) return null;
  if (tierBaseQty <= 0) return 0;
  return Math.floor(headroomBaseQty / tierBaseQty);
}

/** Is the cart complete enough to hand to `process_cartel_order`? */
export function selectIsCartReady(state: CartState): boolean {
  if (state.lines.length === 0 || !state.branchId) return false;

  if (state.fulfilment === 'DELIVERY') {
    return state.deliveryLat !== null && state.deliveryLng !== null;
  }
  if (state.fulfilment === 'PICKUP') {
    return state.pickupSlotStart !== null;
  }
  // IN_STORE is rung up at the till, not here.
  return true;
}

/** Line totals, for the cart drawer's per-line display. */
export function cartLineDisplay(line: CartLine): {
  unitBaseQty: number;
  totalBaseQty: number;
  totalCents: number;
} {
  return {
    unitBaseQty: cartLineUnitBaseQty(line),
    totalBaseQty: cartLineBaseQty(line),
    totalCents: cartLineTotalCents(line),
  };
}
