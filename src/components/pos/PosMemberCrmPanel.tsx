'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Cake,
  Check,
  ExternalLink,
  Info,
  Loader2,
  NotebookPen,
  Repeat,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';
import { Badge, Card, Eyebrow } from '@/components/ui/surfaces';
import { addCrmInteraction, toggleCrmFollowUp } from '@/lib/data/source';
import {
  SEGMENT_LABEL,
  buildPosMemberInsights,
  type PosMemberAlert,
  type PosMemberSnapshot,
  type PosUsualItem,
} from '@/lib/crm/pos-insights';
import { RANK_LABEL } from '@/lib/loyalty';
import { formatCents } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { MemberRow } from '@/types/database';

/**
 * The CRM, at the counter.
 *
 * Shown the moment a member is attached to the ticket. It answers, in order:
 * may I serve this person, what should I know or say, what do they usually
 * buy (one tap to ring it up), and is there anything to write down for the
 * next budtender. The back-office dossier stays the place for everything else.
 */

const FOLLOW_UP_CHOICES: { label: string; days: number | null }[] = [
  { label: 'No follow-up', days: null },
  { label: 'Tomorrow', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
];

const ALERT_ICON: Record<PosMemberAlert['level'], typeof Info> = {
  block: Ban,
  warn: AlertTriangle,
  info: Info,
};

function relativeDay(iso: string, now: Date): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

function dueLabel(iso: string, now: Date): string {
  const due = new Date(iso);
  if (due.getTime() <= now.getTime()) return 'due now';
  return `due ${due.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}`;
}

export function PosMemberCrmPanel({
  member,
  snapshot,
  loading,
  loadError,
  branchId,
  onAddUsual,
  onRepeatLast,
  onChanged,
}: {
  member: MemberRow;
  snapshot: PosMemberSnapshot | null;
  loading: boolean;
  loadError: string | null;
  branchId: string;
  onAddUsual: (item: PosUsualItem) => void;
  onRepeatLast: (items: PosUsualItem[]) => void;
  /** Called after a note or follow-up is written, so the till reloads the snapshot. */
  onChanged: () => void;
}) {
  const now = useMemo(() => new Date(), [snapshot]); // eslint-disable-line react-hooks/exhaustive-deps
  const insights = useMemo(
    () => (snapshot && snapshot.member.id === member.id ? buildPosMemberInsights(snapshot, now) : null),
    [snapshot, member.id, now],
  );

  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [followUpDays, setFollowUpDays] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyFollowUp, setBusyFollowUp] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const saveNote = async () => {
    const summary = note.trim();
    if (summary.length < 3) {
      setActionError('Write a short note first.');
      return;
    }
    setSaving(true);
    setActionError(null);
    try {
      await addCrmInteraction({
        memberId: member.id,
        branchId,
        channel: 'IN_STORE',
        summary,
        followUpAt:
          followUpDays === null
            ? null
            : new Date(Date.now() + followUpDays * 86_400_000).toISOString(),
      });
      setNote('');
      setFollowUpDays(null);
      setNoteOpen(false);
      onChanged();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Could not save that note.');
    } finally {
      setSaving(false);
    }
  };

  const completeFollowUp = async (interactionId: string) => {
    setBusyFollowUp(interactionId);
    setActionError(null);
    try {
      await toggleCrmFollowUp(interactionId, true);
      onChanged();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Could not close that follow-up.');
    } finally {
      setBusyFollowUp(null);
    }
  };

  const tags = member.crm_tags ?? [];

  return (
    <Card className="space-y-4 p-5" aria-label="Member CRM profile">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Eyebrow>Member Profile · CRM</Eyebrow>
          <p className="mt-1 truncate font-display text-base uppercase text-white">
            {member.first_name} {member.last_name}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone={member.status === 'VIP' ? 'gold' : 'live'}>{member.status.replace('_', ' ')}</Badge>
            <Badge tone="mono">{RANK_LABEL[member.rank] ?? member.rank}</Badge>
            {insights ? <Badge tone="mono">{SEGMENT_LABEL[insights.segment]}</Badge> : null}
            {insights?.isBirthdayToday ? (
              <Badge tone="gold">
                <Cake className="size-3" />
                Birthday
              </Badge>
            ) : null}
          </div>
        </div>
        <a
          href={`/admin/crm/${member.id}`}
          target="_blank"
          rel="noreferrer"
          className="flex shrink-0 items-center gap-1 font-mono type-ui text-ash hover:text-foreground"
        >
          Full dossier
          <ExternalLink className="size-3" />
        </a>
      </div>

      {loading && !insights ? (
        <p className="flex items-center gap-2 font-mono type-ui text-ash">
          <Loader2 className="size-3.5 animate-spin" />
          Loading purchase history…
        </p>
      ) : null}

      {loadError && !insights ? (
        <p role="alert" className="font-mono type-ui text-ash">
          Could not load this member&rsquo;s history ({loadError}). The sale can still go ahead.
        </p>
      ) : null}

      {insights ? (
        <>
          {/* Alerts: blockers first, then things to act on, then talking points. */}
          {insights.alerts.length > 0 ? (
            <ul className="space-y-1.5">
              {insights.alerts.map((alert) => {
                const Icon = ALERT_ICON[alert.level];
                return (
                  <li
                    key={`${alert.code}-${alert.message}`}
                    className={cn(
                      'flex items-start gap-2 border px-3 py-2 font-mono type-ui',
                      alert.level === 'block' && 'border-red-500/60 text-red-400',
                      alert.level === 'warn' && 'border-gold/50 text-gold',
                      alert.level === 'info' && 'border-[color:var(--border-mono)] text-foreground',
                    )}
                  >
                    <Icon className="mt-0.5 size-3.5 shrink-0" />
                    <span>{alert.message}</span>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {/* Relationship at a glance */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 font-mono sm:grid-cols-4">
            <div>
              <dt className="type-ui text-ash">Visits</dt>
              <dd className="text-white tabular-nums">{insights.visitCount}</dd>
            </div>
            <div>
              <dt className="type-ui text-ash">Lifetime</dt>
              <dd className="text-white tabular-nums">{formatCents(insights.lifetimeSpendCents)}</dd>
            </div>
            <div>
              <dt className="type-ui text-ash">Avg basket</dt>
              <dd className="text-white tabular-nums">
                {insights.averageBasketCents > 0 ? formatCents(insights.averageBasketCents) : '—'}
              </dd>
            </div>
            <div>
              <dt className="type-ui text-ash">Last visit</dt>
              <dd className="text-white">
                {insights.lastVisitAt ? relativeDay(insights.lastVisitAt, now) : 'Never'}
              </dd>
            </div>
          </dl>

          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <Badge key={tag} tone="mono">
                  {tag.replace(/_/g, ' ')}
                </Badge>
              ))}
            </div>
          ) : null}

          {member.internal_notes ? (
            <p className="border-l-2 border-gold/50 pl-3 font-mono type-ui text-foreground">
              {member.internal_notes}
            </p>
          ) : null}

          {/* The usual: one tap rings the tier onto the ticket. */}
          {insights.usual.length > 0 ? (
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-mono type-ui text-ash">
                  <Sparkles className="size-3.5" />
                  The usual — tap to ring up
                </span>
                {insights.lastOrder ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRepeatLast(insights.lastOrder!.items)}
                    title={`Order ${insights.lastOrder.order.order_number}`}
                  >
                    <Repeat className="size-3.5" />
                    Same as last time
                  </Button>
                ) : null}
              </div>
              <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                {insights.usual.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onAddUsual(item)}
                    className="flex min-h-11 items-center justify-between gap-2 border border-[color:var(--border-mono)] bg-void px-2.5 py-2 text-left font-mono transition-colors hover:border-foreground"
                  >
                    <span className="min-w-0">
                      <span className="block truncate type-ui text-white">{item.productName}</span>
                      <span className="block truncate type-ui text-ash">{item.variantLabel}</span>
                    </span>
                    <span className="shrink-0 type-ui tabular-nums text-foreground">
                      ×{item.timesBought}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* Open follow-ups */}
          {insights.openFollowUps.length > 0 ? (
            <div>
              <span className="font-mono type-ui text-ash">Open follow-ups</span>
              <ul className="mt-1.5 space-y-1.5">
                {insights.openFollowUps.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 border border-[color:var(--border-mono)] px-3 py-2"
                  >
                    <div className="min-w-0 font-mono type-ui">
                      <p className="text-white">{row.summary}</p>
                      <p className="text-ash">{row.follow_up_at ? dueLabel(row.follow_up_at, now) : ''}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={busyFollowUp === row.id}
                      onClick={() => void completeFollowUp(row.id)}
                    >
                      {busyFollowUp === row.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Check className="size-3.5" />
                      )}
                      Done
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Latest staff notes */}
          {insights.recentNotes.length > 0 ? (
            <div>
              <span className="font-mono type-ui text-ash">Recent notes</span>
              <ul className="mt-1.5 space-y-1 font-mono type-ui">
                {insights.recentNotes.slice(0, 3).map((row) => (
                  <li key={row.id} className="flex gap-2">
                    <span className="shrink-0 text-ash">{relativeDay(row.created_at, now)}</span>
                    <span className="text-foreground">{row.summary}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}

      {actionError ? (
        <p role="alert" className="font-mono type-ui text-red-400">
          {actionError}
        </p>
      ) : null}

      {/* Counter note: written here, read by the next budtender and the back office. */}
      {noteOpen ? (
        <div className="space-y-2.5 border-t border-[color:var(--border-mono)] pt-4">
          <label htmlFor="pos_crm_note" className="font-mono type-ui text-ash">
            Counter note
          </label>
          <Textarea
            id="pos_crm_note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            maxLength={500}
            placeholder="e.g. Asked for the new sativa drop — call when it lands"
            className="font-mono type-ui"
          />
          <div className="flex flex-wrap gap-1.5">
            {FOLLOW_UP_CHOICES.map((choice) => (
              <Button
                key={choice.label}
                variant={followUpDays === choice.days ? 'active' : 'surface'}
                size="sm"
                onClick={() => setFollowUpDays(choice.days)}
              >
                {choice.label}
              </Button>
            ))}
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" size="sm" onClick={() => setNoteOpen(false)}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" disabled={saving} onClick={() => void saveNote()}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Save note
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setNoteOpen(true)}>
          <NotebookPen className="size-3.5" />
          Add counter note
        </Button>
      )}
    </Card>
  );
}
