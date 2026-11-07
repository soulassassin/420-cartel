'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  BaseUom,
  PaymentMethod,
  PosMemberLookupRow,
  ProcessOrderItemInput,
  ProductCategory,
} from '@/types/database';
import { roundBaseQty } from '@/lib/uom';

/**
 * POS terminal state.
 *
 * The active till (branch + terminal label + cashier) is persisted so a tablet
 * that sleeps or reloads comes back on the same till. The open ticket is
 * persisted too, so a dropped tablet does not lose a half-rung sale.
 */

export interface PosTicketLine {
  key: string;
  productId: string;
  productName: string;
  category: ProductCategory;
  variantId: string;
  variantLabel: string;
  baseUom: BaseUom;
  baseQuantity: number;
  customBaseQty: number | null;
  quantity: number;
  unitPriceCents: number;
}

export interface PosTenderLine {
  id: string;
  method: PaymentMethod;
  amountCents: number;
  tenderedCents: number | null;
  reference: string | null;
}

export interface PosState {
  // Terminal identity
  branchId: string | null;
  terminalLabel: string;
  staffId: string | null;
  staffName: string | null;

  // Open ticket
  lines: PosTicketLine[];
  member: PosMemberLookupRow | null;
  discountCents: number;
  pointsToRedeem: number;
  tender: PosTenderLine[];
  note: string;

  // UI
  activeCategory: ProductCategory | 'ALL';
  searchTerm: string;
  /** Batch-level stock locks observed over Realtime, keyed by product id. */
  stockLocks: Record<string, number>;

  setTerminal: (input: {
    branchId: string;
    terminalLabel: string;
    staffId: string;
    staffName: string;
  }) => void;
  clearTerminal: () => void;

  addLine: (line: Omit<PosTicketLine, 'key'>) => void
  bumpLine: (key: string, delta: number) => void;
  setLineQuantity: (key: string, quantity: number) => void;
  removeLine: (key: string) => void;

  attachMember: (member: PosMemberLookupRow | null) => void;
  setDiscountCents: (cents: number) => void;
  setPointsToRedeem: (points: number) => void;

  addTender: (line: Omit<PosTenderLine, 'id'>) => void;
  removeTender: (id: string) => void;
  clearTender: () => void;

  setNote: (note: string) => void;
  setActiveCategory: (category: ProductCategory | 'ALL') => void;
  setSearchTerm: (term: string) => void;
  setStockLevel: (productId: string, availableBaseQty: number) => void;

  voidTicket: () => void;
}

