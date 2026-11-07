'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';
import { rotatePassToken } from '@/app/onboarding/actions';
import { Button } from '@/components/ui/button';

/**
 * Rotating the pass token invalidates every previously issued QR immediately.
 * Confirmed in two taps rather than one, because a member who rotates by
 * accident has to be re-scanned at the counter.
 */
export function RotatePassButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function rotate() {
    setError(null);
    startTransition(async () => {
      const result = await rotatePassToken();
      if (!result.ok) {
        setError(result.error ?? 'Could not rotate your pass.');
        setConfirming(false);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <div className="flex flex-col gap-2">
        <Button type="button" variant="surface" size="sm" onClick={() => setConfirming(true)}>
          <RefreshCw />
          Rotate QR Code
        </Button>
        {error ? (
          <p role="alert" className="font-mono text-[0.625rem] text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border border-gold/40 bg-gold/5 p-4">
      <p className="text-xs leading-relaxed text-muted-foreground">
        This immediately invalidates your current QR code. Anyone holding a photograph of it will
        no longer be able to use it — and neither will you until this page reloads.
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="gold"
          size="sm"
          className="flex-1"
          onClick={rotate}
          disabled={pending}
        >
          {pending ? (
            <>
              <Loader2 className="animate-spin" />
              Rotating
            </>
          ) : (
            'Confirm Rotate'
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setConfirming(false)}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
