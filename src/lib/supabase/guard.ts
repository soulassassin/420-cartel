import 'server-only';

import { redirect } from 'next/navigation';

import {
  ANONYMOUS_VIEWER,
  getViewer,
  isSupabaseServerConfigured,
  type CartelViewer,
} from '@/lib/supabase/server';

/**
 * 420 CARTEL :: staff surface guard
 *
 * One decision point for "may this request see a staff surface", so the answer
 * cannot drift between /pos, /admin and the API routes.
 *
 * Layering, outermost first — each layer is independently sufficient:
 *
 *   1. middleware.ts   bounces non-staff before a staff shell is ever rendered
 *   2. these guards    re-check during render, for direct navigations and for
 *                      anything middleware's matcher does not cover
 *   3. Postgres RLS    the only boundary that actually protects the DATA
 *
 * The nav's staff-group filtering is NOT in this list on purpose: hiding a
 * link is cosmetic, and is treated as such.
 */

/**
 * Whether staff surfaces are deliberately unlocked for a credential-free demo.
 *
 * This matters more than it looks. `next.config.ts` falls back to a static
 * export when Supabase env vars are absent, so "no credentials configured"
 * is a shape this project really does deploy in — and if that implicitly
 * unlocked the POS and the KYC queue, an unconfigured production deploy would
 * publish the member register to the open internet.
 *
 * So the bypass never fires on an implicit condition in production. It needs
 * either a development build, or an explicit, deliberate opt-in env var that
 * nobody sets by accident.
 */
export function isStaffPreviewUnlocked(): boolean {
  // With Supabase configured there is a real identity to check. Always check it.
  if (isSupabaseServerConfigured()) return false;
  if (process.env.NEXT_PUBLIC_CARTEL_DEMO_UNLOCK === '1') return true;
  return process.env.NODE_ENV !== 'production';
}

export interface StaffGate {
  viewer: CartelViewer;
  /** True when the surface was opened in credential-free demo mode. */
  previewUnlocked: boolean;
}

/**
 * Gate a surface on an active staff profile. Redirects to the operator login
 * rather than rendering anything, so no staff shell flashes before the bounce.
 */
export async function requireStaff(): Promise<StaffGate> {
  if (isStaffPreviewUnlocked()) {
    return { viewer: ANONYMOUS_VIEWER, previewUnlocked: true };
  }

  const viewer = await getViewer();
  if (!viewer.isStaff) redirect('/admin/login');

  return { viewer, previewUnlocked: false };
}

/**
 * Gate a surface on OWNER or MANAGER. A signed-in budtender is sent back to
 * the hub they ARE allowed to see, not to the login screen — being bounced to
 * a sign-in form while already correctly signed in reads as a broken app.
 */
export async function requireManager(fallbackPath = '/admin'): Promise<StaffGate> {
  if (isStaffPreviewUnlocked()) {
    return { viewer: ANONYMOUS_VIEWER, previewUnlocked: true };
  }

  const viewer = await getViewer();
  if (!viewer.isStaff) redirect('/admin/login');
  if (!viewer.isManager) redirect(fallbackPath);

  return { viewer, previewUnlocked: false };
}
