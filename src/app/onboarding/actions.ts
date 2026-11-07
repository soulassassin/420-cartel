'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { MEMBERSHIP_AGREEMENT_VERSION } from '@/lib/brand';
import { REFERRAL_COOKIE, affiliateTracker } from '@/lib/loyalty';
import { LEGAL_AGE, parseSaId, validatePassportDob } from '@/lib/sa-id';
import { createCartelServerClient } from '@/lib/supabase/server';
import type { Json, KycDocumentType, MemberRow } from '@/types/database';

/**
 * Module B — onboarding server actions.
 *
 * The 18+ decision is made three times on purpose:
 *   1. in the browser, for instant feedback (lib/sa-id.ts)
 *   2. here, before anything is written
 *   3. in Postgres, as a CHECK constraint plus a guard inside
 *      `submit_member_kyc` that cannot be bypassed by any client
 *
 * Only the third one is a security boundary; the first two exist so a visitor
 * is never told "no" by a database error.
 */

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  data?: T;
}

const phoneSchema = z
  .string()
  .trim()
  .min(10, 'Enter a contactable mobile number.')
  .max(20, 'That number is too long.')
  .regex(/^(\+?27|0)[6-8][0-9]{8}$/, 'Enter a South African mobile number, e.g. 082 123 4567.');

const baseProfileSchema = z.object({
  first_name: z.string().trim().min(1, 'Required').max(80),
  last_name: z.string().trim().min(1, 'Required').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  phone: phoneSchema,
  preferred_uom: z.enum(['GRAMS', 'MILLILITERS', 'UNITS']).default('GRAMS'),
  marketing_opt_in: z.coerce.boolean().default(false),
  home_branch_id: z.string().uuid().optional().nullable(),
  accept_terms: z.literal('on', {
    errorMap: () => ({ message: 'You must accept the membership agreement.' }),
  }),
  accept_age: z.literal('on', {
    errorMap: () => ({ message: `You must confirm you are ${LEGAL_AGE} or older.` }),
  }),
});

const saIdSchema = baseProfileSchema.extend({
  id_document_type: z.literal('SA_ID'),
  sa_id_number: z.string().trim().min(1, 'Enter your ID number.'),
});

const passportSchema = baseProfileSchema.extend({
  id_document_type: z.literal('PASSPORT'),
  passport_number: z.string().trim().min(4, 'Enter your passport number.').max(40),
  passport_country: z.string().trim().length(2, 'Select the issuing country.'),
  date_of_birth: z.string().trim(),
  nationality: z.string().trim().max(80).optional(),
});

const onboardingSchema = z.discriminatedUnion('id_document_type', [saIdSchema, passportSchema]);

function flattenFieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}

/**
 * Step 1 — identity + age verification. Creates or updates the member profile
 * in PENDING_KYC and stamps `age_verified_at`.
 */
export async function submitOnboarding(
  formData: FormData,
): Promise<ActionResult<{ memberCode: string; memberId: string }>> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = onboardingSchema.safeParse(raw);

  if (!parsed.success) {
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors: flattenFieldErrors(parsed.error) };
  }

  const input = parsed.data;

  // --- Age gate -----------------------------------------------------------
  let dateOfBirth: string;
  let nationality: string | null = null;
  let genderMarker: string | null = null;

  if (input.id_document_type === 'SA_ID') {
    const result = parseSaId(input.sa_id_number);
    if (!result.valid) {
      return { ok: false, error: result.message, fieldErrors: { sa_id_number: result.message } };
    }
    if (!result.isOfLegalAge) {
      return {
        ok: false,
        error: `420 Cartel membership is restricted to adults ${LEGAL_AGE} and over.`,
        fieldErrors: { sa_id_number: `That ID number shows an age of ${result.age}.` },
      };
    }
    dateOfBirth = result.dateOfBirth;
    nationality = result.citizenship;
    genderMarker = result.genderMarker;
  } else {
    const result = validatePassportDob(input.date_of_birth);
    if (!result.ok) {
      return { ok: false, error: result.message, fieldErrors: { date_of_birth: result.message } };
    }
    dateOfBirth = result.dateOfBirth;
    nationality = input.nationality ?? null;
  }

  // --- Referral attribution ----------------------------------------------
  const cookieStore = await cookies();
  const referralCookie = cookieStore.get(REFERRAL_COOKIE)?.value;
  const referredBy = referralCookie ? affiliateTracker.normalizeCode(referralCookie) : null;

  const supabase = await createCartelServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: 'Your session expired. Sign in again to continue onboarding.' };
  }

  const payload: Record<string, Json> = {
    first_name: input.first_name,
    last_name: input.last_name,
    email: input.email,
    phone: input.phone.replace(/\s/g, ''),
    id_document_type: input.id_document_type,
    date_of_birth: dateOfBirth,
    nationality,
    gender: genderMarker,
    preferred_uom: input.preferred_uom,
    marketing_opt_in: input.marketing_opt_in,
    home_branch_id: input.home_branch_id ?? null,
    referred_by_code: referredBy,
    ...(input.id_document_type === 'SA_ID'
      ? { sa_id_number: input.sa_id_number.replace(/\D/g, '') }
      : {
          passport_number: input.passport_number,
          passport_country: input.passport_country.toUpperCase(),
        }),
  };

  const { data, error } = await supabase.rpc('submit_member_kyc', { p_payload: payload });

  if (error) {
    return { ok: false, error: translateDbError(error.message) };
  }

  const member = data as unknown as MemberRow;
  revalidatePath('/onboarding');

  return { ok: true, data: { memberCode: member.member_code, memberId: member.id } };
}

