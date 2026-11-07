import Link from 'next/link';
import { ArrowRight, Boxes, ScanLine, Trophy, Users } from 'lucide-react';
import { Card, Eyebrow } from '@/components/ui/surfaces';

const MODULES = [
  {
    index: '01',
    title: 'Inventory & Higgsfield AI',
    href: '/admin/inventory',
    description:
      'Multi-UOM master batch balances (g, ml, units), immutable FIFO movement ledger, and 9:16 Higgsfield AI promo video studio.',
    icon: Boxes,
  },
  {
    index: '02',
    title: 'Member CRM & KYC Queue',
    href: '/admin/crm',
    description:
      'Review 18+ South African ID and passport KYC applications, promote VIP standing, and adjust member store credit.',
    icon: Users,
  },
  {
    index: '03',
    title: 'Loyalty & Affiliate Ledger',
    href: '/admin/loyalty',
    description:
      'Configure collective points accrual, lifetime-value rank thresholds, and referral commission settlements.',
    icon: Trophy,
  },
  {
    index: '04',
    title: 'Sandton Vault POS Terminal',
    href: '/pos',
    description:
      'Counter touch terminal with QR pass lookup, 60-second walk-in registration, custom scale calculator, and 80mm receipt printer.',
    icon: ScanLine,
  },
];

export default function AdminHubPage() {
  return (
    <main className="min-h-screen bg-void pb-28 pt-14">
      <div className="container max-w-5xl">
        <Eyebrow>Back Office Command</Eyebrow>
        <h1 className="mt-2 display-md text-white">
          Cartel <span className="gold-text">Operations</span>
        </h1>
        <p className="mt-3 max-w-xl text-sm text-muted-foreground">
          Select an operational surface below to manage master batches, member KYC verification,
          loyalty rules, or the floor terminal.
        </p>

        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <Link key={mod.href} href={mod.href} className="group block">
                <Card interactive className="flex h-full flex-col justify-between gap-6 p-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-gold">{mod.index}</span>
                      <Icon className="size-5 text-gold" />
                    </div>
                    <h2 className="font-display text-xl uppercase tracking-wide text-white group-hover:text-gold">
                      {mod.title}
                    </h2>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {mod.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-gold">
                    Open Surface
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
