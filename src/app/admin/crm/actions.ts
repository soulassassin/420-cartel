'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { translateDbError } from '@/lib/supabase/errors';
import { signKycDocument } from '@/lib/supabase/admin';
import { createCartelServerClient, getViewer } from '@/lib/supabase/server';
import type { ActionResult } from '@/app/onboarding/actions';
import type { MemberStatus } from '@/types/database';

/**
 * Module B (admin half) — compliance desk actions.
 *
 * Every mutation here is authorised twice: a cheap `getViewer()` check so the
 * UI can fail fast with a readable message, and the real boundary inside the
 * Postgres function (`review_member_kyc` and `adjust_member_credit` both raise
 * CARTEL_FORBIDDEN unless `is_manager()`). The second one is what actually
 * protects the data — a forged request that skips this file still cannot
 * approve a member.
 */

const reviewSchema = z.object({
  member_id: z.string().uuid(),
  approve: z.enum(['true', 'false']).transform((value) => value === 'true'),
  reason: z.string().trim().max(500).optional(),
});

export async function reviewKyc(formData: FormData): Promise<ActionResult> {
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: 'Invalid review request.' };
  }

  const { member_id, approve, reason } = parsed.data;

  // A rejection without a reason is useless to the member who has to fix it.
  if (!approve && (!reason || reason.length < 4)) {
    return {
      ok: false,
      error: 'Give a rejection reason — the member sees it and has to act on it.',
      fieldErrors: { reason: 'Required when rejecting.' },
    };
  }

  const viewer = await getViewer();
  if (!viewer.isManager) {
    return { ok: false, error: 'Only owners and managers may review KYC.' };
  }

  const supabase = await createCartelServerClient();
  const { error } = await supabase.rpc('review_member_kyc', {
    p_member_id: member_id,
    p_approve: approve,
    p_reason: reason ?? undefined,
  });

  if (error) return { ok: false, error: translateDbError(error.message) };

  revalidatePath('/admin/crm');
  revalidatePath(`/admin/crm/${member_id}`);
  return { ok: true };
}

const creditSchema = z.object({
  member_id: z.string().uuid(),
  // Rands as typed by a manager, converted to cents here.
  amount_rands: z.coerce.number().refine((value) => value !== 0, 'Enter a non-zero amount.'),
  reason: z.string().trim().min(4, 'Give a reason — it lands on the member ledger.').max(300),
});

export async function adjustCredit(
  formData: FormData,
): Promise<ActionResult<{ balanceCents: number }>> {
  const parsed = creditSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? 'Invalid credit adjustment.' };
  }

  const viewer = await getViewer();
  if (!viewer.isManager) {
    return { ok: false, error: 'Only owners and managers may adjust member credit.' };
  }

  const deltaCents = Math.round(parsed.data.amount_rands * 100);

  const supabase = await createCartelServerClient();
  const { data, error } = await supabase.rpc('adjust_member_credit', {
    p_member_id: parsed.data.member_id,
    p_delta_cents: deltaCents,
    p_reason: parsed.data.reason,
  });

  if (error) {
    // A debit below zero trips the members_credit_balance_cents check.
    if (error.message.includes('credit_balance_cents')) {
      return { ok: false, error: 'That debit would take the balance below zero.' };
    }
    return { ok: false, error: translateDbError(error.message) };
  }

  revalidatePath(`/admin/crm/${parsed.data.member_id}`);
  return { ok: true, data: { balanceCents: data as unknown as number } };
}

const statusSchema = z.object({
  member_id: z.string().uuid(),
  status: z.enum(['PENDING_KYC', 'ACTIVE_MEMBER', 'VIP', 'SUSPENDED']),
  reason: z.string().trim().max(500).optional(),
});

/**
 * Status changes outside the KYC flow: promoting to VIP, suspending, or
 * reinstating. Writes through the table (staff RLS permits it) and records an
 * audit row, because a suspension is the kind of thing that gets disputed.
 */
export async function setMemberStatus(formData: FormData): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: 'Invalid status change.' };

  const { member_id, status, reason } = parsed.data;

  if (status === 'SUSPENDED' && (!reason || reason.length < 4)) {
    return {
      ok: false,
      error: 'A suspension needs a recorded reason.',
      fieldErrors: { reason: 'Required when suspending.' },
    };
  }

  const viewer = await getViewer();
  if (!viewer.isManager) {
    return { ok: false, error: 'Only owners and managers may change member status.' };
  }

  const supabase = await createCartelServerClient();

  const { data: before } = await supabase
    .from('members')
    .select('status, suspended_reason')
    .eq('id', member_id)
    .maybeSingle();

  const { error } = await supabase
    .from('members')
    .update({
      status: status as MemberStatus,
      suspended_reason: status === 'SUSPENDED' ? (reason ?? null) : null,
    })
    .eq('id', member_id);

  if (error) return { ok: false, error: translateDbError(error.message) };

  await supabase.from('audit_logs').insert({
    actor_id: viewer.userId,
    actor_role: viewer.staff?.role ?? null,
    action: 'MEMBER_STATUS_CHANGED',
    entity: 'members',
    entity_id: member_id,
    before_data: before ?? null,
    after_data: { status, suspended_reason: status === 'SUSPENDED' ? (reason ?? null) : null },
  });

  revalidatePath('/admin/crm');
  revalidatePath(`/admin/crm/${member_id}`);
  return { ok: true };
}

/**
 * Short-lived signed URL for one KYC document.
 *
 * Deliberately not rendered into the page: the URL is minted on demand, lives
 * 120 seconds, and is never persisted anywhere. A reviewer who leaves the tab
 * open does not leave a working link to someone's ID document behind.
 */
export async function getKycDocumentUrl(
  storagePath: string,
): Promise<ActionResult<{ url: string }>> {
  const viewer = await getViewer();
  if (!viewer.isStaff) {
    return { ok: false, error: 'Staff access required.' };
  }

  // Confirm the path belongs to a real KYC row rather than trusting the client.
  const supabase = await createCartelServerClient();
  const { data: document } = await supabase
    .from('kyc_documents')
    .select('id')
    .eq('storage_path', storagePath)
    .maybeSingle();

  if (!document) {
    return { ok: false, error: 'That document is not on file.' };
  }

  const url = await signKycDocument(storagePath);
  if (!url) {
    return { ok: false, error: 'Could not open that document. It may have been removed.' };
  }

  return { ok: true, data: { url } };
}
