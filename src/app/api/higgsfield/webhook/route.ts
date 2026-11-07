import { NextResponse, type NextRequest } from 'next/server';
import { applyReelWebhook, ReelPipelineError } from '@/lib/higgsfield/reel-pipeline';
import type { MediaJobStatus } from '@/types/database';

/**
 * 420 CARTEL :: Higgsfield completion webhook (Module 6)
 *
 * Higgsfield pushes here when a reel finishes rendering. The URL carries the
 * job id and the shared secret, both minted by `reel-pipeline.ts` when the job
 * was submitted — a request without a matching secret is refused outright, so
 * nobody can stamp a batch with an arbitrary video by guessing a job id.
 *
 * Poll remains the fallback: if the webhook never arrives, the admin panel's
 * refresh hits `GET /api/higgsfield/generate-reel?jobId=...`, which lands the
 * identical result through the same persistence path.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Map whatever the provider calls a state onto our media_job_status enum. */
function normalizeStatus(raw: unknown): MediaJobStatus {
  const value = typeof raw === 'string' ? raw.toUpperCase() : '';
  switch (value) {
    case 'COMPLETED':
    case 'SUCCEEDED':
    case 'SUCCESS':
    case 'DONE':
      return 'COMPLETED';
    case 'FAILED':
    case 'ERROR':
      return 'FAILED';
    case 'CANCELLED':
    case 'CANCELED':
      return 'CANCELLED';
    case 'QUEUED':
    case 'PENDING':
      return 'QUEUED';
    default:
      return 'PROCESSING';
  }
}

function pickString(source: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

function pickNumber(source: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const secret = process.env.HIGGSFIELD_WEBHOOK_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: 'HIGGSFIELD_WEBHOOK_SECRET is not configured.' },
      { status: 503 },
    );
  }

  const token = request.nextUrl.searchParams.get('token');
  const jobId = request.nextUrl.searchParams.get('job');

  // Constant-ish comparison: reject on length mismatch before comparing.
  if (!token || token.length !== secret.length || token !== secret) {
    return NextResponse.json({ error: 'Invalid webhook token.' }, { status: 401 });
  }
  if (!jobId) {
    return NextResponse.json({ error: 'Missing job id.' }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    const parsed = await request.json();
    payload =
      typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  // Providers nest the useful half under `data` or `result` about half the time.
  const nested =
    typeof payload.data === 'object' && payload.data !== null
      ? (payload.data as Record<string, unknown>)
      : typeof payload.result === 'object' && payload.result !== null
        ? (payload.result as Record<string, unknown>)
        : {};

  const merged: Record<string, unknown> = { ...nested, ...payload };

  try {
    const result = await applyReelWebhook({
      jobId,
      status: normalizeStatus(merged.status ?? merged.state),
      outputUrl: pickString(merged, 'output_url', 'video_url', 'url', 'mp4_url'),
      posterUrl: pickString(merged, 'poster_url', 'thumbnail_url', 'preview_url'),
      durationSeconds: pickNumber(merged, 'duration_seconds', 'duration'),
      error: pickString(merged, 'error', 'error_message', 'failure_reason'),
    });

    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    if (error instanceof ReelPipelineError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Webhook handling failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
