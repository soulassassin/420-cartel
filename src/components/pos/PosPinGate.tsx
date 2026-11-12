'use client';

/**
 * 420 CARTEL :: counter PIN gate
 *
 * The second stage of the POS gate. The server layout has already proved an
 * active staff session exists; this proves who is at the terminal right now.
 *
 * Why it is per-tab and not persistent: the unlock lives in `sessionStorage`,
 * so it survives a reload and a route change during a shift, but dies with
 * the tab. A budtender who closes the terminal has locked it. `localStorage`
 * would keep a shop-floor tablet unlocked indefinitely, which defeats the
 * point of having a PIN at all.
 *
 * The PIN is never checked here. It goes to `verify_pos_pin` in Postgres,
 * which compares it against a bcrypt hash under SECURITY DEFINER — the hash
 * never reaches the browser, and the function resolves the operator from
 * auth.uid() rather than trusting anything this component sends.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Delete, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge, Card, Eyebrow } from '@/components/ui/surfaces';
import { createCartelBrowserClient } from '@/lib/supabase/client';
import { IS_LOCAL_PREVIEW, isDemoModeActive } from '@/lib/data/source';
import { cn } from '@/lib/utils';

const UNLOCK_KEY = 'cartel.pos.unlocked';
const PIN_MIN = 4;
const PIN_MAX = 8;

/** Slows down repeated guessing without locking a budtender out mid-shift. */
const LOCKOUT_AFTER = 5;
const LOCKOUT_MS = 30_000;

type GateState = 'CHECKING' | 'LOCKED' | 'NO_PIN_SET' | 'UNLOCKED';

export interface PosPinGateProps {
  children: React.ReactNode;
  /** Credential-free demo build: there is no session to attach a PIN to. */
  previewUnlocked: boolean;
}

