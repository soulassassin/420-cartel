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
import type {
  PosFulfillmentType,
  PosModifierOption,
  PosAffiliateContext,
  PosVolumeTier,
  PosCalculationResult,
} from '@/types/pos-engine';
import { calculatePosCart } from '@/lib/pos/calculation-engine';
import { roundBaseQty } from '@/lib/uom';

/**
 * Enterprise POS Terminal State with Multi-Branch, Fulfillment Routing,
 * Multi-Tier Affiliates, Dynamic Modifiers, and Volume Tiers.
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
  branchOverridePriceCents?: number;
  costPriceCents?: number;
  volumeTiers?: PosVolumeTier[];
  selectedModifiers: PosModifierOption[];
  lineDiscountCents?: number;
  affiliateEligible?: boolean;
}

export interface PosTenderLine {
  id: string;
  method: PaymentMethod;
  amountCents: number;
  tenderedCents: number | null;
  reference: string | null;
}

export interface PosState {
  // Terminal Identity & Branch Context
  branchId: string | null;
  terminalLabel: string;
  staffId: string | null;
  staffName: string | null;
  taxRateBps: number; // e.g. 1500 for 15% VAT

  // Fulfillment Context
  fulfillmentType: PosFulfillmentType;
  deliveryZoneFeeCents: number;
  deliveryAddress: string | null;

  // Affiliate Attribution Context
  activeAffiliate: PosAffiliateContext | null;

  // Open Ticket
  lines: PosTicketLine[];
  member: PosMemberLookupRow | null;
  discountCents: number;
  pointsToRedeem: number;
  tender: PosTenderLine[];
  note: string;

  // UI & Live Inventory Locks
  activeCategory: ProductCategory | 'ALL';
  searchTerm: string;
  stockLocks: Record<string, number>;

  // Actions
  setTerminal: (input: {
    branchId: string;
    terminalLabel: string;
    staffId: string;
    staffName: string;
    taxRateBps?: number;
  }) => void;
  clearTerminal: () => void;

  setFulfillment: (type: PosFulfillmentType, zoneFeeCents?: number, address?: string | null) => void;
  setAffiliate: (affiliate: PosAffiliateContext | null) => void;

  addLine: (line: Omit<PosTicketLine, 'key' | 'selectedModifiers'> & { selectedModifiers?: PosModifierOption[] }) => void;
  bumpLine: (key: string, delta: number) => void;
  setLineQuantity: (key: string, quantity: number) => void;
  removeLine: (key: string) => void;
  updateLineModifiers: (key: string, modifiers: PosModifierOption[]) => void;

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

function ticketKey(variantId: string, customBaseQty: number | null, modifiers: PosModifierOption[] = []): string {
  const modKey = modifiers
    .map((m) => m.id)
    .sort()
    .join('-');
  const base = customBaseQty === null ? variantId : `${variantId}@${customBaseQty}`;
  return modKey ? `${base}#${modKey}` : base;
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
  activeAffiliate: null as PosAffiliateContext | null,
  fulfillmentType: 'IN_STORE' as PosFulfillmentType,
  deliveryZoneFeeCents: 0,
  deliveryAddress: null as string | null,
};

export const usePosStore = create<PosState>()(
  persist(
    (set) => ({
      branchId: null,
      terminalLabel: 'TILL 1',
      staffId: null,
      staffName: null,
      taxRateBps: 1500, // 15% standard default

      ...EMPTY_TICKET,

      activeCategory: 'ALL',
      searchTerm: '',
      stockLocks: {},

      setTerminal: ({ branchId, terminalLabel, staffId, staffName, taxRateBps = 1500 }) =>
        set((state) => ({
          branchId,
          terminalLabel,
          staffId,
          staffName,
          taxRateBps,
          // Changing branch mid-ticket drops ticket to avoid stock inconsistency across physical sites.
          ...(state.branchId && state.branchId !== branchId ? EMPTY_TICKET : {}),
        })),

      clearTerminal: () =>
        set({ branchId: null, staffId: null, staffName: null, ...EMPTY_TICKET }),

      setFulfillment: (fulfillmentType, deliveryZoneFeeCents = 0, deliveryAddress = null) =>
        set({
          fulfillmentType,
          deliveryZoneFeeCents,
          deliveryAddress,
          tender: [], // tender recomputed on fee change
        }),

      setAffiliate: (activeAffiliate) => set({ activeAffiliate }),

      addLine: (line) =>
        set((state) => {
          const customBaseQty =
            line.customBaseQty === null ? null : roundBaseQty(line.customBaseQty, line.baseUom);
          const selectedModifiers = line.selectedModifiers ?? [];
          const key = ticketKey(line.variantId, customBaseQty, selectedModifiers);
          const existing = state.lines.find((candidate) => candidate.key === key);

          if (existing) {
            return {
              lines: state.lines.map((candidate) =>
                candidate.key === key
                  ? { ...candidate, quantity: candidate.quantity + line.quantity }
                  : candidate,
              ),
              tender: [],
            };
          }

          return {
            lines: [
              ...state.lines,
              {
                ...line,
                customBaseQty,
                selectedModifiers,
                key,
                affiliateEligible: line.affiliateEligible ?? true,
                lineDiscountCents: line.lineDiscountCents ?? 0,
              },
            ],
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

      updateLineModifiers: (key, modifiers) =>
        set((state) => ({
          lines: state.lines.map((line) => {
            if (line.key !== key) return line;
            const updatedKey = ticketKey(line.variantId, line.customBaseQty, modifiers);
            return {
              ...line,
              key: updatedKey,
              selectedModifiers: modifiers,
            };
          }),
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
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        branchId: state.branchId,
        terminalLabel: state.terminalLabel,
        staffId: state.staffId,
        staffName: state.staffName,
        taxRateBps: state.taxRateBps,
        fulfillmentType: state.fulfillmentType,
        deliveryZoneFeeCents: state.deliveryZoneFeeCents,
        lines: state.lines,
        member: state.member,
        discountCents: state.discountCents,
        note: state.note,
        activeAffiliate: state.activeAffiliate,
      }),
    },
  ),
);

// ---------------------------------------------------------------------------
// Selectors & Calculation Engine Bridge
// ---------------------------------------------------------------------------

export function posLineBaseQty(line: PosTicketLine): number {
  return (line.customBaseQty ?? line.baseQuantity) * line.quantity;
}

export function posLineModifiersPriceCents(line: PosTicketLine): number {
  return (line.selectedModifiers || []).reduce((sum, mod) => sum + mod.priceDeltaCents, 0);
}

export function posLineTotalCents(line: PosTicketLine): number {
  let unitBase = line.branchOverridePriceCents ?? line.unitPriceCents;

  if (line.volumeTiers && line.volumeTiers.length > 0) {
    const matched = [...line.volumeTiers]
      .sort((a, b) => b.minQty - a.minQty)
      .find((tier) => line.quantity >= tier.minQty);
    if (matched) unitBase = matched.unitPriceCents;
  }

  const effectiveUnit =
    line.customBaseQty === null
      ? unitBase + posLineModifiersPriceCents(line)
      : Math.round(unitBase * line.customBaseQty) + posLineModifiersPriceCents(line);

  return effectiveUnit * line.quantity;
}

export function selectPosSubtotalCents(state: PosState): number {
  return state.lines.reduce((total, line) => total + posLineTotalCents(line), 0);
}

/**
 * Calculates complete cart result including subtotal, tiered breaks, modifiers,
 * proportional order discounts, VAT, fulfillment fees, and affiliate commissions.
 */
