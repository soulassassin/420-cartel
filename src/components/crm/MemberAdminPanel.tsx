'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldOff, Sparkles, Undo2, Wallet } from 'lucide-react';
import { adjustCredit, setMemberStatus } from '@/app/admin/crm/actions';
import { Button } from '@/components/ui/button';
import { Field, NumericInput, Textarea } from '@/components/ui/field';
import { Card, Separator, Stat } from '@/components/ui/surfaces';
import { formatCents } from '@/lib/money';
import type { MemberRow, MemberStatus } from '@/types/database';

/**
 * Manager controls: account credit and membership standing.
 *
 * Credit is entered in rands and converted to cents server-side. A debit is a
 * negative amount; the database refuses to take a balance below zero, so there
 * is no path to a negative wallet.
 */
export function MemberAdminPanel({ member }: { member: MemberRow }) {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [creditReason, setCreditReason] = useState('');
  const [statusReason, setStatusReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingSuspend, setConfirmingSuspend] = useState(false);
  const [pending, startTransition] = useTransition();

  const parsedAmount = Number(amount.replace(/[^0-9.-]/g, ''));
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount !== 0;

  function submitCredit() {
    setError(null);
    setNotice(null);

    const formData = new FormData();
    formData.set('member_id', member.id);
    formData.set('amount_rands', String(parsedAmount));
    formData.set('reason', creditReason);

    startTransition(async () => {
      const result = await adjustCredit(formData);
      if (!result.ok) {
        setError(result.error ?? 'Could not adjust credit.');
        return;
      }
      setNotice(
        result.data
          ? `Balance is now ${formatCents(result.data.balanceCents)}.`
          : 'Credit adjusted.',
      );
      setAmount('');
      setCreditReason('');
      router.refresh();
    });
  }

  function changeStatus(status: MemberStatus) {
    setError(null);
    setNotice(null);

    const formData = new FormData();
    formData.set('member_id', member.id);
    formData.set('status', status);
    if (status === 'SUSPENDED') formData.set('reason', statusReason);

    startTransition(async () => {
      const result = await setMemberStatus(formData);
      if (!result.ok) {
        setError(result.error ?? 'Could not change status.');
        return;
      }
      setConfirmingSuspend(false);
      setStatusReason('');
      router.refresh();
    });
  }

  const suspended = member.status === 'SUSPENDED';
  const vip = member.status === 'VIP';

  return (
    <div className="flex flex-col gap-5">
      {/* ---- Account credit --------------------------------------------- */}
      <Card className="flex flex-col gap-5 p-6">
        <div className="flex items-start justify-between gap-4">
          <p className="font-display text-base uppercase ">Account Credit</p>
          <Stat label="Balance" value={formatCents(member.credit_balance_cents)} tone="gold" />
        </div>

        <Separator />

        <Field label="Adjustment" htmlFor="amount_rands" hint="Negative to debit" required>
          <NumericInput
            id="amount_rands"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^0-9.-]/g, ''))}
            suffix="R"
            placeholder="0.00"
          />
        </Field>

        <Field label="Reason" htmlFor="credit_reason" hint="Lands on the ledger" required>
          <Textarea
            id="credit_reason"
            value={creditReason}
            onChange={(event) => setCreditReason(event.target.value)}
            className="min-h-16"
            placeholder="e.g. Goodwill credit for the delayed Rosebank delivery."
          />
        </Field>

        <Button
          type="button"
          variant="gold"
          size="default"
          block
          onClick={submitCredit}
          disabled={pending || !amountValid || creditReason.trim().length < 4}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Wallet />}
          {amountValid && parsedAmount < 0
            ? `Debit ${formatCents(Math.abs(Math.round(parsedAmount * 100)))}`
            : amountValid
              ? `Credit ${formatCents(Math.round(parsedAmount * 100))}`
              : 'Adjust Credit'}
        </Button>
      </Card>

      {/* ---- Standing ---------------------------------------------------- */}
      <Card className="flex flex-col gap-5 p-6">
        <p className="font-display text-base uppercase ">Membership Standing</p>

        {suspended && member.suspended_reason ? (
          <p className="border-l-2 border-foreground bg-transparent px-4 py-3 type-ui text-foreground">
            Suspended: {member.suspended_reason}
          </p>
        ) : null}

        {confirmingSuspend ? (
          <div className="flex flex-col gap-4">
            <Field label="Suspension Reason" htmlFor="status_reason" required>
              <Textarea
                id="status_reason"
                value={statusReason}
                onChange={(event) => setStatusReason(event.target.value)}
                className="min-h-16"
                placeholder="Recorded against the member profile and the audit log."
              />
            </Field>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="flex-1"
                onClick={() => changeStatus('SUSPENDED')}
                disabled={pending || statusReason.trim().length < 4}
              >
                {pending ? <Loader2 className="animate-spin" /> : <ShieldOff />}
                Confirm Suspension
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmingSuspend(false)}
                disabled={pending}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {suspended ? (
              <Button
                type="button"
                variant="gold"
                size="default"
                block
                onClick={() => changeStatus('ACTIVE_MEMBER')}
                disabled={pending}
              >
                <Undo2 />
                Reinstate Membership
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant={vip ? 'ghost' : 'surface'}
                  size="default"
                  block
                  onClick={() => changeStatus(vip ? 'ACTIVE_MEMBER' : 'VIP')}
                  disabled={pending}
                >
                  <Sparkles />
                  {vip ? 'Remove VIP Status' : 'Promote to VIP'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="default"
                  block
                  onClick={() => setConfirmingSuspend(true)}
                  disabled={pending}
                >
                  <ShieldOff />
                  Suspend Member
                </Button>
              </>
            )}
          </div>
        )}
      </Card>

      {error ? (
        <p
          role="alert"
          className="border-l-2 border-foreground bg-transparent px-4 py-3 font-mono type-ui text-foreground"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="border-l-2 border-foreground bg-transparent px-4 py-3 font-mono type-ui text-foreground">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
