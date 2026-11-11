'use client';

import { useRef, useState, useTransition } from 'react';
import { Camera, CheckCircle2, FileUp, Loader2, XCircle } from 'lucide-react';
import { uploadKycDocument } from '@/app/onboarding/actions';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/surfaces';
import type { KycDocumentType, KycReviewStatus } from '@/types/database';

/**
 * One KYC document slot.
 *
 * `capture="user"` on the selfie slot opens the front camera directly on a
 * phone, which is the whole point of a live selfie — a gallery pick defeats it.
 * Nothing is previewed back from the bucket: once uploaded, a member cannot
 * re-read their own approved document, by storage policy.
 */

export interface KycSlotConfig {
  docType: KycDocumentType;
  title: string;
  description: string;
  selfie?: boolean;
}

export function KycUploader({
  slot,
  initialStatus,
  rejectionReason,
}: {
  slot: KycSlotConfig;
  initialStatus: KycReviewStatus | null;
  rejectionReason: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<KycReviewStatus | null>(initialStatus);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setFileName(file.name);

    const formData = new FormData();
    formData.set('doc_type', slot.docType);
    formData.set('file', file);

    startTransition(async () => {
      const result = await uploadKycDocument(formData);
      if (!result.ok) {
        setError(result.error ?? 'Upload failed.');
        setFileName(null);
        return;
      }
      setStatus('PENDING');
    });
  }

  const approved = status === 'APPROVED';
  const rejected = status === 'REJECTED';

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="font-display text-sm uppercase ">{slot.title}</p>
          <p className="type-ui leading-relaxed text-ash">{slot.description}</p>
        </div>

        {approved ? (
          <Badge tone="live">
            <CheckCircle2 className="size-3" />
            Approved
          </Badge>
        ) : rejected ? (
          <Badge tone="danger">
            <XCircle className="size-3" />
            Rejected
          </Badge>
        ) : status === 'PENDING' ? (
          <Badge tone="warn">Under Review</Badge>
        ) : (
          <Badge tone="mono">Required</Badge>
        )}
      </div>

      {rejected && rejectionReason ? (
        <p className="border-l-2 border-foreground bg-transparent px-3 py-2 type-ui text-foreground">
          {rejectionReason}
        </p>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept={slot.selfie ? 'image/*' : 'image/*,application/pdf'}
        {...(slot.selfie ? { capture: 'user' as const } : {})}
        onChange={onPick}
        className="sr-only"
        aria-label={slot.title}
      />

      <div className="flex items-center justify-between gap-3">
        <p className="truncate font-mono type-ui text-ash">
          {fileName ?? (status ? 'On file' : 'No file selected')}
        </p>
        <Button
          type="button"
          variant={approved ? 'ghost' : 'surface'}
          size="sm"
          disabled={pending || approved}
          onClick={() => inputRef.current?.click()}
        >
          {pending ? (
            <>
              <Loader2 className="animate-spin" />
              Uploading
            </>
          ) : (
            <>
              {slot.selfie ? <Camera /> : <FileUp />}
              {status ? 'Replace' : 'Upload'}
            </>
          )}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="font-mono type-ui text-foreground">
          {error}
        </p>
      ) : null}
    </Card>
  );
}

/** Document slots required for each identity document type. */
export const SA_ID_SLOTS: KycSlotConfig[] = [
  {
    docType: 'ID_FRONT',
    title: 'ID Document — Front',
    description: 'Green barcoded ID book photo page, or the front of your smart ID card.',
  },
  {
    docType: 'ID_BACK',
    title: 'ID Document — Back',
    description: 'The barcode side of your smart ID card. Skip for a green ID book.',
  },
  {
    docType: 'LIVE_SELFIE',
    title: 'Live Selfie',
    description: 'Taken now, on camera, holding your ID beside your face.',
    selfie: true,
  },
];

export const PASSPORT_SLOTS: KycSlotConfig[] = [
  {
    docType: 'PASSPORT_PAGE',
    title: 'Passport — Photo Page',
    description: 'The page carrying your photograph and machine-readable zone.',
  },
  {
    docType: 'LIVE_SELFIE',
    title: 'Live Selfie',
    description: 'Taken now, on camera, holding your passport beside your face.',
    selfie: true,
  },
  {
    docType: 'PROOF_OF_ADDRESS',
    title: 'Proof of SA Address',
    description: 'A utility bill or bank statement under 3 months old.',
  },
];
