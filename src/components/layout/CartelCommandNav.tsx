'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Boxes,
  ChevronUp,
  CreditCard,
  Gem,
  IdCard,
  Menu,
  ScanLine,
  Store,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { IS_LOCAL_PREVIEW } from '@/lib/data/source';

/**
 * 420 Cartel command bar.
 *
 * A floating, numbered index of every surface in the platform — the operator's
 * way to move between the storefront, the till and the back office without
 * typing URLs. Collapses to a single gold tab so it never covers the 3D vault
 * or a POS ticket.
 */

interface NavEntry {
  index: string;
  label: string;
  href: string;
  icon: typeof Gem;
  group: 'MEMBER' | 'FLOOR' | 'ADMIN';
}

const NAV: NavEntry[] = [
  { index: '01', label: '3D Vault', href: '/', icon: Gem, group: 'MEMBER' },
  { index: '02', label: 'Onboarding & Pass', href: '/onboarding', icon: IdCard, group: 'MEMBER' },
  { index: '03', label: 'Private Dispensary', href: '/shop', icon: Store, group: 'MEMBER' },
  { index: '04', label: 'Checkout & Delivery', href: '/checkout', icon: CreditCard, group: 'MEMBER' },
  { index: '05', label: 'POS Terminal', href: '/pos', icon: ScanLine, group: 'FLOOR' },
  { index: '06', label: 'Inventory & Higgsfield', href: '/admin/inventory', icon: Boxes, group: 'ADMIN' },
  { index: '07', label: 'CRM & KYC Queue', href: '/admin/crm', icon: Users, group: 'ADMIN' },
  { index: '08', label: 'Loyalty & Affiliates', href: '/admin/loyalty', icon: Trophy, group: 'ADMIN' },
];

const GROUP_LABEL: Record<NavEntry['group'], string> = {
  MEMBER: 'Member Surfaces',
  FLOOR: 'Shop Floor',
  ADMIN: 'Back Office',
};

export function CartelCommandNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Navigating closes the panel; Escape does too.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const active = NAV.find((entry) =>
    entry.href === '/' ? pathname === '/' : pathname.startsWith(entry.href),
  );

  const groups: NavEntry['group'][] = ['MEMBER', 'FLOOR', 'ADMIN'];

  return (
    <>
      {/* The collapsed tab — always reachable, never in the way. */}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="cartel-command-panel"
        className={cn(
          'fixed bottom-4 left-4 z-50 flex items-center gap-2.5 border px-4 py-2.5 font-mono text-[0.625rem] uppercase tracking-[0.24em] transition-all duration-300 ease-cartel print:hidden',
          open
            ? 'border-gold bg-gold text-void'
            : 'border-[color:var(--border-hard)] bg-glass text-gold backdrop-blur-md hover:bg-gold hover:text-void',
        )}
      >
        {open ? <X className="size-3.5" /> : <Menu className="size-3.5" />}
        <span className="hidden sm:inline">{active ? `${active.index} ${active.label}` : 'Command'}</span>
        <span className="sm:hidden">{active?.index ?? 'NAV'}</span>
        {!open ? <ChevronUp className="size-3" /> : null}
      </button>

      {/* Scrim */}
      {open ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-void/70 backdrop-blur-sm print:hidden"
        />
      ) : null}

      <nav
        id="cartel-command-panel"
        aria-label="420 Cartel platform navigation"
        aria-hidden={!open}
        className={cn(
          'fixed bottom-16 left-4 z-50 w-[min(22rem,calc(100vw-2rem))] origin-bottom-left border border-[color:var(--border-hard)] bg-glass backdrop-blur-xl transition-all duration-300 ease-cartel print:hidden',
          open
            ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none translate-y-3 scale-95 opacity-0',
        )}
      >
        <div className="flex items-center justify-between border-b border-[color:var(--border-mono)] px-4 py-3">
          <span className="font-mono text-[0.5625rem] uppercase tracking-[0.3em] text-gold">
            Cartel Command
          </span>
          {IS_LOCAL_PREVIEW ? (
            <span className="border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.2em] text-amber-300">
              Local Preview
            </span>
          ) : (
            <span className="border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.2em] text-emerald-300">
              Live Data
            </span>
          )}
        </div>

        <div className="max-h-[70vh] overflow-y-auto cartel-scroll py-2">
          {groups.map((group) => (
            <div key={group} className="px-2 py-1.5">
              <p className="px-2 py-1.5 font-mono text-[0.5rem] uppercase tracking-[0.3em] text-faint">
                {GROUP_LABEL[group]}
              </p>
              {NAV.filter((entry) => entry.group === group).map((entry) => {
                const isActive = active?.href === entry.href;
                const Icon = entry.icon;
                return (
                  <Link
                    key={entry.href}
                    href={entry.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 border px-3 py-2.5 transition-colors duration-200',
                      isActive
                        ? 'border-gold/60 bg-gold/10 text-gold'
                        : 'border-transparent text-muted-foreground hover:border-[color:var(--border-mono)] hover:bg-white/[0.03] hover:text-foreground',
                    )}
                  >
                    <span className="font-mono text-[0.625rem] tabular-nums text-faint">
                      {entry.index}
                    </span>
                    <Icon className="size-4 shrink-0" />
                    <span className="font-mono text-[0.6875rem] uppercase tracking-[0.16em]">
                      {entry.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}

export default CartelCommandNav;