const DOC_TYPES: readonly KycDocumentType[] = [
  'ID_FRONT',
  'ID_BACK',
  'PASSPORT_PAGE',
  'LIVE_SELFIE',
  'PROOF_OF_ADDRESS',
  'SIGNED_AGREEMENT',
];

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
]);

/**
 * Step 2 — KYC document upload.
 *
 * Files go to the private `kyc-documents` bucket under the member's own uid
 * prefix, which is the only path their storage policy permits them to write.
 */
export async function uploadKycDocument(formData: FormData): Promise<ActionResult<{ path: string }>> {
  const docType = formData.get('doc_type');
  const file = formData.get('file');

  if (typeof docType !== 'string' || !DOC_TYPES.includes(docType as KycDocumentType)) {
    return { ok: false, error: 'Unknown document type.' };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Choose a file to upload.' };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: 'That file is over 15MB. Photograph it at a lower resolution.' };
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return { ok: false, error: 'Upload a JPG, PNG, WEBP, HEIC or PDF.' };
  }

  const supabase = await createCartelServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: 'Your session expired. Sign in again.' };

  const extension = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
  // The uid prefix is what the storage RLS policy checks.
  const path = `${user.id}/${docType.toLowerCase()}-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from('kyc-documents')
    .upload(path, file, { contentType: file.type, upsert: true });

  if (uploadError) {
    return { ok: false, error: `Upload failed: ${uploadError.message}` };
  }

  // Replace any previous submission of this document type, resetting review.
  const { error: rowError } = await supabase
    .from('kyc_documents')
    .upsert(
      {
        member_id: user.id,
        doc_type: docType as KycDocumentType,
        storage_path: path,
        mime_type: file.type,
        byte_size: file.size,
        review_status: 'PENDING',
        rejection_reason: null,
      },
      { onConflict: 'member_id,doc_type' },
    );

  if (rowError) {
    // Do not leave an orphaned object in the bucket.
    await supabase.storage.from('kyc-documents').remove([path]);
    return { ok: false, error: translateDbError(rowError.message) };
  }

  revalidatePath('/onboarding');
  return { ok: true, data: { path } };
}

/**
 * Step 3 — sign the membership agreement. The signature image is stored
 * alongside the KYC documents and recorded against the profile.
 */
export async function signAgreement(formData: FormData): Promise<ActionResult> {
  const signature = formData.get('signature');

  if (typeof signature !== 'string' || !signature.startsWith('data:image/png;base64,')) {
    return { ok: false, error: 'Draw your signature before submitting.' };
  }

  const base64 = signature.slice('data:image/png;base64,'.length);
  const bytes = Buffer.from(base64, 'base64');

  if (bytes.byteLength < 512) {
    return { ok: false, error: 'That signature looks empty — sign across the panel.' };
  }
  if (bytes.byteLength > 2 * 1024 * 1024) {
    return { ok: false, error: 'Signature image is too large.' };
  }

  const supabase = await createCartelServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: 'Your session expired. Sign in again.' };

  const path = `${user.id}/signed-agreement-${MEMBERSHIP_AGREEMENT_VERSION}.png`;

  const { error: uploadError } = await supabase.storage
    .from('kyc-documents')
    .upload(path, bytes, { contentType: 'image/png', upsert: true });

  if (uploadError) {
    return { ok: false, error: `Could not store the signature: ${uploadError.message}` };
  }

  await supabase.from('kyc_documents').upsert(
    {
      member_id: user.id,
      doc_type: 'SIGNED_AGREEMENT' as KycDocumentType,
      storage_path: path,
      mime_type: 'image/png',
      byte_size: bytes.byteLength,
      review_status: 'PENDING',
    },
    { onConflict: 'member_id,doc_type' },
  );

  const { error } = await supabase.rpc('sign_membership_agreement', {
    p_version: MEMBERSHIP_AGREEMENT_VERSION,
    p_signature_path: path,
  });

  if (error) return { ok: false, error: translateDbError(error.message) };

  revalidatePath('/onboarding');
  return { ok: true };
}

/** Rotates the QR token on the member's wallet pass. */
export async function rotatePassToken(): Promise<ActionResult<{ token: string }>> {
  const supabase = await createCartelServerClient();
  const { data, error } = await supabase.rpc('rotate_member_qr_token');

  if (error) return { ok: false, error: translateDbError(error.message) };

  revalidatePath('/pass');
  return { ok: true, data: { token: data as unknown as string } };
}

/**
 * Turns a `CARTEL_*` exception from Postgres into something a member can act
 * on. Anything unrecognised is reported generically rather than leaking SQL.
 */
export function translateDbError(message: string): string {
  const match = /CARTEL_([A-Z_]+):\s*(.*)/.exec(message);
  if (match) {
    const detail = match[2]?.trim();
    if (detail) return detail.charAt(0).toUpperCase() + detail.slice(1);
  }
  if (message.includes('members_legal_age')) {
    return `420 Cartel membership is restricted to adults ${LEGAL_AGE} and over.`;
  }
  if (message.includes('members_sa_id_shape') || message.includes('members_sa_id_dob_match')) {
    return 'That ID number did not validate. Check for a typo.';
  }
  if (message.includes('members_sa_id_unique')) {
    return 'That ID number is already registered to a member.';
  }
  if (message.includes('duplicate key')) {
    return 'That record already exists.';
  }
  return 'Something went wrong. Try again, or contact the collective.';
}
