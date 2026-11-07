'use client';

import Link from 'next/link';
import { ArrowRight, KeyRound, ScanLine, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, Card, Eyebrow } from '@/components/ui/surfaces';
import { IS_LOCAL_PREVIEW } from '@/lib/data/source';

export default function StaffLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-void p-6">
      <Card className="w-full max-w-md space-y-6 border-gold/40 p-8">
        <div className="flex items-center justify-between">
          <Eyebrow>Vault Floor & Back Office</Eyebrow>
          <Badge tone="gold">
            <KeyRound className="size-3" />
            Operator Gate
          </Badge>
        </div>

        <div>
          <h1 className="font-display text-2xl uppercase tracking-wide text-white">
            Staff <span className="gold-text">Authentication</span>
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {IS_LOCAL_PREVIEW
              ? 'Local preview mode is active: all POS and Back Office surfaces are unlocked for demonstration without Supabase credentials.'
              : 'Sign in with a verified staff profile to access the POS terminal and back-office ledgers.'}
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <Button variant="gold" size="lg" block asChild>
            <Link href="/pos">
              <ScanLine className="size-4" />
              Enter Sandton POS Terminal
            </Link>
          </Button>
          <Button variant="outline" size="lg" block asChild>
            <Link href="/admin">
              <ShieldCheck className="size-4" />
              Open Back Office Command
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </Card>
    </main>
  );
}
