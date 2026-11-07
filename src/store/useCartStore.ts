'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  BaseUom,
  FulfilmentType,
  ProcessOrderItemInput,
  ProductCategory,
  ProductStockBoardRow,
} from '@/types/database';
import { roundBaseQty, UOM_PRECISION } from '@/lib/uom';

/**
 * 420 CARTEL :: multi-unit online cart & fulfilment store
 *
 * One cart holds grams, millilitres and discrete units side by side. Every line
 * records how much of its parent master batch it consumes (`uomMultiplier`, or
 * `customBaseQty` for an exact-weight line), so the cart can report "412.5 g +
 * 90 ml + 6 ea" and hand `process_cartel_order` a payload it deducts FIFO.
 *
 * Money is integer cents everywhere, matching the database and the payment
 * adapters. `R` values exist only at the formatting boundary (`@/lib/money`).
 *
 * Live stock: `stockBoard` mirrors `public.product_stock_board`, the member-safe
 * realtime projection of `master_batches`. When a POS cashier sells the last
 * 3.5 g of a batch, the trigger updates the board, Realtime pushes the row, and
 * `applyStockUpdate` trims or flags any cart line that can no longer be filled.
 * Wire it up with `useStockBoardSync` (src/hooks/useStockBoardSync.ts).
 */

export interface CartLine {
  /** Stable line key: variant + custom amount, so two custom weights coexist. */
  key: string;
  productId: string;
  productSlug: string;
  /** Product name as shown on the card and the receipt. */
  name: string;
  category: ProductCategory;
  variantId: string;
  /** '3.5g Eighth', '30ml Elixir', '3-Pack' ... */
  variantLabel: string;
  /** The batch this line was quoted against. Postgres re-resolves FIFO at sale. */
  masterBatchId: string | null;
  masterBatchCode: string | null;
  baseUom: BaseUom;
  /** Base units consumed by ONE of this line: 3.5 for a 3.5g tier, 30 for 30ml. */
  uomMultiplier: number;
  /** Set only for exact-amount lines (custom weight / volume). */
  customBaseQty: number | null;
  quantity: number;
  unitPriceCents: number;
  heroMediaUrl: string | null;
  promoVideoUrl: string | null;
}

/** What the storefront knows about a product's sellable stock right now. */
export interface StockSnapshot {
  productId: string;
  baseUom: BaseUom;
  availableBaseQty: number;
  isLowStock: boolean;
  batchId: string | null;
  batchCode: string | null;
  promoVideoUrl: string | null;
  updatedAt: string;
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

export interface CartState {
  branchId: string | null;
  fulfilment: FulfilmentType;
  lines: CartLine[];

  /** Live sellable stock per product id, mirrored from Realtime. */
  stockBoard: Record<string, StockSnapshot>;
  /** Lines the live board has trimmed or emptied since they were added. */
  stockWarnings: Record<string, string>;
  lastStockEventAt: string | null;

  // Delivery selection
  deliveryAddress: string | null;
  deliverySuburb: string | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  deliveryInstructions: string;

  // Pickup selection
  pickupBranchId: string | null;
  pickupSlotStart: string | null;
  pickupSlotEnd: string | null;

  pointsToRedeem: number;
  referralCode: string | null;

  setBranch: (branchId: string) => void;
  setFulfilment: (fulfilment: FulfilmentType) => void;

  addLine: (line: Omit<CartLine, 'key'>) => void;
  setLineQuantity: (key: string, quantity: number) => void;
  bumpLine: (key: string, delta: number) => void;
  removeLine: (key: string) => void;
  clear: () => void;

  setDelivery: (input: {
    address: string;
    suburb: string | null;
    lat: number;
    lng: number;
  }) => void;
  setDeliveryInstructions: (instructions: string) => void;
  setPickup: (branchId: string, startIso: string, endIso: string) => void;
  clearPickupSlot: () => void;

  setPointsToRedeem: (points: number) => void;
  setReferralCode: (code: string | null) => void;

