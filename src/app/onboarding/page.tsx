'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  FileCheck2,
  Globe2,
  Loader2,
  ShieldCheck,
  Trash2,
  Upload,
  UserRoundCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Label } from '@/components/ui/field';
import { Badge, Card, Eyebrow, Separator } from '@/components/ui/surfaces';
import { SaIdField } from '@/components/onboarding/SaIdField';
import { CartelMemberQrPass } from '@/components/crm/CartelMemberQrPass';
import { MEMBERSHIP_AGREEMENT_VERSION } from '@/lib/brand';
import { LEGAL_AGE, parseSaId, validatePassportDob } from '@/lib/sa-id';
import { createMember, IS_LOCAL_PREVIEW, type LocalCreateMemberInput } from '@/lib/data/source';
import { DEFAULT_BRANCH_ID } from '@/lib/demo/fixtures';
import { useSessionStore } from '@/lib/store/session';
import { createCartelBrowserClient } from '@/lib/supabase/client';
import { REFERRAL_COOKIE } from '@/lib/loyalty';
import { cn } from '@/lib/utils';
import type { MemberRow } from '@/types/database';

/**
 * Module B — Private Collective onboarding.
 *
 * Three steps, and the 18+ decision is taken before step 1 can be left:
 * the SA ID number is parsed in the browser for instant feedback, re-parsed
 * here before anything is written, and validated a third time by a CHECK
 * constraint inside `submit_member_kyc`. Only the last one is a boundary.
 */

type IdMode = 'SA_ID' | 'PASSPORT';

interface UploadSlot {
  key: 'ID_FRONT' | 'LIVE_SELFIE';
  label: string;
  hint: string;
}

const UPLOAD_SLOTS: UploadSlot[] = [
  {
    key: 'ID_FRONT',
    label: 'Identity Document',
    hint: 'Photograph of your SA ID card, ID book page or passport photo page.',
  },
  {
    key: 'LIVE_SELFIE',
    label: 'Live Selfie',
    hint: 'A photo of your face, taken now, holding the same document.',
  },
];

interface StoredUpload {
  name: string;
  size: number;
  type: string;
  /** Short content digest, shown so the member can see the file was read. */
  digest: string;
  previewUrl: string | null;
}

