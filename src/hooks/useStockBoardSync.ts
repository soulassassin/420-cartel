'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createCartelBrowserClient } from '@/lib/supabase/client';
import { useCartStore, cartLineBaseQty } from '@/lib/store/cart';
import { cartLineUnitBaseQty } from '@/store/useCartStore';
import { UOM_PRECISION, UOM_SYMBOL } from '@/lib/uom';
import type { BaseUom, ProductStockBoardRow } from '@/types/database';

/**
 * 420 CARTEL :: live stock board subscription (Module 4)
 *
 * Why a projection and not `master_batches` directly: that table is staff-only
 * under RLS and carries `cost_per_base_unit_cents`, so a member subscription
 * would either return nothing or leak margin. `public.product_stock_board` is
 * the cost-free mirror, maintained by trigger on every batch write, readable by
 * anyone and in the realtime publication. A POS cashier selling the last 3.5 g
 * updates `master_batches`, the trigger rewrites the board row, and this hook
 * lands the change in every open shop tab within a tick.
 *
 * Cart reconciliation is deliberate rather than silent: when a line can no
 * longer be filled it is trimmed to what is left (or dropped), and a warning is
 * surfaced for that product so the shopper is told at the shelf instead of
 * discovering it at checkout. `process_cartel_order` is still the authority —
 * it re-checks stock under row locks and will refuse an oversell regardless of
 * what this hook believed.
 *
 * In LOCAL preview mode (no Supabase credentials) there is no socket to open;
 * the demo engine drives its own stock updates, so the hook idles and reports
 * `status: 'DISABLED'` rather than pretending to be connected.
 */

export type StockSyncStatus = 'DISABLED' | 'CONNECTING' | 'LIVE' | 'ERROR';

export interface StockSnapshot {
  productId: string;
  baseUom: BaseUom;
  /** Sellable now: remaining minus reservations. */
  availableBaseQty: number;
  isLowStock: boolean;
  openBatchCount: number;
  batchId: string | null;
  batchCode: string | null;
  labThcPct: number | null;
  labCbdPct: number | null;
  terpeneProfile: Record<string, number>;
  promoVideoUrl: string | null;
  promoPosterUrl: string | null;
  updatedAt: string;
}

export interface StockBoardSync {
  /** Keyed by product id. */
  board: Record<string, StockSnapshot>;
  status: StockSyncStatus;
  error: string | null;
  lastEventAt: string | null;
  /** Per-product notices raised by reconciliation. */
  warnings: Record<string, string>;
  dismissWarning: (productId: string) => void;
  snapshotFor: (productId: string) => StockSnapshot | null;
  /** Sellable room left for a product after this cart's claims. */
  headroomFor: (productId: string) => number | null;
}

function toSnapshot(row: ProductStockBoardRow): StockSnapshot {
  return {
    productId: row.product_id,
    baseUom: row.base_uom,
    availableBaseQty: Number(row.available_base_qty),
    isLowStock: row.is_low_stock,
    openBatchCount: row.open_batch_count,
    batchId: row.featured_batch_id,
    batchCode: row.featured_batch_code,
    labThcPct: row.lab_thc_pct === null ? null : Number(row.lab_thc_pct),
    labCbdPct: row.lab_cbd_pct === null ? null : Number(row.lab_cbd_pct),
    terpeneProfile: row.terpene_profile ?? {},
    promoVideoUrl: row.promo_video_url,
    promoPosterUrl: row.promo_poster_url,
    updatedAt: row.updated_at,
  };
}

function isConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * Trim this cart against a fresh snapshot.
 *
 * Lines are walked in cart order and each is granted what the remaining budget
 * can fill, so two lines of the same product (a 3.5 g and a 7 g, say) degrade
 * predictably from the front rather than both being halved.
 */
function reconcileCart(snapshot: StockSnapshot): string | null {
  const { lines, setLineQuantity, removeLine } = useCartStore.getState();
  const affected = lines.filter((line) => line.productId === snapshot.productId);
  if (affected.length === 0) return null;

  let budget = snapshot.availableBaseQty;
  let trimmed = false;
  let dropped = false;

  for (const line of affected) {
    const perUnit = cartLineUnitBaseQty(line);
    const fillable = perUnit <= 0 ? 0 : Math.floor(budget / perUnit);
    const allowed = Math.min(line.quantity, Math.max(0, fillable));

    if (allowed <= 0) {
      removeLine(line.key);
      dropped = true;
      continue;
    }

    if (allowed < line.quantity) {
      setLineQuantity(line.key, allowed);
      trimmed = true;
    }

    budget -= allowed * perUnit;
  }

  if (!trimmed && !dropped) return null;

  const left = `${snapshot.availableBaseQty.toFixed(UOM_PRECISION[snapshot.baseUom])} ${
    UOM_SYMBOL[snapshot.baseUom]
  }`;

  return dropped
    ? `Allocated out while you were shopping — ${left} left in the open batch.`
    : `Reduced to the ${left} still in the open batch.`;
}

