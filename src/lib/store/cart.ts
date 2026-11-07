'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  BaseUom,
  FulfilmentType,
  ProcessOrderItemInput,
  ProductCategory,
} from '@/types/database';
import { roundBaseQty } from '@/lib/uom';

/**
 * Online cart. Persisted to localStorage so a member can close the tab mid-
 * order, but prices are always re-resolved server-side at checkout — the
 * persisted `unitPriceCents` is for display only and never trusted.
 */

export interface CartLine {
  /** Stable line key: variant + custom amount, so two custom weights coexist. */
  key: string;
  productId: string;
  productName: string;
  productSlug: string;
  category: ProductCategory;
  variantId: string;
  variantLabel: string;
  baseUom: BaseUom;
  /** Base units consumed by ONE of this line. */
  baseQuantity: number;
  /** Set only for custom-amount tiers. */
  customBaseQty: number | null;
  quantity: number;
  unitPriceCents: number;
  heroMediaUrl: string | null;
}

export interface CartState {
  branchId: string | null;
  fulfilment: FulfilmentType;
  lines: CartLine[];

  // Delivery selection
  deliveryAddress: string | null;
  deliverySuburb: string | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  deliveryInstructions: string;

  // Pickup selection
  pickupSlotStart: string | null;
  pickupSlotEnd: string | null;

  pointsToRedeem: number;
  referralCode: string | null;

  setBranch: (branchId: string) => void;
  setFulfilment: (fulfilment: FulfilmentType) => void;
  addLine: (line: Omit<CartLine, 'key'>) => void;
  setLineQuantity: (key: string, quantity: number) => void;
  removeLine: (key: string) => void;
  clear: () => void;
  setDelivery: (input: {
    address: string;
    suburb: string | null;
    lat: number;
    lng: number;
  }) => void;
  setDeliveryInstructions: (instructions: string) => void;
  setPickupSlot: (startIso: string, endIso: string) => void;
  setPointsToRedeem: (points: number) => void;
  setReferralCode: (code: string | null) => void;
}

function lineKey(variantId: string, customBaseQty: number | null): string {
  return customBaseQty === null ? variantId : `${variantId}@${customBaseQty}`;
}

const MAX_LINE_QUANTITY = 99;

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      branchId: null,
      fulfilment: 'PICKUP',
      lines: [],
      deliveryAddress: null,
      deliverySuburb: null,
      deliveryLat: null,
      deliveryLng: null,
      deliveryInstructions: '',
      pickupSlotStart: null,
      pickupSlotEnd: null,
      pointsToRedeem: 0,
      referralCode: null,

      setBranch: (branchId) =>
        set((state) =>
          // Switching branch invalidates stock-bound lines.
          state.branchId === branchId ? state : { branchId, lines: [] },
        ),

      setFulfilment: (fulfilment) => set({ fulfilment }),

      addLine: (line) =>
        set((state) => {
          const customBaseQty =
            line.customBaseQty === null ? null : roundBaseQty(line.customBaseQty, line.baseUom);
          const key = lineKey(line.variantId, customBaseQty);
          const existing = state.lines.find((candidate) => candidate.key === key);

          if (existing) {
            return {
              lines: state.lines.map((candidate) =>
                candidate.key === key
                  ? {
                      ...candidate,
                      quantity: Math.min(MAX_LINE_QUANTITY, candidate.quantity + line.quantity),
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
                quantity: Math.min(MAX_LINE_QUANTITY, Math.max(1, line.quantity)),
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
                    ? { ...line, quantity: Math.min(MAX_LINE_QUANTITY, quantity) }
                    : line,
                ),
        })),

      removeLine: (key) =>
        set((state) => ({ lines: state.lines.filter((line) => line.key !== key) })),

      clear: () =>
        set({
          lines: [],
          pointsToRedeem: 0,
          deliveryInstructions: '',
          pickupSlotStart: null,
          pickupSlotEnd: null,
        }),

      setDelivery: ({ address, suburb, lat, lng }) =>
        set({
          deliveryAddress: address,
          deliverySuburb: suburb,
          deliveryLat: lat,
          deliveryLng: lng,
          fulfilment: 'DELIVERY',
        }),

      setDeliveryInstructions: (deliveryInstructions) => set({ deliveryInstructions }),

      setPickupSlot: (pickupSlotStart, pickupSlotEnd) =>
        set({ pickupSlotStart, pickupSlotEnd, fulfilment: 'PICKUP' }),

      setPointsToRedeem: (points) => set({ pointsToRedeem: Math.max(0, Math.floor(points)) }),

      setReferralCode: (referralCode) => set({ referralCode }),
    }),
    {
      name: 'cartel-cart',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Never persist the referral code or a stale points figure.
      partialize: (state) => ({
        branchId: state.branchId,
        fulfilment: state.fulfilment,
        lines: state.lines,
        deliveryAddress: state.deliveryAddress,
        deliverySuburb: state.deliverySuburb,
        deliveryLat: state.deliveryLat,
        deliveryLng: state.deliveryLng,
      }),
    },
  ),
);

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function cartLineBaseQty(line: CartLine): number {
  return (line.customBaseQty ?? line.baseQuantity) * line.quantity;
}

export function cartLineTotalCents(line: CartLine): number {
  const unit =
    line.customBaseQty === null
      ? line.unitPriceCents
      : Math.round(line.unitPriceCents * line.customBaseQty);
  return unit * line.quantity;
}

export function selectCartCount(state: CartState): number {
  return state.lines.reduce((total, line) => total + line.quantity, 0);
}

export function selectCartSubtotalCents(state: CartState): number {
  return state.lines.reduce((total, line) => total + cartLineTotalCents(line), 0);
}

/** Base-unit totals per unit of measure, for the "in your crate" summary. */
export function selectCartUomTotals(state: CartState): Partial<Record<BaseUom, number>> {
  return state.lines.reduce<Partial<Record<BaseUom, number>>>((totals, line) => {
    const current = totals[line.baseUom] ?? 0;
    totals[line.baseUom] = roundBaseQty(current + cartLineBaseQty(line), line.baseUom);
    return totals;
  }, {});
}

/**
 * Base units of one product already committed across every line in the cart.
 *
 * This is what makes the multi-tier guard work: a 7g Quarter and a 3.5g Eighth
 * of the same batch are two lines but one 10.5g claim on that batch's balance,
 * and the shop refuses the second one if only 10g is left.
 */
export function cartProductBaseQty(
  lines: readonly CartLine[],
  productId: string,
  excludeKey?: string,
): number {
  return lines
    .filter((line) => line.productId === productId && line.key !== excludeKey)
    .reduce((total, line) => total + cartLineBaseQty(line), 0);
}

/** Payload shape `process_cartel_order` expects. */
export function selectOrderItems(state: CartState): ProcessOrderItemInput[] {
  return state.lines.map((line) => ({
    variant_id: line.variantId,
    quantity: line.quantity,
    ...(line.customBaseQty === null ? {} : { base_qty_override: line.customBaseQty }),
  }));
}