export function selectPosCalculation(state: PosState, pointValueCents = 1): PosCalculationResult {
  const pointsDiscountCents = Math.round(state.pointsToRedeem * pointValueCents);
  const totalOrderDiscountCents = state.discountCents + pointsDiscountCents;

  return calculatePosCart({
    branchId: state.branchId || '',
    taxRateBps: state.taxRateBps,
    fulfillmentType: state.fulfillmentType,
    deliveryZoneFeeCents: state.deliveryZoneFeeCents,
    orderDiscountCents: totalOrderDiscountCents,
    affiliate: state.activeAffiliate,
    items: state.lines.map((line) => ({
      id: line.key,
      productId: line.productId,
      variantId: line.variantId,
      productName: line.productName,
      variantLabel: line.variantLabel,
      quantity: line.quantity,
      baseCatalogPriceCents: line.unitPriceCents,
      branchOverridePriceCents: line.branchOverridePriceCents,
      costPriceCents: line.costPriceCents ?? 0,
      volumeTiers: line.volumeTiers,
      selectedModifiers: line.selectedModifiers,
      lineDiscountCents: line.lineDiscountCents ?? 0,
      affiliateEligible: line.affiliateEligible ?? true,
    })),
  });
}

export function selectPosTotalCents(state: PosState, pointValueCents = 1): number {
  const calc = selectPosCalculation(state, pointValueCents);
  return calc.grandTotalCents;
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
