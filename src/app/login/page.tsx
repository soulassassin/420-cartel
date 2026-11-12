'use client';

import { Suspense, useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Field, Input } from '@/components/ui/field';
import { IS_LOCAL_PREVIEW, listMembers } from '@/lib/data/source';
import { createCartelBrowserClient } from '@/lib/supabase/client';
import { useSessionStore } from '@/lib/store/session';

/** Only ever redirect to a same-site path, never to a caller-supplied URL. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/account';
  return raw;
}

function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const signIn = useSessionStore((state) => state.signIn);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (busy) return;
      setBusy(true);
      setError(null);

      try {
        const address = email.trim().toLowerCase();

        // Preview has no auth server, so a seeded member's email is enough.
        if (IS_LOCAL_PREVIEW) {
          const member = (await listMembers()).find((row) => row.email?.toLowerCase() === address);
          if (!member) {
            setError('Those details were not accepted.');
            return;
          }
          signIn(member, true);
          router.replace(next);
          return;
        }

        const supabase = createCartelBrowserClient();
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: address,
          password,
        });
        if (authError || !data.user) {
          setError('Those details were not accepted.');
          return;
        }

        const { data: member } = await supabase
          .from('members')
          .select('*')
          .eq('id', data.user.id)
          .maybeSingle();

        if (member) signIn(member);
        // An account that never finished onboarding carries on from there.
        router.replace(member ? next : '/onboarding');
        router.refresh();
      } catch {
        setError('Could not reach the server. Check your connection.');
      } finally {
        setBusy(false);
      }
    },
    [busy, email, next, password, router, signIn],
  );

  return (
    <form onSubmit={submit} className="max-w-md space-y-[18px]">
      <Field label="Email" htmlFor="login-email" required>
        <Input
          id="login-email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>
      {IS_LOCAL_PREVIEW ? (
        <p className="text-[19px] text-ash">Local preview: enter a seeded member&apos;s email.</p>
      ) : (
        <Field label="Password" htmlFor="login-password" required>
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
      )}
      {error ? (
        <p role="alert" className="text-[19px]">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy} className="ghost-link text-[22px] disabled:text-ash">
        {busy ? 'Logging in…' : 'Log in'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="bg-void px-4 pb-[78px] md:px-12">
      <section className="py-[78px]">
        <h1 className="display-xl headline-in">Log in</h1>
      </section>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
      <p className="mt-[43px] text-[22px] text-ash">
        Not a member yet?{' '}
        <Link href="/onboarding" className="ghost-link text-foreground">
          Apply for membership
        </Link>
      </p>
    </main>
  );
}
