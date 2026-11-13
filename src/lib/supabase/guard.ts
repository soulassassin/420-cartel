import 'server-only';

import { cookies } from 'next/headers';
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
 *   1. proxy.ts        bounces non-staff before a staff shell is ever rendered
 *   2. these guards    re-check during render, for direct navigations and for
 *                      anything the proxy matcher does not cover
 *   3. Postgres RLS    the only boundary that actually protects the DATA
 *
 * The nav's staff-group filtering is NOT in this list on purpose: hiding a
 * link is cosmetic, and is treated as such.
 */

/**
 * Whether staff surfaces are deliberately unlocked for a credential-free demo.
 *
 * Evaluates true if:
 *  - NEXT_PUBLIC_CARTEL_DEMO_UNLOCK is set to '1'
 *  - cartel_demo_mode cookie is 'true'
 *  - Supabase server credentials are not configured
 */
export async function isStaffPreviewUnlocked(): Promise<boolean> {
  if (process.env.NEXT_PUBLIC_CARTEL_DEMO_UNLOCK === '1') return true;
  try {
    const cookieStore = await cookies();
    if (cookieStore.get('cartel_demo_mode')?.value === 'true') return true;
  } catch {
    // outside request scope
  }
  if (!isSupabaseServerConfigured()) return true;
  return false;
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
  if (await isStaffPreviewUnlocked()) {
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
  if (await isStaffPreviewUnlocked()) {
    return { viewer: ANONYMOUS_VIEWER, previewUnlocked: true };
  }

  const viewer = await getViewer();
  if (!viewer.isStaff) redirect('/admin/login');
  if (!viewer.isManager) redirect(fallbackPath);

  return { viewer, previewUnlocked: false };
}