export interface UseStockBoardSyncOptions {
  /** Limit the subscription to one branch. Omit to watch every branch. */
  branchId?: string | null;
  /** Set false to hold the socket closed (e.g. on an unauthenticated view). */
  enabled?: boolean;
  /** Set false to watch stock without touching cart lines. */
  reconcile?: boolean;
}

export function useStockBoardSync(
  options: UseStockBoardSyncOptions = {},
): StockBoardSync {
  const { branchId = null, enabled = true, reconcile = true } = options;

  const [board, setBoard] = useState<Record<string, StockSnapshot>>({});
  const [status, setStatus] = useState<StockSyncStatus>('CONNECTING');
  const [error, setError] = useState<string | null>(null);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<Record<string, string>>({});

  // Read in the subscription callback without re-subscribing when it flips.
  const reconcileRef = useRef(reconcile);
  useEffect(() => {
    reconcileRef.current = reconcile;
  }, [reconcile]);

  const ingest = useCallback((row: ProductStockBoardRow) => {
    const snapshot = toSnapshot(row);

    setBoard((current) => ({ ...current, [snapshot.productId]: snapshot }));
    setLastEventAt(snapshot.updatedAt);

    if (!reconcileRef.current) return;

    const warning = reconcileCart(snapshot);
    if (warning) {
      setWarnings((current) => ({ ...current, [snapshot.productId]: warning }));
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStatus('DISABLED');
      return;
    }
    if (!isConfigured()) {
      // No credentials: the demo engine owns stock in this mode.
      setStatus('DISABLED');
      return;
    }

    let cancelled = false;
    const supabase = createCartelBrowserClient();
    setStatus('CONNECTING');

    // Seed from a plain read, so the first paint already knows the stock.
    const seed = async () => {
      const query = supabase.from('product_stock_board').select('*');
      const { data, error: readError } = branchId
        ? await query.eq('branch_id', branchId)
        : await query;

      if (cancelled) return;

      if (readError) {
        setError(readError.message);
        setStatus('ERROR');
        return;
      }

      setBoard(
        (data ?? []).reduce<Record<string, StockSnapshot>>((accumulator, row) => {
          const snapshot = toSnapshot(row);
          accumulator[snapshot.productId] = snapshot;
          return accumulator;
        }, {}),
      );
    };

    void seed();

    const channel = supabase
      .channel(`cartel-stock-board${branchId ? `:${branchId}` : ''}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'product_stock_board',
          ...(branchId ? { filter: `branch_id=eq.${branchId}` } : {}),
        },
        (payload) => {
          if (cancelled) return;

          // A removed board row means the product has no batches here at all.
          if (payload.eventType === 'DELETE') {
            const old = payload.old as Partial<ProductStockBoardRow>;
            if (!old?.product_id) return;
            const productId = old.product_id;
            setBoard((current) => {
              const next = { ...current };
              delete next[productId];
              return next;
            });
            return;
          }

          const row = payload.new as ProductStockBoardRow | null;
          if (row?.product_id) ingest(row);
        },
      )
      .subscribe((state) => {
        if (cancelled) return;
        if (state === 'SUBSCRIBED') {
          setStatus('LIVE');
          setError(null);
        } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') {
          setStatus('ERROR');
          setError('Live stock feed dropped. Prices and stock are re-checked at checkout.');
        }
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [branchId, enabled, ingest]);

  const dismissWarning = useCallback((productId: string) => {
    setWarnings((current) => {
      if (!current[productId]) return current;
      const next = { ...current };
      delete next[productId];
      return next;
    });
  }, []);

  /**
   * Safe as written: `state.lines` is a stored reference, so its identity holds
   * between renders unless the cart genuinely changed.
   *
   * Do NOT derive inside this selector. zustand v5 passes it straight to
   * useSyncExternalStore with no equality check, so returning a filtered or
   * mapped list — `state.lines.filter(...)` — builds a new array every call and
   * loops forever. That is what crashed <CartDrawer> on /shop. Filter below,
   * in `headroomFor`, where the result is memoised against `lines`.
   */
  const lines = useCartStore((state) => state.lines);

  const snapshotFor = useCallback(
    (productId: string) => board[productId] ?? null,
    [board],
  );

  const headroomFor = useCallback(
    (productId: string) => {
      const snapshot = board[productId];
      if (!snapshot) return null;
      const committed = lines
        .filter((line) => line.productId === productId)
        .reduce((total, line) => total + cartLineBaseQty(line), 0);
      return Math.max(0, snapshot.availableBaseQty - committed);
    },
    [board, lines],
  );

  return useMemo(
    () => ({
      board,
      status,
      error,
      lastEventAt,
      warnings,
      dismissWarning,
      snapshotFor,
      headroomFor,
    }),
    [board, status, error, lastEventAt, warnings, dismissWarning, snapshotFor, headroomFor],
  );
}

export default useStockBoardSync;