  /** Seed the board from the initial server fetch. */
  hydrateStockBoard: (rows: ProductStockBoardRow[]) => void;
  /** Apply one Realtime row change and reconcile affected lines. */
  applyStockUpdate: (row: ProductStockBoardRow) => void;
  dismissStockWarning: (productId: string) => void;
}

function lineKey(variantId: string, customBaseQty: number | null): string {
  return customBaseQty === null ? variantId : `${variantId}@${customBaseQty}`;
}

function toSnapshot(row: ProductStockBoardRow): StockSnapshot {
  return {
    productId: row.product_id,
    baseUom: row.base_uom,
    availableBaseQty: Number(row.available_base_qty),
    isLowStock: row.is_low_stock,
    batchId: row.featured_batch_id,
    batchCode: row.featured_batch_code,
    promoVideoUrl: row.promo_video_url,
    updatedAt: row.updated_at,
  };
}

/** Base units one of a line consumes. */
export function cartLineUnitBaseQty(line: CartLine): number {
  return line.customBaseQty ?? line.uomMultiplier;
}

/** Base units the whole line consumes — the `totalUomDeducted` figure. */
export function cartLineBaseQty(line: CartLine): number {
  return roundBaseQty(cartLineUnitBaseQty(line) * line.quantity, line.baseUom);
}

/**
 * Line total. A custom-amount line prices per base unit (R/g, R/ml), which is
 * exactly how `process_cartel_order` prices `base_qty_override` lines.
 */
export function cartLineTotalCents(line: CartLine): number {
  const unit =
    line.customBaseQty === null
      ? line.unitPriceCents
      : Math.round(line.unitPriceCents * line.customBaseQty);
  return unit * line.quantity;
}

const MAX_LINE_QUANTITY = 99;

/**
 * Trim the cart against a fresh stock snapshot.
 * Lines are reduced to what the batch can still fill, and dropped when it can
 * fill none — the shopper is told, rather than discovering it at checkout.
 */
function reconcileLines(
  lines: CartLine[],
  snapshot: StockSnapshot,
): { lines: CartLine[]; warning: string | null } {
  const affected = lines.filter((line) => line.productId === snapshot.productId);
  if (affected.length === 0) return { lines, warning: null };

  const precision = UOM_PRECISION[snapshot.baseUom];
  let budget = snapshot.availableBaseQty;
  let trimmed = false;
  let dropped = false;

  const next: CartLine[] = [];

  for (const line of lines) {
    if (line.productId !== snapshot.productId) {
      next.push(line);
      continue;
    }

    const perUnit = cartLineUnitBaseQty(line);
    const fillable = perUnit <= 0 ? 0 : Math.floor(budget / perUnit);
    const allowed = Math.min(line.quantity, Math.max(0, fillable));

    if (allowed <= 0) {
      dropped = true;
      continue;
    }

    if (allowed < line.quantity) trimmed = true;
    budget = roundBaseQty(budget - allowed * perUnit, snapshot.baseUom);
    next.push(allowed === line.quantity ? line : { ...line, quantity: allowed });
  }

  if (!trimmed && !dropped) return { lines, warning: null };

  const remaining = snapshot.availableBaseQty.toFixed(precision);
  return {
    lines: next,
    warning: dropped
      ? `Allocated out while you shopped — ${remaining} left in the open batch.`
      : `Quantity reduced to the ${remaining} still in the open batch.`,
  };
}

const EMPTY_CART = {
  lines: [] as CartLine[],
  pointsToRedeem: 0,
  deliveryInstructions: '',
  pickupSlotStart: null,
  pickupSlotEnd: null,
  stockWarnings: {} as Record<string, string>,
};

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      branchId: null,
      fulfilment: 'PICKUP',
      lines: [],

      stockBoard: {},
      stockWarnings: {},
      lastStockEventAt: null,

      deliveryAddress: null,
      deliverySuburb: null,
      deliveryLat: null,
      deliveryLng: null,
      deliveryInstructions: '',

