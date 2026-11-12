'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { BrandLogo } from '@/components/layout/BrandLogo';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, User, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IS_LOCAL_PREVIEW, isDemoModeActive } from '@/lib/data/source';
import { createCartelBrowserClient } from '@/lib/supabase/client';
import { useSessionStore } from '@/lib/store/session';

/**
 * Site navigation, identical on every page: brand logo at left, all links visible at
 * right on desktop (white, gold on hover), slide-over drawer on mobile.
 *
 * Ordered links:
 *  1. Home (/)
 *  2. About (/about)
 *  3. Membership (/onboarding)
 *  4. Vault (/vault)
 *  5. Contact (/contact)
 *
 * Profile icon links to /account. Explicit "Log in" link rendered for unauthenticated visitors.
 * When signed in, member code or "Dossier" badge is displayed.
 *
 * The POS, IMS and Admin links are hidden from the menu while the site is being
 * presented to a client (see SHOW_STAFF_LINKS); those surfaces are reached
 * through the Demo Hub, or directly at /admin/login.
 */

const LINKS = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'Membership', href: '/onboarding' },
  { label: 'Vault', href: '/vault' },
  { label: 'Contact', href: '/contact' },
];

const STAFF_LINKS = [
  { label: 'POS', href: '/pos' },
  { label: 'IMS', href: '/admin/inventory' },
  { label: 'Admin', href: '/admin' },
];

/**
 * Client-presentation switch. While false, POS / IMS / Admin never appear in
 * the desktop menu or the mobile drawer, for anyone. Set to true to show them
 * to signed-in staff again.
 */
const SHOW_STAFF_LINKS = false;

