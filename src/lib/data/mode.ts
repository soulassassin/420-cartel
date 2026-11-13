/**
 * Demo / local-preview switches. Kept free of imports so the site nav can read
 * them on every page without pulling Supabase or the demo engine into the
 * shared bundle. `@/lib/data/source` re-exports all of these.
 */

export type DataMode = 'SUPABASE' | 'LOCAL';

export function isDemoModeActive(): boolean {
  if (typeof window !== 'undefined') {
    try {
      if (window.localStorage.getItem('cartel-demo-mode') === 'true') return true;
      if (document.cookie.includes('cartel_demo_mode=true')) return true;
      const params = new URLSearchParams(window.location.search);
      if (params.get('demo') === '1' || params.get('demo') === 'true') return true;
    } catch {
      // Storage or cookie read blocked
    }
  }
  if (process.env.NEXT_PUBLIC_CARTEL_DEMO_UNLOCK === '1') return true;
  return !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export function setDemoMode(enabled: boolean): void {
  if (typeof window !== 'undefined') {
    try {
      if (enabled) {
        window.localStorage.setItem('cartel-demo-mode', 'true');
        document.cookie = 'cartel_demo_mode=true; path=/; max-age=86400; SameSite=Lax';
      } else {
        window.localStorage.removeItem('cartel-demo-mode');
        document.cookie = 'cartel_demo_mode=; path=/; max-age=0; SameSite=Lax';
      }
    } catch {
      // storage blocked
    }
  }
}

export function dataMode(): DataMode {
  return isDemoModeActive() ? 'LOCAL' : 'SUPABASE';
}

export const IS_LOCAL_PREVIEW =
  process.env.NEXT_PUBLIC_CARTEL_DEMO_UNLOCK === '1' ||
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function isLocalMode(): boolean {
  return IS_LOCAL_PREVIEW || isDemoModeActive();
}