      pickupBranchId: null,
      pickupSlotStart: null,
      pickupSlotEnd: null,

      pointsToRedeem: 0,
      referralCode: null,

      setBranch: (branchId) =>
        set((state) =>
          // Lines are bound to one branch's batches; switching empties the cart.
          state.branchId === branchId
            ? state
            : { branchId, ...EMPTY_CART, stockBoard: {}, pickupBranchId: branchId },
        ),

      setFulfilment: (fulfilment) => set({ fulfilment }),

      addLine: (line) =>
        set((state) => {
          const customBaseQty =
            line.customBaseQty === null
              ? null
              : roundBaseQty(line.customBaseQty, line.baseUom);
          const key = lineKey(line.variantId, customBaseQty);
          const existing = state.lines.find((candidate) => candidate.key === key);
          const requested = Math.max(1, Math.floor(line.quantity));

          // Never let the cart exceed what the live board says is sellable.
          const snapshot = state.stockBoard[line.productId];
          const perUnit = customBaseQty ?? line.uomMultiplier;
          const committed = state.lines
            .filter((candidate) => candidate.productId === line.productId)
            .reduce((total, candidate) => total + cartLineBaseQty(candidate), 0);
          const headroom = snapshot
            ? Math.max(0, snapshot.availableBaseQty - committed)
            : Number.POSITIVE_INFINITY;
          const fillable =
            perUnit <= 0 ? 0 : Math.floor(headroom / perUnit);

          if (fillable <= 0 && snapshot) {
            return {
              stockWarnings: {
                ...state.stockWarnings,
                [line.productId]: 'That is everything the open batch can fill.',
              },
            };
          }

          const grant = Math.min(requested, Math.max(1, fillable));

          if (existing) {
            return {
              lines: state.lines.map((candidate) =>
                candidate.key === key
                  ? {
                      ...candidate,
                      quantity: Math.min(MAX_LINE_QUANTITY, candidate.quantity + grant),
                    }
                  : candidate,
              ),
            };
          }

          return {
            lines: [
              ...state.lines,
              {
                ...line,
                customBaseQty,
                key,
                quantity: Math.min(MAX_LINE_QUANTITY, grant),
              },
            ],
          };
        }),

      setLineQuantity: (key, quantity) =>
        set((state) => ({
          lines:
            quantity <= 0
              ? state.lines.filter((line) => line.key !== key)
              : state.lines.map((line) =>
                  line.key === key
                    ? {
                        ...line,
                        quantity: Math.min(MAX_LINE_QUANTITY, Math.floor(quantity)),
                      }
                    : line,
                ),
        })),

      bumpLine: (key, delta) =>
        set((state) => ({
          lines: state.lines
            .map((line) =>
              line.key === key
                ? {
                    ...line,
                    quantity: Math.min(MAX_LINE_QUANTITY, line.quantity + delta),
                  }
                : line,
            )
            .filter((line) => line.quantity > 0),
        })),

      removeLine: (key) =>
        set((state) => ({ lines: state.lines.filter((line) => line.key !== key) })),

      clear: () => set({ ...EMPTY_CART }),

      setDelivery: ({ address, suburb, lat, lng }) =>
        set({
          deliveryAddress: address,
          deliverySuburb: suburb,
          deliveryLat: lat,
          deliveryLng: lng,
          fulfilment: 'DELIVERY',
        }),

      setDeliveryInstructions: (deliveryInstructions) => set({ deliveryInstructions }),

      setPickup: (pickupBranchId, pickupSlotStart, pickupSlotEnd) =>
        set({ pickupBranchId, pickupSlotStart, pickupSlotEnd, fulfilment: 'PICKUP' }),

      clearPickupSlot: () => set({ pickupSlotStart: null, pickupSlotEnd: null }),

      setPointsToRedeem: (points) =>
        set({ pointsToRedeem: Math.max(0, Math.floor(points)) }),

      setReferralCode: (referralCode) => set({ referralCode }),

