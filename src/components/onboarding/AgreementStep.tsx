'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, PenLine } from 'lucide-react';
import { signAgreement } from '@/app/onboarding/actions';
import { SignaturePad } from './SignaturePad';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/surfaces';
import { Label } from '@/components/ui/field';
import { MEMBERSHIP_AGREEMENT_VERSION } from '@/lib/brand';
import { LEGAL_AGE } from '@/lib/sa-id';

const AGREEMENT_CLAUSES: { heading: string; body: string }[] = [
  {
    heading: 'Private Collective',
    body:
      '420 Cartel operates as a private members’ collective. Membership is personal, ' +
      'non-transferable, and may be withdrawn at the discretion of the collective. Your ' +
      'member pass and QR code identify you alone.',
  },
  {
    heading: 'Adults Only',
    body:
      `Membership is restricted to adults ${LEGAL_AGE} years and older. You confirm the identity ` +
      'document supplied is your own and that the date of birth on it is accurate. Supplying ' +
      'another person’s document terminates membership immediately.',
  },
  {
    heading: 'Personal Use',
    body:
      'All allocations are for your own personal use. You will not resell, supply, or ' +
      'redistribute any allocation received through the collective, and you will not consume ' +
      'any allocation on collective premises unless expressly permitted.',
  },
  {
    heading: 'Identity Records',
    body:
      'Your identity documents and selfie are stored encrypted, accessible only to authorised ' +
      'compliance staff, and retained for the period required of us. You may request deletion ' +
      'of your profile at any time, which ends your membership.',
  },
  {
    heading: 'Allocation Limits',
    body:
      'The collective may apply limits to any allocation by weight, volume or unit count. ' +
      'Published limits form part of this agreement and may change without notice.',
  },
];

export function AgreementStep() {
  const router = useRouter();
  const [hasSignature, setHasSignature] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);

    startTransition(async () => {
      const result = await signAgreement(formData);
      if (!result.ok) {
        setError(result.error ?? 'Could not record your signature.');
        return;
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-8">
      <Card className="cartel-scroll max-h-80 overflow-y-auto p-6">
        <div className="flex flex-col gap-5">
          <div className="flex items-baseline justify-between gap-4">
            <p className="font-display text-base uppercase tracking-[0.16em]">
              Private Member Agreement
            </p>
            <span className="font-mono text-[0.5625rem] uppercase tracking-[0.2em] text-faint">
              v{MEMBERSHIP_AGREEMENT_VERSION}
            </span>
          </div>

          {AGREEMENT_CLAUSES.map((clause, index) => (
            <div key={clause.heading} className="flex flex-col gap-1.5">
              <p className="font-mono text-[0.625rem] uppercase tracking-[0.22em] text-gold">
                {String(index + 1).padStart(2, '0')} · {clause.heading}
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">{clause.body}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex flex-col gap-3">
        <Label>Signature</Label>
        <SignaturePad onChange={setHasSignature} />
      </div>

      {error ? (
        <p
          role="alert"
          className="border-l-2 border-destructive bg-destructive/5 px-4 py-3 font-mono text-[0.6875rem] text-red-300"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <Button type="submit" variant="gold" size="lg" block disabled={pending || !hasSignature}>
          {pending ? (
            <>
              <Loader2 className="animate-spin" />
              Recording
            </>
          ) : (
            <>
              <PenLine />
              Sign &amp; Submit Application
            </>
          )}
        </Button>
        <Label className="text-center">Step 3 of 3 · Membership agreement</Label>
      </div>
    </form>
  );
}