export function CartelCommandNav() {
  const pathname = usePathname();
  const [isStaff, setIsStaff] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const member = useSessionStore((state) => state.member);

  // Scroll lock when mobile drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Close drawer on pathname change
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Close drawer on Escape keydown
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isDemoModeActive() || IS_LOCAL_PREVIEW) {
      setIsStaff(true);
      return;
    }
    let cancelled = false;

    void (async () => {
      try {
        const supabase = createCartelBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled) return;

        const session = useSessionStore.getState();
        if (!user) {
          if (session.member) session.signOut();
          return;
        }

        const [{ data: staff }, { data: member }] = await Promise.all([
          supabase.from('staff_profiles').select('is_active').eq('id', user.id).maybeSingle(),
          supabase.from('members').select('*').eq('id', user.id).maybeSingle(),
        ]);
        if (cancelled) return;

        setIsStaff(Boolean(staff?.is_active));
        if (member) session.signIn(member);
      } catch {
        // Leave the staff links hidden.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const showStaffLinks = SHOW_STAFF_LINKS && isStaff;
  const links = showStaffLinks ? [...LINKS, ...STAFF_LINKS] : LINKS;
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const profileActive = ['/account', '/login', '/pass'].some((href) => pathname.startsWith(href));

  return (
    <header className="relative flex items-center justify-between gap-6 bg-void px-4 pb-4 pt-6 print:hidden md:px-12 md:pb-6 md:pt-8">
      {/* Brand logo, alone, at the same size on every page */}
      <Link href="/" aria-label="420 Cartel home" className="brand-mark block shrink-0">
        <div className="brand-mark-inner flex items-center gap-3">
          <div className="relative size-10 overflow-hidden rounded-full border border-gold/30 md:hidden">
            <Image
              src="/fourtwentycartel_logo.jpg"
              alt="420 Cartel"
              fill
              sizes="40px"
              className="object-cover"
              priority
            />
          </div>
          <BrandLogo priority className="hidden md:block" />
        </div>
      </Link>

      {/* Desktop navigation: every option visible, white, gold on hover */}
      <nav aria-label="Main" className="hidden md:flex items-center gap-x-6 lg:gap-x-10">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isActive(link.href) ? 'page' : undefined}
            className="nav-link text-[19px]"
          >
            {link.label}
          </Link>
        ))}

        {!member ? (
          <Link
            href="/login"
            aria-current={isActive('/login') ? 'page' : undefined}
            className="nav-link text-[19px]"
          >
            Log in
          </Link>
        ) : (
          <Link
            href="/account"
            aria-current={profileActive ? 'page' : undefined}
            className="nav-link font-mono text-[14px] uppercase tracking-wider"
          >
            {member.member_code ? member.member_code : 'Dossier'}
          </Link>
        )}

        <Link
          href="/demo"
          aria-current={isActive('/demo') ? 'page' : undefined}
          className="inline-flex items-center gap-1.5 rounded border border-gold/40 bg-gold/10 px-2.5 py-1 font-mono text-[13px] uppercase tracking-wider text-gold hover:border-gold hover:bg-gold/20 transition-colors"
        >
          <span className="size-1.5 rounded-full bg-gold animate-pulse" />
          Demo Hub
        </Link>

        <Link
          href="/account"
          aria-label="Your profile"
          aria-current={profileActive ? 'page' : undefined}
          className="nav-icon flex h-11 w-11 items-center justify-center"
        >
          <User className="size-6" strokeWidth={1.5} />
        </Link>
      </nav>

      {/* Mobile menu button */}
      <button
        type="button"
        aria-label="Open navigation"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className="nav-icon flex h-11 w-11 items-center justify-center md:hidden"
      >
        <Menu className="size-6" />
      </button>

      {/* Slide-over drawer: mobile only */}
      <div
        className={cn(
          'fixed inset-0 z-50 transition-opacity duration-300 ease-in-out md:hidden',
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        aria-hidden={!isOpen}
      >
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-void/80 backdrop-blur-sm transition-opacity"
          onClick={() => setIsOpen(false)}
        />

        {/* Drawer panel */}
        <div
          className={cn(
            'fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-void border-l border-foreground/10 flex flex-col justify-between p-6 transition-transform duration-300 ease-in-out shadow-2xl',
            isOpen ? 'translate-x-0' : 'translate-x-full'
          )}
        >
          <div>
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-6 border-b border-foreground/10">
              <Link
                href="/"
                onClick={() => setIsOpen(false)}
                aria-label="420 Cartel home"
                className="flex items-center gap-3"
              >
                <div className="relative size-10 overflow-hidden rounded-full border border-gold/30">
                  <Image
                    src="/fourtwentycartel_logo.jpg"
                    alt="420 Cartel"
                    fill
                    sizes="40px"
                    className="object-cover"
                  />
                </div>
                <BrandLogo />
              </Link>
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setIsOpen(false)}
                className="flex h-11 w-11 items-center justify-center text-ash hover:text-white transition-colors"
              >
                <X className="size-6" />
              </button>
            </div>

            {/* Navigation Links in exact order */}
            <nav className="flex flex-col gap-1 py-6">
              <Link
                href="/demo"
                onClick={() => setIsOpen(false)}
                className="mb-3 flex items-center justify-between rounded border border-gold/40 bg-gold/10 px-3.5 py-2.5 font-mono text-sm uppercase tracking-wider text-gold hover:bg-gold/20"
              >
                <span className="flex items-center gap-2">
                  <span className="size-2 animate-pulse rounded-full bg-gold" />
                  Launch Demo Hub
                </span>
                <span className="text-xs text-ash">&rarr;</span>
              </Link>

              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  aria-current={isActive(link.href) ? 'page' : undefined}
                  className="nav-link w-fit py-2 font-display text-2xl uppercase tracking-wide"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Profile & Auth Section */}
          <div className="pt-6 border-t border-foreground/10 flex flex-col gap-3">
            {!member ? (
              <div className="flex flex-col gap-3">
                <Link
                  href="/login"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-center py-3 px-4 border border-foreground/20 text-white font-sans text-base uppercase tracking-wider hover:border-foreground transition-colors"
                >
                  Log in
                </Link>
                <Link
                  href="/onboarding"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-center py-3 px-4 bg-gold text-black font-sans text-base uppercase tracking-wider font-semibold hover:bg-gold-bright transition-colors"
                >
                  Apply for Membership
                </Link>
                <Link
                  href="/account"
                  aria-label="Your profile"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-2 py-2 text-sm text-ash hover:text-white transition-colors"
                >
                  <User className="size-4" />
                  <span>Profile &amp; Settings</span>
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between py-2">
                  <span className="font-mono text-xs uppercase tracking-widest text-ash">Member Dossier</span>
                  <span className="font-mono text-sm text-white font-bold">{member.member_code || 'ACTIVE'}</span>
                </div>
                <Link
                  href="/account"
                  aria-label="Your profile"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-2 py-3 px-4 border border-foreground/20 text-white font-sans text-base uppercase tracking-wider hover:border-foreground transition-colors justify-center"
                >
                  <User className="size-5" />
                  <span>Member Account</span>
                </Link>
                <Link
                  href="/pass"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-center py-3 px-4 bg-gold text-black font-sans text-base uppercase tracking-wider font-semibold hover:bg-gold-bright transition-colors"
                >
                  Digital Membership Pass
                </Link>
              </div>
            )}

            {/* Staff links if staff session */}
            {showStaffLinks ? (
              <div className="pt-3 border-t border-foreground/10 flex flex-col gap-2">
                <span className="font-mono text-[10px] uppercase tracking-widest text-ash">Staff Operations</span>
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/admin/pos"
                    onClick={() => setIsOpen(false)}
                    className="py-2 text-center border border-foreground/20 text-xs font-mono uppercase tracking-wider text-ash hover:text-white hover:border-white transition-colors"
                  >
                    POS Terminal
                  </Link>
                  <Link
                    href="/admin"
                    onClick={() => setIsOpen(false)}
                    className="py-2 text-center border border-foreground/20 text-xs font-mono uppercase tracking-wider text-ash hover:text-white hover:border-white transition-colors"
                  >
                    Back Office
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

export default CartelCommandNav;
