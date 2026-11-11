import type { ReactNode } from 'react';

import { PosPinGate } from '@/components/pos/PosPinGate';
import { requireStaff } from '@/lib/supabase/guard';

/**
 * Counter terminal gate, in two stages.
 *
 * Server side: an active staff profile, same as the back office. The POS page
 * itself is a client component, so this layout is the only place a
 * server-side check can happen before its shell renders.
 *
 * Client side: `PosPinGate` then asks for the operator's counter PIN. That
 * second stage exists because of how this terminal is actually used — a
 * tablet on a shop floor that stays signed in for a whole shift, within reach
 * of customers. The session proves the BRANCH is authorised; the PIN proves
 * who is standing at it right now.
 */
export default async function PosLayout({ children }: { children: ReactNode }) {
  const { previewUnlocked } = await requireStaff();

  // `shell-operational` only tightens UI type so the till holds its data.
  return (
    <div className="shell-operational contents">
      <PosPinGate previewUnlocked={previewUnlocked}>{children}</PosPinGate>
    </div>
  );
}
