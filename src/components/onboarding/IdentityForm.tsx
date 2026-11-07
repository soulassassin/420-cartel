'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2 } from 'lucide-react';
import { submitOnboarding } from '@/app/onboarding/actions';
import { SaIdField } from './SaIdField';
import { Button } from '@/components/ui/button';
import { Field, Input, Label } from '@/components/ui/field';
import { CaptionRule, Card } from '@/components/ui/surfaces';
import { LEGAL_AGE } from '@/lib/sa-id';
import { UOM_LABEL } from '@/lib/uom';
import type { BaseUom, BranchRow, IdDocumentType } from '@/types/database';

/** ISO 3166-1 alpha-2 for the passports the collective sees most. */
const PASSPORT_COUNTRIES: { code: string; name: string }[] = [
  { code: 'ZA', name: 'South Africa' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'US', name: 'United States' },
  { code: 'FR', name: 'France' },
  { code: 'ZW', name: 'Zimbabwe' },
  { code: 'NA', name: 'Namibia' },
  { code: 'BW', name: 'Botswana' },
  { code: 'MZ', name: 'Mozambique' },
];

const PREFERRED_UOMS: BaseUom[] = ['GRAMS', 'MILLILITERS', 'UNITS'];

export function IdentityForm({ branches }: { branches: BranchRow[] }) {
  const router = useRouter();
  const [docType, setDocType] = useState<IdDocumentType>('SA_ID');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setFieldErrors({});
    setFormError(null);

    startTransition(async () => {
      const result = await submitOnboarding(formData);
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        setFormError(result.error ?? 'Could not submit your application.');
        return;
      }
      // Server state advances the wizard; just re-render the route.
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-10" noValidate>
      {/* ---- Identity document selector ---------------------------------- */}
      <section className="flex flex-col gap-4">
        <CaptionRule>Identity</CaptionRule>

        <div className="grid grid-cols-2 gap-3">
          {(['SA_ID', 'PASSPORT'] as IdDocumentType[]).map((option) => (
            <Button
              key={option}
              type="button"
              variant={docType === option ? 'active' : 'outline'}
              size="lg"
              onClick={() => setDocType(option)}
              aria-pressed={docType === option}
            >
              {option === 'SA_ID' ? 'SA ID Number' : 'Passport'}
            </Button>
          ))}
        </div>
        <input type="hidden" name="id_document_type" value={docType} />

        {docType === 'SA_ID' ? (
          <SaIdField serverError={fieldErrors.sa_id_number ?? null} />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Passport Number"
              htmlFor="passport_number"
              required
              error={fieldErrors.passport_number}
            >
              <Input
                id="passport_number"
                name="passport_number"
                autoComplete="off"
                className="font-mono tracking-wider"
              />
            </Field>

            <Field
              label="Issuing Country"
              htmlFor="passport_country"
              required
              error={fieldErrors.passport_country}
            >
              <select
                id="passport_country"
                name="passport_country"
                defaultValue="ZA"
                className="h-12 w-full border border-[color:var(--border-mono)] bg-surface px-4 text-base text-foreground focus:border-gold focus:outline-none"
              >
                {PASSPORT_COUNTRIES.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Date of Birth"
              htmlFor="date_of_birth"
              required
              hint="YYYY-MM-DD"
              error={fieldErrors.date_of_birth}
              className="sm:col-span-2"
            >
              <Input
                id="date_of_birth"
                name="date_of_birth"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                className="font-mono tabular-nums"
              />
            </Field>

            <Field
              label="Nationality"
              htmlFor="nationality"
              error={fieldErrors.nationality}
              className="sm:col-span-2"
            >
              <Input id="nationality" name="nationality" autoComplete="country-name" />
            </Field>
          </div>
        )}
      </section>

      {/* ---- Contact ------------------------------------------------------ */}
      <section className="flex flex-col gap-5">
        <CaptionRule>Contact</CaptionRule>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="First Name" htmlFor="first_name" required error={fieldErrors.first_name}>
            <Input id="first_name" name="first_name" autoComplete="given-name" />
          </Field>

          <Field label="Last Name" htmlFor="last_name" required error={fieldErrors.last_name}>
            <Input id="last_name" name="last_name" autoComplete="family-name" />
          </Field>

          <Field label="Email" htmlFor="email" required error={fieldErrors.email}>
            <Input id="email" name="email" type="email" autoComplete="email" />
          </Field>

          <Field
            label="Mobile"
            htmlFor="phone"
            required
            hint="SA number"
            error={fieldErrors.phone}
          >
            <Input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              placeholder="082 123 4567"
              className="font-mono tabular-nums"
            />
          </Field>
        </div>
      </section>

      {/* ---- Preferences -------------------------------------------------- */}
      <section className="flex flex-col gap-5">
        <CaptionRule>Preferences</CaptionRule>

        <Field label="Preferred Format" htmlFor="preferred_uom">
          <div className="grid grid-cols-3 gap-2">
            {PREFERRED_UOMS.map((uom, index) => (
              <label
                key={uom}
                className="hairline-active flex cursor-pointer items-center justify-center bg-surface px-3 py-3 font-mono text-[0.625rem] uppercase tracking-[0.18em] has-[:checked]:border-gold has-[:checked]:text-gold"
              >
                <input
                  type="radio"
                  name="preferred_uom"
                  value={uom}
                  defaultChecked={index === 0}
                  className="sr-only"
                />
                {UOM_LABEL[uom]}
              </label>
            ))}
          </div>
        </Field>

        {branches.length > 0 ? (
          <Field label="Home Branch" htmlFor="home_branch_id">
            <select
              id="home_branch_id"
              name="home_branch_id"
              className="h-12 w-full border border-[color:var(--border-mono)] bg-surface px-4 text-base text-foreground focus:border-gold focus:outline-none"
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                  {branch.suburb ? ` — ${branch.suburb}` : ''}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </section>

      {/* ---- Declarations ------------------------------------------------- */}
      <section className="flex flex-col gap-4">
        <CaptionRule>Declarations</CaptionRule>

        <Card className="flex flex-col gap-4 p-5">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              name="accept_age"
              className="mt-1 size-4 shrink-0 accent-[color:var(--accent-gold)]"
            />
            <span className="text-sm leading-relaxed text-muted-foreground">
              I confirm I am <span className="text-foreground">{LEGAL_AGE} years or older</span> and
              that the identity document I have supplied is my own.
            </span>
          </label>
          {fieldErrors.accept_age ? (
            <p role="alert" className="font-mono text-[0.6875rem] text-destructive">
              {fieldErrors.accept_age}
            </p>
          ) : null}

          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              name="accept_terms"
              className="mt-1 size-4 shrink-0 accent-[color:var(--accent-gold)]"
            />
            <span className="text-sm leading-relaxed text-muted-foreground">
              I have read and accept the{' '}
              <span className="text-gold">420 Cartel Private Member Agreement</span> and consent to
              my identity documents being stored for compliance purposes.
            </span>
          </label>
          {fieldErrors.accept_terms ? (
            <p role="alert" className="font-mono text-[0.6875rem] text-destructive">
              {fieldErrors.accept_terms}
            </p>
          ) : null}

          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              name="marketing_opt_in"
              value="true"
              className="mt-1 size-4 shrink-0 accent-[color:var(--accent-gold)]"
            />
            <span className="text-sm leading-relaxed text-muted-foreground">
              Send me new drop announcements. Optional.
            </span>
          </label>
        </Card>
      </section>

      {formError ? (
        <p
          role="alert"
          className="border-l-2 border-destructive bg-destructive/5 px-4 py-3 font-mono text-[0.6875rem] text-red-300"
        >
          {formError}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <Button type="submit" variant="gold" size="lg" block disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="animate-spin" />
              Verifying
            </>
          ) : (
            <>
              Verify Identity
              <ArrowRight />
            </>
          )}
        </Button>
        <Label className="text-center">
          Step 1 of 3 · Identity &amp; {LEGAL_AGE}+ verification
        </Label>
      </div>
    </form>
  );
}
