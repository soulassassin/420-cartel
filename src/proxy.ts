import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/types/database';
import { REFERRAL_COOKIE, REFERRAL_COOKIE_MAX_AGE, affiliateTracker } from '@/lib/loyalty';

/**
 * The proxy does three jobs:
 *
 *  1. Refreshes the Supabase session cookie so Server Components always see a
 *     live token (the server client cannot write cookies during render).
 *  2. Captures `?ref=CARTEL-XXXX` into a first-party cookie for attribution at
 *     signup and at checkout.
 *  3. Coarse route gating — a cheap redirect so signed-out visitors never see a
 *     POS or admin shell flash before the page's own check runs. RLS in
 *     Postgres is the real boundary; this is only about not wasting a render.
 */

const MEMBER_ROUTES = ['/vault', '/shop', '/checkout', '/account', '/pass'];
const STAFF_ROUTES = ['/pos', '/admin'];
/** The one place staff sign in. It sits under /admin but must stay reachable signed out. */
const STAFF_LOGIN = '/admin/login';

export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);
  let response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

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

  // Demo mode detection: query param, cookie, or explicit environment opt-in
  const demoParam = request.nextUrl.searchParams.get('demo');
  const isDemoParamActive = demoParam === '1' || demoParam === 'true';
  const isDemoParamInactive = demoParam === '0' || demoParam === 'false';

  if (isDemoParamActive) {
    response.cookies.set({
      name: 'cartel_demo_mode',
      value: 'true',
      maxAge: 86400,
      sameSite: 'lax',
      path: '/',
    });
  } else if (isDemoParamInactive) {
    response.cookies.set({
      name: 'cartel_demo_mode',
      value: '',
      maxAge: 0,
      path: '/',
    });
  }

  const isDemo =
    (isDemoParamActive ||
      request.cookies.get('cartel_demo_mode')?.value === 'true' ||
      process.env.NEXT_PUBLIC_CARTEL_DEMO_UNLOCK === '1') &&
    !isDemoParamInactive;

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
        response = NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() (not getSession()) revalidates the JWT against the auth server.
  // That is a network round trip on every page request, so it is skipped when
  // the browser holds no Supabase auth cookie at all: with no token there is
  // nobody to validate and no session to refresh, and the visitor is simply
  // signed out. Anonymous traffic to the public pages no longer waits on it.
  const hasAuthCookie = request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token'));
  const user = hasAuthCookie ? (await supabase.auth.getUser()).data.user : null;

  const path = request.nextUrl.pathname;
  const needsMember = !isDemo && MEMBER_ROUTES.some((route) => path.startsWith(route));
  const needsStaff =
    !isDemo &&
    path !== STAFF_LOGIN &&
    STAFF_ROUTES.some((route) => path.startsWith(route));

  // The Vault sends strangers to Membership; profile pages ask them to log in.
  if ((needsMember || needsStaff) && !user) {
    const target = request.nextUrl.clone();
    const profilePage = path.startsWith('/account') || path.startsWith('/pass');
    target.pathname = needsStaff ? STAFF_LOGIN : profilePage ? '/login' : '/onboarding';
    if (needsStaff) {
      // Carry the query inside `next` (e.g. /admin/pos?member=CARTEL-0420), so
      // a scanned member pass still opens that member once the operator signs in.
      target.search = '';
      target.searchParams.set('next', path + request.nextUrl.search);
    } else {
      target.searchParams.set('next', path);
    }
    return NextResponse.redirect(target);
  }

  // Having an account is not the same as having signed up: without a member
  // row, onboarding is unfinished. Staff are exempt.
  if (needsMember) {
    const [{ data: member }, { data: staff }] = await Promise.all([
      supabase.from('members').select('id').eq('id', user!.id).maybeSingle(),
      supabase.from('staff_profiles').select('is_active').eq('id', user!.id).maybeSingle(),
    ]);

    if (!member && !staff?.is_active) {
      const target = request.nextUrl.clone();
      target.pathname = '/onboarding';
      target.search = '';
      return NextResponse.redirect(target);
    }
  }

  // Being signed in is NOT the same as being staff. Without this, any member
  // with an account could open the POS terminal and the KYC review queue just
  // by typing the URL — every member's ID document sits behind that route.
  // `staff_read_self_and_colleagues` means a non-staff caller simply reads no
  // row here rather than erroring, so a missing row is the denial.
  if (needsStaff) {
    const { data: staff } = await supabase
      .from('staff_profiles')
      .select('is_active')
      .eq('id', user!.id)
      .maybeSingle();

    if (!staff?.is_active) {
      const target = request.nextUrl.clone();
      target.pathname = '/';
      target.search = '';
      return NextResponse.redirect(target);
    }
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