export function PosPinGate({ children, previewUnlocked }: PosPinGateProps) {
  const [state, setState] = useState<GateState>(
    previewUnlocked ? 'UNLOCKED' : 'CHECKING',
  );
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  /** First-time setup: an operator may set their own PIN (Postgres enforces it). */
  const createPin = useCallback(async () => {
    if (busy) return;
    if (!new RegExp(`^[0-9]{${PIN_MIN},${PIN_MAX}}$`).test(newPin)) {
      setError(`Choose a PIN of ${PIN_MIN} to ${PIN_MAX} digits.`);
      return;
    }
    if (newPin !== confirmPin) {
      setError('The two PINs do not match.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const supabase = createCartelBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError('Your session has ended. Sign in again.');
        return;
      }
      const { error: rpcError } = await supabase.rpc('set_pos_pin', {
        p_staff_id: user.id,
        p_pin: newPin,
      });
      if (rpcError) {
        const match = /CARTEL_[A-Z_]+:\s*(.*)/.exec(rpcError.message);
        setError(match?.[1]?.trim() || 'Could not save the PIN. Try again.');
        return;
      }
      setNewPin('');
      setConfirmPin('');
      setNotice('PIN saved. Enter it to open the terminal.');
      setState('LOCKED');
    } finally {
      setBusy(false);
    }
  }, [busy, confirmPin, newPin]);

  // Resume an unlock from earlier in the same tab, then ask Postgres whether
  // this operator even has a PIN configured.
  useEffect(() => {
    if (previewUnlocked || IS_LOCAL_PREVIEW || isDemoModeActive()) {
      setState('UNLOCKED');
      return;
    }

    let cancelled = false;

    try {
      if (sessionStorage.getItem(UNLOCK_KEY) === '1') {
        setState('UNLOCKED');
        return;
      }
    } catch {
      // Private mode or blocked storage: fall through and ask for the PIN.
    }

    void (async () => {
      try {
        const supabase = createCartelBrowserClient();
        const { data, error: rpcError } = await supabase.rpc('has_pos_pin');
        if (cancelled) return;
        if (rpcError) {
          setState('LOCKED');
          return;
        }
        setState(data ? 'LOCKED' : 'NO_PIN_SET');
      } catch {
        if (!cancelled) setState('LOCKED');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [previewUnlocked]);

  const unlock = useCallback(() => {
    try {
      sessionStorage.setItem(UNLOCK_KEY, '1');
    } catch {
      // Not fatal — the gate simply reappears on the next load.
    }
    setState('UNLOCKED');
    setPin('');
    setError(null);
    setAttempts(0);
  }, []);

  const submit = useCallback(async () => {
    if (busy) return;
    if (Date.now() < lockedUntil) return;
    if (pin.length < PIN_MIN) {
      setError(`Enter at least ${PIN_MIN} digits.`);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      // Demo sessions accept any PIN. A real till always checks the operator's own PIN.
      if (IS_LOCAL_PREVIEW || isDemoModeActive()) {
        unlock();
        return;
      }

      const supabase = createCartelBrowserClient();
      const { data, error: rpcError } = await supabase.rpc('verify_pos_pin', { p_pin: pin });

      if (rpcError) {
        setError('Could not reach the vault ledger. Check the connection.');
        setPin('');
        return;
      }

      if (data === true) {
        unlock();
        return;
      }

      const next = attempts + 1;
      setAttempts(next);
      setPin('');

      if (next >= LOCKOUT_AFTER) {
        setLockedUntil(Date.now() + LOCKOUT_MS);
        setAttempts(0);
        setError(`Too many incorrect PINs. Terminal held for ${LOCKOUT_MS / 1000} seconds.`);
      } else {
        setError(`Incorrect PIN. ${LOCKOUT_AFTER - next} attempts before a hold.`);
      }
    } finally {
      setBusy(false);
    }
  }, [attempts, busy, lockedUntil, pin, unlock]);

  // Hardware keypads and USB scanners type straight into the page, so the
  // keypad has to accept real keystrokes as well as taps.
  useEffect(() => {
    if (state !== 'LOCKED') return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key >= '0' && event.key <= '9') {
        setPin((current) => (current.length < PIN_MAX ? current + event.key : current));
      } else if (event.key === 'Backspace') {
        setPin((current) => current.slice(0, -1));
      } else if (event.key === 'Enter') {
        void submit();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, submit]);

  if (state === 'UNLOCKED') return <>{children}</>;

  if (state === 'CHECKING') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-void">
        <Loader2 className="size-5 animate-spin text-foreground" aria-label="Checking terminal lock" />
      </main>
    );
  }

  if (state === 'NO_PIN_SET') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-void p-6">
        <Card className="w-full max-w-md space-y-5 border-ash p-8">
          <div className="flex items-center justify-between">
            <Eyebrow>Counter Terminal</Eyebrow>
            <Badge tone="gold">
              <ShieldCheck className="size-3" />
              PIN Required
            </Badge>
          </div>
          <h1 className="font-display text-2xl uppercase text-white">
            No counter PIN set
          </h1>
          <p className="type-ui leading-relaxed text-ash">
            Choose a counter PIN of {PIN_MIN} to {PIN_MAX} digits. You will enter it each
            time this terminal is opened. Avoid obvious PINs such as 1234.
          </p>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void createPin();
            }}
          >
            {(
              [
                ['pos-new-pin', 'New PIN', newPin, setNewPin],
                ['pos-confirm-pin', 'Confirm PIN', confirmPin, setConfirmPin],
              ] as const
            ).map(([id, label, value, setValue]) => (
              <label key={id} htmlFor={id} className="block space-y-1">
                <span className="block font-mono text-xs uppercase tracking-wider text-ash">
                  {label}
                </span>
                <input
                  id={id}
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={PIN_MAX}
                  value={value}
                  onChange={(event) => setValue(event.target.value.replace(/\D/g, ''))}
                  className="h-12 w-full border border-[color:var(--border-subtle)] bg-surface px-3 font-mono text-lg tracking-[0.4em] text-white"
                />
              </label>
            ))}
            {error ? (
              <p role="alert" className="font-mono type-ui text-foreground">
                {error}
              </p>
            ) : null}
            <Button type="submit" variant="gold" size="lg" block disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              Save PIN
            </Button>
          </form>
          <Button
            variant="outline"
            size="lg"
            block
            onClick={() => {
              setError(null);
              setState('LOCKED');
            }}
          >
            I have a PIN — let me enter it
          </Button>
        </Card>
      </main>
    );
  }

  const held = Date.now() < lockedUntil;

  return (
    <main className="flex min-h-screen items-center justify-center bg-void p-6">
      <Card className="w-full max-w-sm space-y-6 border-ash p-8">
        <div className="flex items-center justify-between">
          <Eyebrow>Counter Terminal</Eyebrow>
          <Badge tone="gold">
            <LockKeyhole className="size-3" />
            Locked
          </Badge>
        </div>

        <div>
          <h1 className="font-display text-2xl uppercase text-white">
            Operator <span className="">PIN</span>
          </h1>
          <p className="mt-2 type-ui leading-relaxed text-ash">
            Confirm who is at the terminal before taking a sale.
          </p>
          {notice ? (
            <p role="status" className="mt-2 font-mono type-ui text-accent">
              {notice}
            </p>
          ) : null}
        </div>

        {/* Filled/empty pips rather than a text field: a PIN should never be
            shoulder-readable, and a tablet should never offer to remember it. */}
        <div className="flex items-center justify-center gap-2.5" aria-hidden="true">
          {Array.from({ length: PIN_MAX }, (_, index) => (
            <span
              key={index}
              className={cn(
                'size-2.5 rotate-45 border transition-colors',
                index < pin.length
                  ? 'border-foreground bg-foreground'
                  : 'border-[color:var(--border-mono)] bg-transparent',
              )}
            />
          ))}
        </div>
        <span className="sr-only" aria-live="polite">
          {pin.length} of up to {PIN_MAX} digits entered
        </span>

        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <KeypadKey
              key={digit}
              disabled={busy || held}
              onClick={() => setPin((c) => (c.length < PIN_MAX ? c + digit : c))}
            >
              {digit}
            </KeypadKey>
          ))}
          <KeypadKey disabled={busy || held} onClick={() => setPin('')}>
            <span className="type-ui ">CLR</span>
          </KeypadKey>
          <KeypadKey
            disabled={busy || held}
            onClick={() => setPin((c) => (c.length < PIN_MAX ? `${c}0` : c))}
          >
            0
          </KeypadKey>
          <KeypadKey
            disabled={busy || held}
            onClick={() => setPin((c) => c.slice(0, -1))}
            label="Delete last digit"
          >
            <Delete className="size-4" />
          </KeypadKey>
        </div>

        {error ? (
          <p role="alert" className="text-center font-mono type-ui text-foreground">
            {error}
          </p>
        ) : null}

        <Button
          variant="gold"
          size="lg"
          block
          disabled={busy || held || pin.length < PIN_MIN}
          onClick={() => void submit()}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          Unlock terminal
        </Button>

        {/* Demo only: never offer a way round the PIN on a real, signed-in till. */}
        {IS_LOCAL_PREVIEW || isDemoModeActive() ? (
          <Button
            variant="outline"
            size="sm"
            block
            onClick={() => unlock()}
            className="border-dashed font-mono text-xs text-ash hover:text-white"
          >
            Quick Demo Bypass (Skip PIN)
          </Button>
        ) : null}
      </Card>
    </main>
  );
}

function KeypadKey({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-14 items-center justify-center border border-[color:var(--border-mono)]',
        'font-mono text-lg text-white transition-colors',
        'hover:border-[color:var(--border-hard)] bg-transparent',
        'disabled:pointer-events-none disabled:opacity-40',
      )}
    >
      {children}
    </button>
  );
}

export default PosPinGate;
