'use client';

import { useEffect, useMemo, useRef } from 'react';
import { syncCartReservations } from '@/lib/data/source';
import { DEFAULT_BRANCH_ID } from '@/lib/demo/fixtures';
import { cartLineBaseQty, useCartStore, type CartLine } from '@/lib/store/cart';
import { useSessionStore } from '@/lib/store/session';
import { roundBaseQty } from '@/lib/uom';
import type { BaseUom } from '@/types/database';

export function aggregateCartHolds(
  lines: readonly CartLine[],
): { productId: string; baseQty: number }[] {
  const byProduct = new Map<string, { uom: BaseUom; qty: number }>();
  for (const line of lines) {
    const existing = byProduct.get(line.productId);
    const lineQty = cartLineBaseQty(line);
    if (existing) {
      existing.qty += lineQty;
    } else {
      byProduct.set(line.productId, { uom: line.baseUom, qty: lineQty });
    }
  }
  return Array.from(byProduct.entries())
    .map(([productId, entry]) => ({
      productId,
      baseQty: roundBaseQty(entry.qty, entry.uom),
    }))
    .filter((item) => item.baseQty > 0);
}

/**
 * Keeps `inventory_reservations` / `master_batches.reserved_base_qty`
 * synchronized in real time with the member's active crate and branch.
 */
export function useCartReservationSync(): void {
  const cartSessionId = useCartStore((state) => state.cartSessionId);
  const branchId = useCartStore((state) => state.branchId) ?? DEFAULT_BRANCH_ID;
  const lines = useCartStore((state) => state.lines);
  const setSyncedHolds = useCartStore((state) => state.setSyncedHolds);
  const member = useSessionStore((state) => state.member);

  const memberLabel = useMemo(
    () =>
      member
        ? `${member.first_name} ${member.last_name} (${member.member_code})`
        : 'Walk-in / Guest Crate',
    [member],
  );

  const items = useMemo(() => aggregateCartHolds(lines), [lines]);
  const signature = useMemo(
    () => JSON.stringify({ cartSessionId, branchId, memberLabel, items }),
    [cartSessionId, branchId, memberLabel, items],
  );

  const lastSyncedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!cartSessionId || !branchId) return;
    if (lastSyncedRef.current === signature) return;
    if (lastSyncedRef.current === null && items.length === 0) {
      lastSyncedRef.current = signature;
      return;
    }

    lastSyncedRef.current = signature;
    let cancelled = false;

    void syncCartReservations({
      cartSessionId,
      branchId,
      items,
      memberLabel,
    })
      .then(() => {
        if (cancelled) return;
        const map: Record<string, number> = {};
        for (const item of items) {
          map[item.productId] = item.baseQty;
        }
        setSyncedHolds(branchId, map);
      })
      .catch(() => {
        // Non-fatal background sync; checkout re-validates under row locks.
      });

    return () => {
      cancelled = true;
    };
  }, [cartSessionId, branchId, items, memberLabel, setSyncedHolds, signature]);
}
