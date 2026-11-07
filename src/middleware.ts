import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/types/database';
import { REFERRAL_COOKIE, REFERRAL_COOKIE_MAX_AGE, affiliateTracker } from '@/lib/loyalty';

/**
 * Middleware does three jobs:
 *
 *  1. Refreshes the Supabase session cookie so Server Components always see a
 *     live token (the server client cannot write cookies during render).
 *  2. Captures `?ref=CARTEL-XXXX` into a first-party cookie for attribution at
 *     signup and at checkout.
 *  3. Coarse route gating — a cheap redirect so signed-out visitors never see a
 *     POS or admin shell flash before the page's own check runs. RLS in
 *     Postgres is the real boundary; this is only about not wasting a render.
 */

const MEMBER_ROUTES = ['/shop', '/checkout', '/account', '/pass'];
const STAFF_ROUTES = ['/pos', '/admin'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Capture referral attribution before anything can redirect away.
  const rawRef = request.nextUrl.searchParams.get('ref');
  if (rawRef) {
    const code = affiliateTracker.normalizeCode(rawRef);
    if (code) {
      response.cookies.set({
        name: REFERRAL_COOKIE,
        value: code,
        maxAge: REFERRAL_COOKIE_MAX_AGE,
        httpOnly: false, // read by the onboarding form as well as the server
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      });
    }
  }

  // Without Supabase configured, let every request through untouched rather
  // than locking the developer out of their own app.
  if (!url || !anonKey) return response;

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() (not getSession()) revalidates the JWT against the auth server.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const needsMember = MEMBER_ROUTES.some((route) => path.startsWith(route));
  const needsStaff = STAFF_ROUTES.some((route) => path.startsWith(route));

  if ((needsMember || needsStaff) && !user) {
    const target = request.nextUrl.clone();
    target.pathname = needsStaff ? '/staff-login' : '/onboarding';
    target.searchParams.set('next', path);
    return NextResponse.redirect(target);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals and static assets — the session cookie
     * must be refreshed on page requests, not on every image fetch.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|mp4|webm|glb|ktx2)$).*)',
  ],
};