      hydrateStockBoard: (rows) =>
        set(() => ({
          stockBoard: rows.reduce<Record<string, StockSnapshot>>((board, row) => {
            board[row.product_id] = toSnapshot(row);
            return board;
          }, {}),
          lastStockEventAt: new Date().toISOString(),
        })),

      applyStockUpdate: (row) =>
        set((state) => {
          const snapshot = toSnapshot(row);
          const { lines, warning } = reconcileLines(state.lines, snapshot);

          return {
            stockBoard: { ...state.stockBoard, [snapshot.productId]: snapshot },
            lines,
            lastStockEventAt: snapshot.updatedAt,
            stockWarnings: warning
              ? { ...state.stockWarnings, [snapshot.productId]: warning }
              : state.stockWarnings,
          };
        }),

      dismissStockWarning: (productId) =>
        set((state) => {
          if (!state.stockWarnings[productId]) return state;
          const next = { ...state.stockWarnings };
          delete next[productId];
          return { stockWarnings: next };
        }),
    }),
    {
      name: 'cartel-cart',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      /**
       * Prices and stock are re-resolved server-side on every load, so only the
       * shopper's intent is persisted. The board, warnings and the referral code
       * are deliberately session-scoped.
       */
      partialize: (state) => ({
        branchId: state.branchId,
        fulfilment: state.fulfilment,
        lines: state.lines,
        deliveryAddress: state.deliveryAddress,
        deliverySuburb: state.deliverySuburb,
        deliveryLat: state.deliveryLat,
        deliveryLng: state.deliveryLng,
        deliveryInstructions: state.deliveryInstructions,
        pickupBranchId: state.pickupBranchId,
      }),
    },
  ),
);

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function selectCartCount(state: CartState): number {
  return state.lines.reduce((total, line) => total + line.quantity, 0);
}

export function selectCartSubtotalCents(state: CartState): number {
  return state.lines.reduce((total, line) => total + cartLineTotalCents(line), 0);
}

/** Base-unit totals per unit of measure. */
export function selectCartUomTotals(state: CartState): Record<BaseUom, number> {
  const totals: Record<BaseUom, number> = { GRAMS: 0, MILLILITERS: 0, UNITS: 0 };
  for (const line of state.lines) {
    totals[line.baseUom] = roundBaseQty(
      totals[line.baseUom] + cartLineBaseQty(line),
      line.baseUom,
    );
  }
  return totals;
}

/** The single readout the cart drawer and checkout header both render. */
export function selectCartSummary(state: CartState): CartSummary {
  const totals = selectCartUomTotals(state);
  return {
    lineCount: state.lines.length,
    itemCount: selectCartCount(state),
    subtotalCents: selectCartSubtotalCents(state),
    grams: totals.GRAMS,
    millilitres: totals.MILLILITERS,
    units: totals.UNITS,
  };
}

/** Payload shape `process_cartel_order` expects. */
export function selectOrderItems(state: CartState): ProcessOrderItemInput[] {
  return state.lines.map((line) => ({
    variant_id: line.variantId,
    quantity: line.quantity,
    ...(line.customBaseQty === null ? {} : { base_qty_override: line.customBaseQty }),
  }));
}

/** Sellable headroom left for a product after what is already in the cart. */
export function selectHeadroom(state: CartState, productId: string): number | null {
  const snapshot = state.stockBoard[productId];
  if (!snapshot) return null;
  const committed = state.lines
    .filter((line) => line.productId === productId)
    .reduce((total, line) => total + cartLineBaseQty(line), 0);
  return Math.max(0, snapshot.availableBaseQty - committed);
}

export function selectIsCartReady(state: CartState): boolean {
  if (state.lines.length === 0 || !state.branchId) return false;
  if (state.fulfilment === 'DELIVERY') {
    return state.deliveryLat !== null && state.deliveryLng !== null;
  }
  return state.pickupSlotStart !== null && state.pickupBranchId !== null;
}
