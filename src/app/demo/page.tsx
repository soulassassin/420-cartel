'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  Boxes,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Printer,
  RotateCcw,
  Scale,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import { BrandLogo } from '@/components/layout/BrandLogo';
import { Button } from '@/components/ui/button';
import { Badge, Card, Eyebrow } from '@/components/ui/surfaces';
import { resetLocalDb } from '@/lib/demo/engine';
import { setDemoMode } from '@/lib/data/source';

const TEST_MEMBERS = [
  {
    code: 'CARTEL-0420',
    name: 'Katlego Sithole',
    tier: 'VIP',
    credit: 'R 250.00',
    points: 1420,
    note: 'Recommended for VIP tier pricing & credit tender testing',
  },
  {
    code: 'CARTEL-0001',
    name: 'R. Mathebula',
    tier: 'BLACK',
    credit: 'R 1,200.00',
    points: 5800,
    note: 'Founding Member with maximum store credit balance',
  },
  {
    code: 'CARTEL-0012',
    name: 'Zanele Dlamini',
    tier: 'MEMBER',
    credit: 'R 0.00',
    points: 340,
    note: 'Standard collective member for regular ticket flow',
  },
];

const TEST_BARCODES = [
  { code: 'FLW-RS11-35', product: 'RS11 3.5g Jar', category: 'Flower (g)' },
  { code: 'VAP-GSC-1ML', product: 'GSC 1ml Live Rosin Cart', category: 'Vape (ea)' },
  { code: 'ELX-CBD-30', product: 'Broad Spectrum CBD 30ml', category: 'Elixir (ml)' },
];