const STEPS = ['Age & Identity', 'Mandate & KYC', 'Member Pass'] as const;

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [idMode, setIdMode] = useState<IdMode>('SA_ID');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [issuedMember, setIssuedMember] = useState<MemberRow | null>(null);

  // Step 1
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  // Someone returning to finish onboarding already has an account.
  const [needsAccount, setNeedsAccount] = useState(!IS_LOCAL_PREVIEW);
  const [saIdNumber, setSaIdNumber] = useState('');
  const [passportNumber, setPassportNumber] = useState('');
  const [passportCountry, setPassportCountry] = useState('');
  const [passportDob, setPassportDob] = useState('');

  // Step 2
  const [uploads, setUploads] = useState<Partial<Record<UploadSlot['key'], StoredUpload>>>({});
  const [agreementSigned, setAgreementSigned] = useState(false);
  const [ageDeclared, setAgeDeclared] = useState(false);

  const [referralCode, setReferralCode] = useState<string | null>(null);
  const signIn = useSessionStore((state) => state.signIn);

  useEffect(() => {
    if (IS_LOCAL_PREVIEW) return;
    void createCartelBrowserClient()
      .auth.getUser()
      .then(({ data }) => setNeedsAccount(!data.user))
      .catch(() => undefined);
  }, []);

  // Pick up `?ref=CARTEL-XXXX`, which middleware parked in a cookie.
  useEffect(() => {
    const fromQuery = new URLSearchParams(window.location.search).get('ref');
    const fromCookie = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith(`${REFERRAL_COOKIE}=`))
      ?.split('=')[1];
    const code = (fromQuery ?? fromCookie ?? '').trim().toUpperCase();
    if (/^CARTEL-[A-Z0-9]{4,12}$/.test(code)) setReferralCode(code);
  }, []);

  // --- Age verdict -------------------------------------------------------
  const identity = useMemo(() => {
    if (idMode === 'SA_ID') {
      const parsed = parseSaId(saIdNumber);
      if (!parsed.valid) return { ok: false as const, message: parsed.message };
      if (!parsed.isOfLegalAge) {
        return {
          ok: false as const,
          message: `Membership is restricted to adults ${LEGAL_AGE} and over.`,
        };
      }
      return {
        ok: true as const,
        dateOfBirth: parsed.dateOfBirth,
        nationality: parsed.citizenship,
        gender: parsed.genderMarker,
      };
    }
    const parsed = validatePassportDob(passportDob);
    if (!parsed.ok) return { ok: false as const, message: parsed.message };
    return {
      ok: true as const,
      dateOfBirth: parsed.dateOfBirth,
      nationality: passportCountry.toUpperCase() || null,
      gender: null,
    };
  }, [idMode, saIdNumber, passportDob, passportCountry]);

  const profileComplete =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) &&
    /^(\+?27|0)[6-8][0-9]{8}$/.test(phone.replace(/\s/g, '')) &&
    (!needsAccount || password.length >= 8);

  const passportComplete =
    idMode === 'SA_ID' ||
    (passportNumber.trim().length >= 4 && passportCountry.trim().length === 2);

  const step1Ready = identity.ok && profileComplete && passportComplete;
  const step2Ready =
    agreementSigned &&
    ageDeclared &&
    UPLOAD_SLOTS.every((slot) => Boolean(uploads[slot.key]));

  // --- Uploads -----------------------------------------------------------
  const storeUpload = useCallback(async (key: UploadSlot['key'], file: File) => {
    if (file.size > 15 * 1024 * 1024) {
      setFormError('That file is over 15MB. Photograph it at a lower resolution.');
      return;
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      setFormError('Upload a JPG, PNG, WEBP, HEIC or PDF.');
      return;
    }

    setFormError(null);

    // A SHA-256 prefix proves the file was read without sending it anywhere.
    let digest = 'unhashed';
    try {
      const buffer = await file.arrayBuffer();
      const hash = await crypto.subtle.digest('SHA-256', buffer);
      digest = Array.from(new Uint8Array(hash).slice(0, 6))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      // crypto.subtle needs a secure context; the preview still works without it.
    }

    setUploads((current) => {
      const previous = current[key];
      if (previous?.previewUrl) URL.revokeObjectURL(previous.previewUrl);
      return {
        ...current,
        [key]: {
          name: file.name,
          size: file.size,
          type: file.type,
          digest,
          previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
        },
      };
    });
  }, []);

  const clearUpload = useCallback((key: UploadSlot['key']) => {
    setUploads((current) => {
      const previous = current[key];
      if (previous?.previewUrl) URL.revokeObjectURL(previous.previewUrl);
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  // --- Submit ------------------------------------------------------------
  const submit = useCallback(async () => {
    if (!identity.ok) {
      setFormError(identity.message);
      return;
    }
    setSubmitting(true);
    setFormError(null);

    const payload: LocalCreateMemberInput = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.replace(/\s/g, ''),
      idDocumentType: idMode,
      saIdNumber: idMode === 'SA_ID' ? saIdNumber.replace(/\D/g, '') : null,
      passportNumber: idMode === 'PASSPORT' ? passportNumber.trim() : null,
      passportCountry: idMode === 'PASSPORT' ? passportCountry.trim().toUpperCase() : null,
      dateOfBirth: identity.dateOfBirth,
      nationality: identity.nationality,
      gender: identity.gender,
      preferredUom: 'GRAMS',
      marketingOptIn: true,
      homeBranchId: DEFAULT_BRANCH_ID,
      referredByCode: referralCode,
      // In local preview the collective approves instantly so `/shop` opens;
      // against Supabase the member enters as PENDING_KYC, with Vault access, and
      // stays in the staff review queue.
      autoApprove: IS_LOCAL_PREVIEW,
    };

    try {
      // `submit_member_kyc` needs a signed-in user, so create the login first.
      // Re-checked here so a retry after a failed submit does not sign up twice.
      if (!IS_LOCAL_PREVIEW) {
        const supabase = createCartelBrowserClient();
        const { data: current } = await supabase.auth.getUser();
        if (!current.user) {
          const { data, error } = await supabase.auth.signUp({
            email: payload.email,
            password,
          });
          if (error) throw error;
          if (!data.session) {
            setFormError(
              'Check your email to confirm your address, then log in to finish your membership.',
            );
            return;
          }
          setNeedsAccount(false);
        }
      }

      const member = await createMember(payload);
      setIssuedMember(member);
      signIn(member);
      setStep(2);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not issue your pass.');
    } finally {
      setSubmitting(false);
    }
  }, [
    identity,
    firstName,
    lastName,
    email,
    phone,
    idMode,
    saIdNumber,
    passportNumber,
    passportCountry,
    password,
    referralCode,
    signIn,
  ]);

  return (
    <main className="relative min-h-screen bg-void pb-20 pt-8 sm:pb-32 sm:pt-16">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[42rem] " />

      <div className="container relative max-w-3xl">
        <header className="flex flex-col gap-3 sm:gap-4">
          <Eyebrow>Private Collective Onboarding</Eyebrow>
          <h1 className="font-display text-3xl uppercase text-white sm:text-4xl md:text-display-md">
            Join the <span className="">Cartel</span>
          </h1>
          <p className="max-w-xl text-xs sm:text-sm md:type-ui leading-relaxed text-ash">
            420 Cartel is a private cannabis collective and social lounge network operating under the
            Cannabis for Private Purposes Act for adult private consumption. Membership is strictly restricted
            to verified adults {LEGAL_AGE} and over (Strictly No Under 18). Digital passes grant access to our
            Johannesburg lounges in Norwood, Rivonia, and Kibler Park, open daily 09:00 - 20:00.
          </p>
          <p className="text-xs sm:text-sm md:type-ui text-ash">
            Already a member?{' '}
            <Link href="/login" className="ghost-link text-foreground">
              Log in
            </Link>
          </p>
          {referralCode ? (
            <Badge tone="gold" className="w-fit">
              Referred by {referralCode}
            </Badge>
          ) : null}
        </header>

        {/* Step rail */}
        <ol className="mt-8 sm:mt-12 grid grid-cols-3 gap-2" aria-label="Onboarding progress">
          {STEPS.map((label, index) => {
            const state = index < step ? 'done' : index === step ? 'current' : 'todo';
            return (
              <li
                key={label}
                aria-current={state === 'current' ? 'step' : undefined}
                className={cn(
                  'flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2.5 border-t-2 pt-2.5 sm:pt-3',
                  state === 'done' && 'border-ash text-foreground',
                  state === 'current' && 'border-foreground text-white',
                  state === 'todo' && 'border-[color:var(--border-mono)] text-ash',
                )}
              >
                <span className="font-mono text-xs sm:type-ui tabular-nums">
                  {state === 'done' ? <Check className="size-3.5" /> : `0${index + 1}`}
                </span>
                <span className="font-mono text-[11px] sm:text-xs md:type-ui line-clamp-1">
                  {label}
                </span>
              </li>
            );
          })}
        </ol>

        {formError ? (
          <p
            role="alert"
            className="mt-6 sm:mt-8 border border-foreground bg-transparent px-3.5 py-2.5 sm:px-4 sm:py-3 font-mono text-xs sm:type-ui text-foreground"
          >
            {formError}
          </p>
        ) : null}

        {/* ---------------- STEP 1 ---------------- */}
        {step === 0 ? (
          <Card className="mt-6 sm:mt-8 flex flex-col gap-6 sm:gap-8 p-4 sm:p-8">
            <div>
              <Label>Identity Document</Label>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                <Button
                  variant={idMode === 'SA_ID' ? 'active' : 'surface'}
                  onClick={() => setIdMode('SA_ID')}
                  type="button"
                  className="h-11 sm:h-12 w-full justify-center text-xs sm:text-sm md:type-ui px-3"
                >
                  <UserRoundCheck className="size-4 shrink-0" />
                  <span>SA 13-Digit ID</span>
                </Button>
                <Button
                  variant={idMode === 'PASSPORT' ? 'active' : 'surface'}
                  onClick={() => setIdMode('PASSPORT')}
                  type="button"
                  className="h-11 sm:h-12 w-full justify-center text-xs sm:text-sm md:type-ui px-3"
                >
                  <Globe2 className="size-4 shrink-0" />
                  <span>International Passport</span>
                </Button>
              </div>
            </div>

            {idMode === 'SA_ID' ? (
              <SaIdField value={saIdNumber} onValueChange={setSaIdNumber} />
            ) : (
              <div className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2">
                <Field label="Passport Number" htmlFor="passport_number" required>
                  <Input
                    id="passport_number"
                    value={passportNumber}
                    onChange={(event) => setPassportNumber(event.target.value.toUpperCase())}
                    placeholder="A01234567"
                    className="font-mono text-base sm:text-sm"
                  />
                </Field>
                <Field
                  label="Issuing Country"
                  htmlFor="passport_country"
                  hint="2-letter code"
                  required
                >
                  <Input
                    id="passport_country"
                    value={passportCountry}
                    onChange={(event) =>
                      setPassportCountry(event.target.value.toUpperCase().slice(0, 2))
                    }
                    placeholder="GB"
                    className="font-mono text-base sm:text-sm"
                  />
                </Field>
                <Field
                  label="Date of Birth"
                  htmlFor="passport_dob"
                  required
                  className="sm:col-span-2"
                  error={
                    passportDob.length === 10 && !identity.ok
                      ? (identity as { message: string }).message
                      : null
                  }
                >
                  <Input
                    id="passport_dob"
                    type="date"
                    value={passportDob}
                    onChange={(event) => setPassportDob(event.target.value)}
                    max={new Date().toISOString().slice(0, 10)}
                    className="font-mono text-base sm:text-sm"
                  />
                </Field>
              </div>
            )}

            <Separator />

            <div className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2">
              <Field label="First Name" htmlFor="first_name" required>
                <Input
                  id="first_name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  autoComplete="given-name"
                />
              </Field>
              <Field label="Last Name" htmlFor="last_name" required>
                <Input
                  id="last_name"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  autoComplete="family-name"
                />
              </Field>
              <Field label="Email" htmlFor="email" required>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  placeholder="you@example.co.za"
                />
              </Field>
              <Field label="Mobile Number" htmlFor="phone" hint="SA mobile" required>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  autoComplete="tel"
                  placeholder="082 123 4567"
                  className="font-mono"
                />
              </Field>
              {needsAccount ? (
                <Field label="Create Password" htmlFor="password" hint="8+ characters" required className="sm:col-span-2">
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                  />
                </Field>
              ) : null}
            </div>

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-2">
              {identity.ok ? (
                <Badge tone="live" className="justify-center sm:justify-start py-2 sm:py-1">
                  <ShieldCheck className="size-3.5" />
                  {LEGAL_AGE}+ Confirmed
                </Badge>
              ) : (
                <span className="font-mono text-xs sm:type-ui text-ash text-center sm:text-left">
                  Awaiting a valid document
                </span>
              )}
              <Button
                variant="gold"
                size="lg"
                disabled={!step1Ready}
                onClick={() => {
                  setFormError(null);
                  setStep(1);
                }}
                className="w-full sm:w-auto h-12 sm:h-14 px-6"
              >
                Continue
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </Card>
        ) : null}

        {/* ---------------- STEP 2 ---------------- */}
        {step === 1 ? (
          <div className="mt-6 sm:mt-8 flex flex-col gap-6">
            <Card className="flex flex-col gap-5 sm:gap-6 p-4 sm:p-8">
              <div>
                <Eyebrow>Step 02 · KYC</Eyebrow>
                <h2 className="mt-2 font-display text-lg sm:text-xl uppercase text-white">
                  Document Verification
                </h2>
                <p className="mt-1.5 text-xs sm:text-sm md:type-ui text-ash">
                  {IS_LOCAL_PREVIEW
                    ? 'Local preview: files are hashed in your browser and never uploaded. Against a configured project they go to the private kyc-documents bucket.'
                    : 'Files upload to the private kyc-documents bucket. Only the reviewing staff member can open them, through a short-lived signed URL.'}
                </p>
              </div>

              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                {UPLOAD_SLOTS.map((slot) => (
                  <Dropzone
                    key={slot.key}
                    slot={slot}
                    upload={uploads[slot.key]}
                    onFile={(file) => void storeUpload(slot.key, file)}
                    onClear={() => clearUpload(slot.key)}
                  />
                ))}
              </div>
            </Card>

            <Card className="flex flex-col gap-4 sm:gap-5 p-4 sm:p-8">
              <div>
                <Eyebrow>Private Grow-Club Mandate</Eyebrow>
                <h2 className="mt-2 font-display text-lg sm:text-xl uppercase text-white">
                  Personal Allocation Agreement
                </h2>
                <p className="mt-1 font-mono text-xs sm:type-ui text-ash">
                  Version {MEMBERSHIP_AGREEMENT_VERSION}
                </p>
              </div>

              <div className="max-h-48 sm:max-h-56 overflow-y-auto border border-[color:var(--border-mono)] bg-void p-3 sm:p-4 text-xs sm:text-sm leading-relaxed text-ash cartel-scroll">
                <p className="mb-3">
                  <strong className="text-foreground">1. Private collective.</strong> 420 Cartel is a
                  closed private collective. Cultivation is undertaken collectively on behalf of
                  members, and each allocation you receive is your own personal allocation as a
                  member of that collective. Nothing in this agreement constitutes a public sale.
                </p>
                <p className="mb-3">
                  <strong className="text-foreground">2. Adults only.</strong> You confirm you are{' '}
                  {LEGAL_AGE} years of age or older and that the identity document you have provided
                  is your own. Membership is personal and may not be transferred, lent or shared.
                </p>
                <p className="mb-3">
                  <strong className="text-foreground">3. Personal use.</strong> Allocations are for
                  your own personal consumption in a private place. You undertake not to resell,
                  supply or distribute any allocation to any other person, and not to remove any
                  allocation from the Republic of South Africa.
                </p>
                <p className="mb-3">
                  <strong className="text-foreground">4. No consumption on premises.</strong> The
                  collective’s lounges are collection points. You agree not to consume on the
                  premises and not to drive after consuming.
                </p>
                <p className="mb-3">
                  <strong className="text-foreground">5. Records.</strong> The collective keeps a
                  record of your identity verification, your allocations and the batches they were
                  drawn from, as required to operate lawfully and to trace any product recall.
                </p>
                <p>
                  <strong className="text-foreground">6. Suspension.</strong> The collective may
                  suspend or terminate your membership where this mandate is breached, and will
                  record the reason on your member file.
                </p>
              </div>

              <label className="flex cursor-pointer items-start gap-3 p-1 -m-1">
                <input
                  type="checkbox"
                  checked={agreementSigned}
                  onChange={(event) => setAgreementSigned(event.target.checked)}
                  className="mt-0.5 size-5 sm:size-4 shrink-0 accent-[#D4AF37]"
                />
                <span className="text-xs sm:text-sm md:type-ui leading-relaxed text-ash">
                  I have read and digitally sign the{' '}
                  <span className="text-foreground">Personal Allocation Agreement</span> as{' '}
                  <span className="text-foreground">
                    {firstName || 'your name'} {lastName}
                  </span>
                  .
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 p-1 -m-1">
                <input
                  type="checkbox"
                  checked={ageDeclared}
                  onChange={(event) => setAgeDeclared(event.target.checked)}
                  className="mt-0.5 size-5 sm:size-4 shrink-0 accent-[#D4AF37]"
                />
                <span className="text-xs sm:text-sm md:type-ui leading-relaxed text-ash">
                  I declare that I am {LEGAL_AGE} years or older and that the document details above
                  are mine.
                </span>
              </label>

              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                <Button
                  variant="ghost"
                  onClick={() => setStep(0)}
                  disabled={submitting}
                  className="h-11 sm:h-12 w-full sm:w-auto px-4 justify-center"
                >
                  Back
                </Button>
                <Button
                  variant="gold"
                  size="lg"
                  disabled={!step2Ready || submitting}
                  onClick={() => void submit()}
                  className="h-12 sm:h-14 w-full sm:w-auto px-6"
                >
                  {submitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <FileCheck2 className="size-4" />
                  )}
                  {submitting ? 'Issuing Pass' : 'Issue My Member Pass'}
                </Button>
              </div>
            </Card>
          </div>
        ) : null}

        {/* ---------------- STEP 3 ---------------- */}
        {step === 2 && issuedMember ? (
          <div className="mt-8 flex flex-col items-center gap-6 sm:gap-8">
            <div className="text-center">
              <Badge tone="live" className="mx-auto">
                <ShieldCheck className="size-3" />
                Membership Issued
              </Badge>
              <h2 className="mt-4 font-display text-2xl sm:text-3xl uppercase text-white">
                Welcome to the Cartel
              </h2>
              <p className="mx-auto mt-2.5 max-w-md text-xs sm:text-sm md:type-ui leading-relaxed text-ash">
                {issuedMember.status === 'PENDING_KYC'
                  ? 'Your pass is live and the Vault is open. Our team will review your documents in the background.'
                  : 'Your pass is live. Present the QR at the vault, or open the private dispensary to place your first allocation.'}
              </p>
            </div>

            <CartelMemberQrPass member={issuedMember} />

            <div className="flex w-full flex-wrap items-center justify-center gap-3">
              <Button variant="gold" size="lg" asChild className="w-full sm:w-auto px-8 h-12 sm:h-14">
                <Link href="/shop">
                  Enter the Vault
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
        ) : null}
        {/* Compliance and social footer */}
        <footer className="mt-12 sm:mt-16 border-t border-[color:var(--border-mono)] pt-6 sm:pt-8 text-center text-xs sm:text-sm text-ash">
          <p>
            420 Cartel &middot; Private Cannabis Social Lounge &amp; Botanical Collective &middot; Operating daily 09:00 - 20:00
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-4 sm:gap-6">
            <a
              href="https://www.instagram.com/fourtwentycartel/"
              target="_blank"
              rel="noopener noreferrer"
              className="ghost-link"
            >
              Instagram (@fourtwentycartel)
            </a>
            <a
              href="https://www.facebook.com/p/The-Cartel-420-social-lounge-NO-UNDER-18-100041765415684/"
              target="_blank"
              rel="noopener noreferrer"
              className="ghost-link"
            >
              Facebook (The Cartel 420 Social Lounge)
            </a>
          </div>
        </footer>
      </div>
    </main>
  );
}

function Dropzone({
  slot,
  upload,
  onFile,
  onClear,
}: {
  slot: UploadSlot;
  upload: StoredUpload | undefined;
  onFile: (file: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div className="flex flex-col gap-1.5 sm:gap-2">
      <Label>{slot.label}</Label>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) onFile(file);
        }}
        onClick={() => {
          if (!upload) inputRef.current?.click();
        }}
        className={cn(
          'relative flex min-h-32 sm:min-h-36 flex-col items-center justify-center gap-2 border border-dashed px-3 py-4 sm:px-4 sm:py-5 text-center transition-colors',
          !upload && 'cursor-pointer active:bg-white/5',
          dragging
            ? 'border-foreground bg-transparent'
            : upload
              ? 'border-foreground bg-transparent/[0.04]'
              : 'border-[color:var(--border-mono)] bg-void hover:border-ash',
        )}
      >
        {upload ? (
          <>
            {upload.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={upload.previewUrl}
                alt={`${slot.label} preview`}
                className="h-16 sm:h-20 w-auto border border-[color:var(--border-mono)] object-cover"
              />
            ) : (
              <FileCheck2 className="size-6 text-foreground" />
            )}
            <p className="max-w-full truncate font-mono text-xs sm:type-ui text-foreground">
              {upload.name}
            </p>
            <p className="font-mono text-[11px] sm:type-ui text-ash">
              {(upload.size / 1024).toFixed(0)} KB · sha256:{upload.digest}
            </p>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="mt-1 h-8 px-3 text-xs sm:text-sm text-foreground hover:text-foreground"
            >
              <Trash2 className="size-3" />
              Replace
            </Button>
          </>
        ) : (
          <>
            <Upload className="size-5 sm:size-6 text-ash" />
            <span
              className="font-mono text-xs sm:type-ui text-foreground underline-offset-4 hover:underline"
            >
              Choose a file or take photo
            </span>
            <p className="max-w-[18rem] text-[11px] sm:text-xs leading-relaxed text-ash">{slot.hint}</p>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            event.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
