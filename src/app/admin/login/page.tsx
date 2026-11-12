'use client';

/**
 * 420 CARTEL :: operator sign-in
 *
 * This page used to be two links straight into /pos and /admin, which meant
 * the "operator gate" gated nothing. It is now a real Supabase password
 * sign-in followed by an explicit staff-standing check.
 *
 * Signing in successfully is not enough to continue: a member account has
 * valid credentials too. After auth we read `staff_profiles`, and if there is
 * no active row we sign the session straight back out rather than leaving a
 * half-authorised member session sitting on a shop-floor tablet.
 */

import { Suspense, useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Boxes, KeyRound, Loader2, LogIn, ScanLine, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Badge, Card, Eyebrow } from '@/components/ui/surfaces';
import { createCartelBrowserClient } from '@/lib/supabase/client';
import { IS_LOCAL_PREVIEW } from '@/lib/data/source';

/** Only ever redirect to a same-site path, never to a caller-supplied URL. */
function safeNext(raw: string | null): string {
  if (!raw) return '/admin/pos';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/admin/pos';
  return raw;
}

function StaffLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next'));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signIn = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (busy) return;

      setBusy(true);
      setError(null);

      try {
        const supabase = createCartelBrowserClient();
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (authError || !data.user) {
          // Deliberately does not distinguish "no such account" from "wrong
          // password" — that difference tells an attacker which emails are staff.
          setError('Those credentials were not accepted.');
          return;
        }

        const { data: staff } = await supabase
          .from('staff_profiles')
          .select('is_active, display_name')
          .eq('id', data.user.id)
          .maybeSingle();

        if (!staff?.is_active) {
          // A valid member account is not an operator account.
          await supabase.auth.signOut();
          setError('That account has no active staff profile.');
          return;
        }

        router.replace(next);
        router.refresh();
      } catch {
        setError('Could not reach the vault ledger. Check the connection.');
      } finally {
        setBusy(false);
      }
    },
    [busy, email, next, password, router],
  );

  return (
    <Card className="w-full max-w-md space-y-6 border-ash p-8">
      <div className="flex items-center justify-between">
        <Eyebrow>Vault Floor & Back Office</Eyebrow>
        <Badge tone="gold">
          <KeyRound className="size-3" />
          Operator Gate
        </Badge>
      </div>

      <div>
        <h1 className="font-display text-2xl uppercase text-white">
          Staff <span className="">Authentication</span>
        </h1>
        <p className="mt-2 type-ui leading-relaxed text-ash">
          Sign in with a verified staff profile to reach the POS terminal and the
          back-office ledgers. Member accounts cannot open these surfaces.
        </p>
      </div>

      <form onSubmit={signIn} className="space-y-4">
        <Field label="Operator email" htmlFor="staff-email" required>
          <Input
            id="staff-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="budtender@420cartel.za"
          />
        </Field>

        <Field label="Password" htmlFor="staff-password" required>
          <Input
            id="staff-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        {error ? (
          <p role="alert" className="font-mono type-ui text-foreground">
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="gold" size="lg" block disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
          Authenticate
        </Button>
      </form>

      <div className="space-y-3 border-t border-[color:var(--border-mono)] pt-5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-gold">
            <span className="size-2 animate-pulse rounded-full bg-gold" />
            Evaluation / Demo Mode
          </span>
          <Link
            href="/demo"
            className="flex items-center gap-1 font-mono text-xs text-ash hover:text-foreground"
          >
            Demo Hub
            <ArrowRight className="size-3" />
          </Link>
        </div>
        <p className="type-ui text-xs leading-relaxed text-ash">
          Need to test the Sandton Vault POS or Central Inventory without staff credentials?
        </p>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button variant="outline" size="sm" asChild className="h-10 border-gold/40 hover:border-gold">
            <Link href="/pos?demo=true">
              <ScanLine className="size-3.5 text-gold" />
              Demo POS
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild className="h-10 border-gold/40 hover:border-gold">
            <Link href="/admin/inventory?demo=true">
              <Boxes className="size-3.5 text-gold" />
              Demo IMS
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** Credential-free demo build: there is no auth server to sign in against. */
function PreviewPanel() {
  return (
    <Card className="w-full max-w-md space-y-6 border-foreground p-8">
      <div className="flex items-center justify-between">
        <Eyebrow>Vault Floor & Back Office</Eyebrow>
        <Badge tone="gold">
          <KeyRound className="size-3" />
          Local Preview
        </Badge>
      </div>

      <div>
        <h1 className="font-display text-2xl uppercase text-white">
          Staff <span className="">Authentication</span>
        </h1>
        <p className="mt-2 type-ui leading-relaxed text-ash">
          Staff surfaces are currently unlocked in demonstration mode with full simulated
          inventory, multi-UOM tickets, and FIFO stock ledger.
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        <Button variant="gold" size="lg" block asChild>
          <Link href="/pos?demo=true">
            <ScanLine className="size-4" />
            Enter POS Terminal
          </Link>
        </Button>
        <Button variant="outline" size="lg" block asChild className="border-gold/50 text-white hover:border-gold">
          <Link href="/admin/inventory?demo=true">
            <Boxes className="size-4 text-gold" />
            Enter Inventory Ledger (IMS)
          </Link>
        </Button>
        <Button variant="ghost" size="lg" block asChild>
          <Link href="/admin?demo=true">
            <ShieldCheck className="size-4" />
            Enter Back Office Hub
          </Link>
        </Button>
      </div>
    </Card>
  );
}

export default function StaffLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-void p-6">
      {IS_LOCAL_PREVIEW ? (
        <PreviewPanel />
      ) : (
        <Suspense
          fallback={<Loader2 className="size-5 animate-spin text-foreground" aria-label="Loading" />}
        >
          <StaffLoginForm />
        </Suspense>
      )}
    </main>
  );
}
