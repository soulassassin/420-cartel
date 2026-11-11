'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ExternalLink, Eye, Loader2, X } from 'lucide-react';
import { getKycDocumentUrl, reviewKyc } from '@/app/admin/crm/actions';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/field';
import { Badge, Card, Separator } from '@/components/ui/surfaces';
import type { KycDocumentRow, MemberRow } from '@/types/database';

const DOC_LABEL: Record<string, string> = {
  ID_FRONT: 'ID — Front',
  ID_BACK: 'ID — Back',
  PASSPORT_PAGE: 'Passport Page',
  LIVE_SELFIE: 'Live Selfie',
  PROOF_OF_ADDRESS: 'Proof of Address',
  SIGNED_AGREEMENT: 'Signed Agreement',
};

/**
 * Compliance review panel.
 *
 * Documents are opened through a 120-second signed URL minted on click, in a
 * new tab — never embedded. That keeps identity documents out of the page
 * source, out of the browser cache for this route, and off the screen unless a
 * reviewer deliberately asks for one.
 */
export function KycReviewPanel({
  member,
  documents,
}: {
  member: MemberRow;
  documents: KycDocumentRow[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'rejecting'>('idle');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openDocument(storagePath: string) {
    setError(null);
    setOpening(storagePath);
    startTransition(async () => {
      const result = await getKycDocumentUrl(storagePath);
      setOpening(null);
      if (!result.ok || !result.data) {
        setError(result.error ?? 'Could not open that document.');
        return;
      }
      window.open(result.data.url, '_blank', 'noopener,noreferrer');
    });
  }

  function submit(approve: boolean) {
    setError(null);
    const formData = new FormData();
    formData.set('member_id', member.id);
    formData.set('approve', String(approve));
    if (!approve) formData.set('reason', reason);

    startTransition(async () => {
      const result = await reviewKyc(formData);
      if (!result.ok) {
        setError(result.error ?? 'Review failed.');
        return;
      }
      setMode('idle');
      setReason('');
      router.refresh();
    });
  }

  const agreementSigned = member.agreement_signed_at !== null;
  const alreadyActive = member.status === 'ACTIVE_MEMBER' || member.status === 'VIP';

  return (
    <Card className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="font-display text-base uppercase ">KYC Review</p>
          <p className="type-ui text-ash">
            {documents.length} document{documents.length === 1 ? '' : 's'} on file
          </p>
        </div>
        <Badge
          tone={
            member.status === 'SUSPENDED'
              ? 'danger'
              : alreadyActive
                ? 'live'
                : 'warn'
          }
        >
          {member.status.replace('_', ' ')}
        </Badge>
      </div>

      {/* ---- Documents --------------------------------------------------- */}
      <div className="flex flex-col divide-y divide-[color:var(--border-mono)]">
        {documents.length === 0 ? (
          <p className="py-4 font-mono type-ui text-ash">
            No documents uploaded yet
          </p>
        ) : (
          documents.map((document) => (
            <div key={document.id} className="flex items-center justify-between gap-4 py-3">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate font-mono type-ui ">
                  {DOC_LABEL[document.doc_type] ?? document.doc_type}
                </span>
                <span className="font-mono type-ui text-ash">
                  {document.byte_size
                    ? `${Math.round(document.byte_size / 1024)} KB`
                    : 'size unknown'}{' '}
                  · {new Date(document.created_at).toLocaleString('en-ZA')}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Badge
                  tone={
                    document.review_status === 'APPROVED'
                      ? 'live'
                      : document.review_status === 'REJECTED'
                        ? 'danger'
                        : 'warn'
                  }
                >
                  {document.review_status}
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => openDocument(document.storage_path)}
                  disabled={pending}
                >
                  {opening === document.storage_path ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Eye />
                  )}
                  View
                  <ExternalLink className="size-3" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <Separator />

      {/* ---- Gate explanation -------------------------------------------- */}
      {!agreementSigned ? (
        <p className="border-l-2 border-foreground bg-transparent px-4 py-3 type-ui text-foreground">
          This member has not signed the membership agreement yet. Approval is blocked by the
          database until they do.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="border-l-2 border-foreground bg-transparent px-4 py-3 font-mono type-ui text-foreground"
        >
          {error}
        </p>
      ) : null}

      {/* ---- Decision ---------------------------------------------------- */}
      {mode === 'rejecting' ? (
        <div className="flex flex-col gap-4">
          <Field
            label="Rejection Reason"
            htmlFor="reason"
            required
            hint="The member sees this"
          >
            <Textarea
              id="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. The selfie is too dark to match against your ID. Please retake it in better light."
            />
          </Field>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="flex-1"
              onClick={() => submit(false)}
              disabled={pending || reason.trim().length < 4}
            >
              {pending ? <Loader2 className="animate-spin" /> : <X />}
              Confirm Rejection
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setMode('idle')}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="gold"
            size="default"
            className="flex-1"
            onClick={() => submit(true)}
            disabled={pending || !agreementSigned || documents.length === 0 || alreadyActive}
          >
            {pending ? <Loader2 className="animate-spin" /> : <Check />}
            {alreadyActive ? 'Already Approved' : 'Approve Membership'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="default"
            className="flex-1"
            onClick={() => setMode('rejecting')}
            disabled={pending || documents.length === 0}
          >
            <X />
            Reject
          </Button>
        </div>
      )}
    </Card>
  );
}
