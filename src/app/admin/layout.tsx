import type { ReactNode } from 'react';

import { requireStaff } from '@/lib/supabase/guard';

/**
 * Back-office gate.
 *
 * A layout rather than a per-page check: /admin, /admin/inventory and
 * /admin/loyalty had no guard of their own at all, and a layout means the next
 * admin page added inherits the gate instead of having to remember it.
 *
 * /admin/crm keeps its own `redirect` too. That is deliberate duplication —
 * a guard that only exists in a parent layout is one refactor away from being
 * silently dropped.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireStaff();

  // `shell-operational` only tightens UI type so tables hold their data.
  return <div className="shell-operational contents">{children}</div>;
}