export default function DemoAccessPage() {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleResetData = () => {
    resetLocalDb();
    setDemoMode(true);
    setResetMessage('Simulated vault ledger reset to initial seed state.');
    setTimeout(() => setResetMessage(null), 3500);
  };

  return (
    <main className="min-h-screen bg-void pb-28 pt-8">
      <div className="container max-w-6xl space-y-10 px-4 md:px-8">
        {/* Header section */}
        <div className="flex flex-col gap-4 border-b border-[color:var(--border-mono)] pb-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative size-12 overflow-hidden rounded-full border border-gold/30">
              <Image
                src="/fourtwentycartel_logo.jpg"
                alt="420 Cartel"
                fill
                className="object-cover"
                priority
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Eyebrow>Operations Demo Hub</Eyebrow>
                <Badge tone="gold">
                  <Sparkles className="size-3" />
                  Live Simulation
                </Badge>
              </div>
              <h1 className="mt-1 font-display text-2xl uppercase tracking-wider text-white md:text-3xl">
                POS &amp; IMS Access Point
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetData}
              className="border-[color:var(--border-mono)] font-mono text-xs text-ash hover:text-white"
            >
              <RotateCcw className="size-3.5" />
              Reset Demo Data
            </Button>
            <Button variant="gold" size="sm" asChild>
              <Link href="/pos?demo=true">
                <ScanLine className="size-3.5" />
                Launch POS Till
              </Link>
            </Button>
          </div>
        </div>

        {resetMessage && (
          <div className="flex items-center gap-2 border border-accent bg-accent/10 px-4 py-3 font-mono text-sm text-accent">
            <Check className="size-4 shrink-0" />
            <span>{resetMessage}</span>
          </div>
        )}

        {/* Overview banner */}
        <div className="rounded border border-gold/30 bg-gold/5 p-6">
          <h2 className="font-display text-lg uppercase tracking-wide text-white">
            Demonstration Environment
          </h2>
          <p className="mt-1 max-w-3xl type-ui text-sm leading-relaxed text-ash">
            This demo access point provides instant, unblocked entry to both the{' '}
            <strong className="text-white">Sandton Vault Point of Sale (POS)</strong> counter terminal
            and the <strong className="text-white">Master Inventory Management System (IMS)</strong>.
            The terminal runs with full simulated FIFO batch allocation, live multi-UOM scale calculators,
            member pass lookups, and 80mm thermal receipt printing without needing database credentials.
          </p>
        </div>

        {/* Primary Operational Surfaces (Grid) */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Card 1: Point of Sale Terminal */}
          <Card className="flex flex-col justify-between border-ash/50 p-6 md:p-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Badge tone="gold">Module E</Badge>
                <span className="font-mono text-xs text-foreground">Sandton Counter 01</span>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded border border-gold/40 bg-gold/10 text-gold">
                  <ScanLine className="size-5" />
                </div>
                <div>
                  <h2 className="font-display text-xl uppercase tracking-wider text-white">
                    Point of Sale (POS)
                  </h2>
                  <p className="font-mono text-xs text-ash">In-Store Counter Terminal</p>
                </div>
              </div>

              <p className="type-ui text-sm leading-relaxed text-ash">
                Touch-first budtender counter interface with instant member pass lookup, 60-second walk-in
                KYC registration, custom scale weight &amp; target-Rand calculator, multi-tender settlement,
                and printable 80mm thermal receipts.
              </p>

              <div className="space-y-2 rounded border border-[color:var(--border-mono)] bg-void p-3 font-mono text-xs text-ash">
                <div className="flex items-center gap-2 text-white">
                  <Check className="size-3.5 text-accent" />
                  <span>Instant member QR / code / SA ID scanner</span>
                </div>
                <div className="flex items-center gap-2 text-white">
                  <Scale className="size-3.5 text-accent" />
                  <span>Custom scale allocation &amp; target Rand calculator</span>
                </div>
                <div className="flex items-center gap-2 text-white">
                  <Printer className="size-3.5 text-accent" />
                  <span>80mm ESC/POS thermal slip with FIFO batch allocation</span>
                </div>
                <div className="flex items-center gap-2 text-white">
                  <KeyRound className="size-3.5 text-accent" />
                  <span>Auto-unlocked PIN gate (PIN: 4200)</span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2.5 pt-4">
              <Button variant="gold" size="lg" block asChild>
                <Link href="/pos?demo=true">
                  <ScanLine className="size-4" />
                  Open POS Counter Terminal
                </Link>
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" asChild className="font-mono text-xs">
                  <Link href="/pos?demo=true&member=CARTEL-0420">
                    Scan CARTEL-0420
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild className="font-mono text-xs">
                  <Link href="/pos?demo=true&member=CARTEL-0001">
                    Scan CARTEL-0001
                  </Link>
                </Button>
              </div>
            </div>
          </Card>

          {/* Card 2: Inventory Management System (IMS) */}
          <Card className="flex flex-col justify-between border-ash/50 p-6 md:p-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Badge tone="gold">Module F</Badge>
                <span className="font-mono text-xs text-foreground">Multi-Branch Vault Ledger</span>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded border border-gold/40 bg-gold/10 text-gold">
                  <Boxes className="size-5" />
                </div>
                <div>
                  <h2 className="font-display text-xl uppercase tracking-wider text-white">
                    Inventory System (IMS)
                  </h2>
                  <p className="font-mono text-xs text-ash">Master Batch Ledger &amp; Stock Board</p>
                </div>
              </div>

              <p className="type-ui text-sm leading-relaxed text-ash">
                Centralised inventory ledger tracking multi-UOM master batch balances (grams, milliliters,
                units) across Norwood, Rivonia (Sandton), and Kibler Park branches, with FIFO depletion and
                immutable movement audits.
              </p>

              <div className="space-y-2 rounded border border-[color:var(--border-mono)] bg-void p-3 font-mono text-xs text-ash">
                <div className="flex items-center gap-2 text-white">
                  <Check className="size-3.5 text-accent" />
                  <span>Multi-branch stock board with low-stock alerts</span>
                </div>
                <div className="flex items-center gap-2 text-white">
                  <Check className="size-3.5 text-accent" />
                  <span>FIFO batch allocation &amp; harvest intake entries</span>
                </div>
                <div className="flex items-center gap-2 text-white">
                  <Check className="size-3.5 text-accent" />
                  <span>Inter-branch vault transfers &amp; spillage/audit logging</span>
                </div>
                <div className="flex items-center gap-2 text-white">
                  <Check className="size-3.5 text-accent" />
                  <span>Real-time stock reservation sync with online shopping carts</span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2.5 pt-4">
              <Button variant="gold" size="lg" block asChild>
                <Link href="/admin/inventory?demo=true">
                  <Boxes className="size-4" />
                  Open Master Inventory (IMS)
                </Link>
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" asChild className="font-mono text-xs">
                  <Link href="/admin/inventory?demo=true">
                    Stock Movements
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild className="font-mono text-xs">
                  <Link href="/admin?demo=true">
                    Back Office Hub
                  </Link>
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* Back Office Operations & Compliance Strip */}
        <Card className="border-[color:var(--border-mono)] p-6">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <div>
              <Eyebrow>Back Office Suite</Eyebrow>
              <h3 className="font-display text-lg uppercase tracking-wide text-white">
                Member CRM, Compliance KYC &amp; Loyalty Rules
              </h3>
              <p className="mt-1 max-w-2xl type-ui text-sm text-ash">
                In addition to POS and IMS, the demo environment includes member verification, 18+ South African
                ID document reviews, tier promotion, and affiliate commission ledgering.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin/crm?demo=true">
                  <Users className="size-3.5" />
                  Member CRM
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin/loyalty?demo=true">
                  <Trophy className="size-3.5" />
                  Loyalty Ledger
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin?demo=true">
                  Back Office Overview
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        </Card>

        {/* Interactive Testing Cheatsheet */}
        <div className="space-y-4">
          <div>
            <Eyebrow>Testing Data Cheatsheet</Eyebrow>
            <h3 className="font-display text-xl uppercase tracking-wider text-white">
              Preloaded Member Passes &amp; Product Barcodes
            </h3>
            <p className="type-ui text-sm text-ash">
              Use these values inside the POS search bar or hardware scanner input to test instant member and product lookups.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {TEST_MEMBERS.map((m) => (
              <div
                key={m.code}
                className="flex flex-col justify-between rounded border border-[color:var(--border-mono)] bg-surface p-4"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-foreground">{m.code}</span>
                    <Badge tone={m.tier === 'BLACK' ? 'gold' : m.tier === 'VIP' ? 'live' : 'mono'}>
                      {m.tier}
                    </Badge>
                  </div>
                  <h4 className="mt-1 font-display text-base text-white">{m.name}</h4>
                  <p className="mt-1 font-mono text-xs text-ash">
                    Credit: <span className="text-white">{m.credit}</span> · Points: {m.points}
                  </p>
                  <p className="mt-2 type-ui text-xs text-ash">{m.note}</p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-[color:var(--border-mono)] pt-3">
                  <button
                    type="button"
                    onClick={() => handleCopy(m.code)}
                    className="flex items-center gap-1 font-mono text-xs text-ash hover:text-white"
                  >
                    {copiedCode === m.code ? (
                      <>
                        <Check className="size-3 text-accent" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="size-3" />
                        <span>Copy Code</span>
                      </>
                    )}
                  </button>

                  <Link
                    href={`/pos?demo=true&member=${m.code}`}
                    className="flex items-center gap-1 font-mono text-xs text-gold hover:underline"
                  >
                    Open in POS
                    <ArrowRight className="size-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded border border-[color:var(--border-mono)] bg-surface p-4">
            <span className="font-mono text-xs uppercase tracking-wider text-ash">
              Sample Barcodes for Hardware Scanner / Keyboard Test:
            </span>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {TEST_BARCODES.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => handleCopy(item.code)}
                  className="flex items-center gap-2 rounded border border-[color:var(--border-mono)] bg-void px-3 py-1.5 font-mono text-xs text-ash transition-colors hover:border-foreground hover:text-white"
                  title="Click to copy barcode"
                >
                  <span className="text-foreground">{item.code}</span>
                  <span className="text-white">({item.product})</span>
                  {copiedCode === item.code ? (
                    <Check className="size-3 text-accent" />
                  ) : (
                    <Copy className="size-3 opacity-50" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
