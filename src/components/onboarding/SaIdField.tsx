'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { Field, Input } from '@/components/ui/field';
import { Badge, Stat } from '@/components/ui/surfaces';
import { formatSaId, normalizeSaId, parseSaId, LEGAL_AGE } from '@/lib/sa-id';

/**
 * 13-digit SA ID input with live DOB extraction.
 *
 * Parses on every keystroke so a visitor sees their own date of birth appear —
 * which is both reassuring and the fastest way for them to spot a typo. The
 * same parse runs again in the server action and a third time as a Postgres
 * CHECK constraint, so this display is convenience, never the gate.
 */
export function SaIdField({
  name = 'sa_id_number',
  serverError,
  value: controlledValue,
  onValueChange,
}: {
  name?: string;
  serverError?: string | null;
  /** Omit both to let the field own its state (plain form POST usage). */
  value?: string;
  onValueChange?: (digits: string) => void;
}) {
  const [uncontrolled, setUncontrolled] = useState('');
  const value = controlledValue ?? uncontrolled;

  const setValue = (digits: string) => {
    if (onValueChange) onValueChange(digits);
    if (controlledValue === undefined) setUncontrolled(digits);
  };

  const result = useMemo(() => parseSaId(value), [value]);
  const digits = normalizeSaId(value);
  const showFeedback = digits.length >= 6;

  const underage = result.valid && !result.isOfLegalAge;
  const error = serverError ?? (digits.length === 13 && !result.valid ? result.message : null);

  return (
    <div className="flex flex-col gap-3">
      <Field
        label="South African ID Number"
        htmlFor={name}
        required
        hint="13 digits"
        error={error}
      >
        <Input
          id={name}
          name={name}
          value={formatSaId(value)}
          onChange={(event) => setValue(normalizeSaId(event.target.value).slice(0, 13))}
          inputMode="numeric"
          autoComplete="off"
          placeholder="000000 0000 00 0"
          className="font-mono text-lg tabular-nums"
          aria-invalid={Boolean(error)}
          aria-describedby={`${name}-readout`}
        />
      </Field>

      {/* Live readout of what the ID number decodes to. */}
      <div
        id={`${name}-readout`}
        aria-live="polite"
        className="min-h-[4.5rem] border border-[color:var(--border-mono)] bg-void px-4 py-3"
      >
        {!showFeedback ? (
          <p className="font-mono type-ui text-ash">
            Date of birth is read from your ID number
          </p>
        ) : result.valid ? (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <Stat label="Date of Birth" value={result.dateOfBirth} tone="gold" />
            <Stat
              label="Age"
              value={result.age}
              unit="yrs"
              tone={result.isOfLegalAge ? 'default' : 'muted'}
            />
            {result.citizenship ? (
              <Stat
                label="Status"
                value={result.citizenship === 'SA_CITIZEN' ? 'Citizen' : 'Resident'}
                tone="muted"
              />
            ) : null}
            {underage ? (
              <Badge tone="danger">
                <ShieldAlert className="size-3" />
                Under {LEGAL_AGE}
              </Badge>
            ) : (
              <Badge tone="live">
                <CheckCircle2 className="size-3" />
                {LEGAL_AGE}+ Verified
              </Badge>
            )}
          </div>
        ) : (
          <p className="font-mono type-ui text-ash">
            {digits.length}/13 digits
          </p>
        )}
      </div>

      {underage ? (
        <p role="alert" className="font-mono type-ui leading-relaxed text-foreground">
          420 Cartel is a private collective for adults {LEGAL_AGE} and over. We cannot process
          this application.
        </p>
      ) : null}
    </div>
  );
}