function ticketKey(variantId: string, customBaseQty: number | null): string {
  return customBaseQty === null ? variantId : `${variantId}@${customBaseQty}`;
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

const EMPTY_TICKET = {
  lines: [] as PosTicketLine[],
  member: null,
  discountCents: 0,
  pointsToRedeem: 0,
  tender: [] as PosTenderLine[],
  note: '',
};

export const usePosStore = create<PosState>()(
  persist(
    (set) => ({
      branchId: null,
      terminalLabel: 'TILL 1',
      staffId: null,
      staffName: null,

      ...EMPTY_TICKET,

      activeCategory: 'ALL',
      searchTerm: '',
      stockLocks: {},

      setTerminal: ({ branchId, terminalLabel, staffId, staffName }) =>
        set((state) => ({
          branchId,
          terminalLabel,
          staffId,
          staffName,
          // Changing branch mid-ticket would deduct from the wrong stock.
          ...(state.branchId && state.branchId !== branchId ? EMPTY_TICKET : {}),
        })),

      clearTerminal: () =>
        set({ branchId: null, staffId: null, staffName: null, ...EMPTY_TICKET }),

      addLine: (line) =>
        set((state) => {
          const customBaseQty =
            line.customBaseQty === null ? null : roundBaseQty(line.customBaseQty, line.baseUom);
          const key = ticketKey(line.variantId, customBaseQty);
          const existing = state.lines.find((candidate) => candidate.key === key);

          if (existing) {
            return {
              lines: state.lines.map((candidate) =>
                candidate.key === key
                  ? { ...candidate, quantity: candidate.quantity + line.quantity }
                  : candidate,
              ),
              // Adding stock invalidates an in-progress split tender.
              tender: [],
            };
          }

          return {
            lines: [...state.lines, { ...line, customBaseQty, key }],
            tender: [],
          };
        }),

      bumpLine: (key, delta) =>
        set((state) => ({
          lines: state.lines
            .map((line) =>
              line.key === key ? { ...line, quantity: line.quantity + delta } : line,
            )
            .filter((line) => line.quantity > 0),
          tender: [],
        })),

      setLineQuantity: (key, quantity) =>
        set((state) => ({
          lines:
            quantity <= 0
              ? state.lines.filter((line) => line.key !== key)
              : state.lines.map((line) => (line.key === key ? { ...line, quantity } : line)),
          tender: [],
        })),

      removeLine: (key) =>
        set((state) => ({
          lines: state.lines.filter((line) => line.key !== key),
          tender: [],
        })),

      attachMember: (member) => set({ member, pointsToRedeem: 0, tender: [] }),

      setDiscountCents: (cents) =>
        set({ discountCents: Math.max(0, Math.round(cents)), tender: [] }),

      setPointsToRedeem: (points) =>
        set({ pointsToRedeem: Math.max(0, Math.floor(points)), tender: [] }),

      addTender: (line) => set((state) => ({ tender: [...state.tender, { ...line, id: newId() }] })),

      removeTender: (id) =>
        set((state) => ({ tender: state.tender.filter((line) => line.id !== id) })),

      clearTender: () => set({ tender: [] }),

      setNote: (note) => set({ note }),
      setActiveCategory: (activeCategory) => set({ activeCategory }),
      setSearchTerm: (searchTerm) => set({ searchTerm }),

      setStockLevel: (productId, availableBaseQty) =>
        set((state) => ({
          stockLocks: { ...state.stockLocks, [productId]: availableBaseQty },
        })),

      voidTicket: () => set({ ...EMPTY_TICKET }),
    }),
    {
      name: 'cartel-pos',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        branchId: state.branchId,
        terminalLabel: state.terminalLabel,
        staffId: state.staffId,
        staffName: state.staffName,
        lines: state.lines,
        member: state.member,
        discountCents: state.discountCents,
        note: state.note,
      }),
    },
  ),
);

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function posLineBaseQty(line: PosTicketLine): number {
  return (line.customBaseQty ?? line.baseQuantity) * line.quantity;
}

export function posLineTotalCents(line: PosTicketLine): number {
  const unit =
    line.customBaseQty === null
      ? line.unitPriceCents
      : Math.round(line.unitPriceCents * line.customBaseQty);
  return unit * line.quantity;
}

export function selectPosSubtotalCents(state: PosState): number {
  return state.lines.reduce((total, line) => total + posLineTotalCents(line), 0);
}

export function selectPosTotalCents(state: PosState, pointValueCents = 1): number {
  const subtotal = selectPosSubtotalCents(state);
  const redemption = Math.round(state.pointsToRedeem * pointValueCents);
  const discount = Math.min(subtotal, state.discountCents + redemption);
  return subtotal - discount;
}

export function selectPosTenderedCents(state: PosState): number {
  return state.tender.reduce((total, line) => total + line.amountCents, 0);
}

export function selectPosOutstandingCents(state: PosState, pointValueCents = 1): number {
  return Math.max(0, selectPosTotalCents(state, pointValueCents) - selectPosTenderedCents(state));
}

export function selectPosOrderItems(state: PosState): ProcessOrderItemInput[] {
  return state.lines.map((line) => ({
    variant_id: line.variantId,
    quantity: line.quantity,
    ...(line.customBaseQty === null ? {} : { base_qty_override: line.customBaseQty }),
  }));
}

export function selectPosItemCount(state: PosState): number {
  return state.lines.reduce((total, line) => total + line.quantity, 0);
}
