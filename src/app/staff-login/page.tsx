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
import { KeyRound, Loader2, LogIn, ScanLine, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Badge, Card, Eyebrow } from '@/components/ui/surfaces';
import { createCartelBrowserClient } from '@/lib/supabase/client';
import { IS_LOCAL_PREVIEW } from '@/lib/data/source';

/** Only ever redirect to a same-site path, never to a caller-supplied URL. */
function safeNext(raw: string | null): string {
  if (!raw) return '/pos';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/pos';
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

      <p className="border-t border-[color:var(--border-mono)] pt-4 type-ui leading-relaxed text-ash">
        A counter PIN is requested separately once the POS terminal opens.
      </p>
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
          Supabase is not configured, so there is no auth server to sign in against
          and the staff surfaces are unlocked for demonstration. Set
          <code className="mx-1 text-foreground">NEXT_PUBLIC_SUPABASE_URL</code>
          and
          <code className="mx-1 text-foreground">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
          to turn the real operator gate on.
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
            Enter Back Office
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
