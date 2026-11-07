import { NextResponse, type NextRequest } from 'next/server';
import { getViewer } from '@/lib/supabase/server';
import {
  dispatchBatchReel,
  previewBatchReelPrompt,
  refreshReelStatus,
  ReelPipelineError,
} from '@/lib/higgsfield/reel-pipeline';
import { isHiggsfieldConfigured } from '@/lib/higgsfield/client';

/**
 * 420 CARTEL :: Higgsfield auto-reel endpoint (Module 6)
 *
 *   POST /api/higgsfield/generate-reel   { batchId }        -> queue a reel
 *   GET  /api/higgsfield/generate-reel?jobId=...            -> poll + persist
 *   GET  /api/higgsfield/generate-reel?batchId=...&preview=1 -> show the prompt
 *
 * Every verb is staff-gated here, in the route, because the pipeline below it
 * runs on the service-role client and so has no RLS of its own. Managers and
 * owners may dispatch; any active staff member may poll and preview.
 *
 * The MCP key never leaves the server, which is why the admin panel calls this
 * route instead of reaching Higgsfield from the browser.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// A video submission can sit on the wire for a while; do not cut it short.
export const maxDuration = 60;

function failure(error: unknown) {
  if (error instanceof ReelPipelineError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  const message = error instanceof Error ? error.message : 'Reel pipeline failed.';
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: NextRequest) {
  const viewer = await getViewer();

  if (!viewer.isStaff) {
    return NextResponse.json(
      { error: 'Active staff credentials are required to generate promo reels.' },
      { status: 403 },
    );
  }
  if (!viewer.isManager) {
    return NextResponse.json(
      { error: 'Only owners and managers may dispatch Higgsfield reels.' },
      { status: 403 },
    );
  }
  if (!viewer.userId) {
    return NextResponse.json({ error: 'No session user.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const payload =
    typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const batchId = payload.batchId;
  const extraDirection =
    typeof payload.extraDirection === 'string' ? payload.extraDirection.slice(0, 600) : null;

  if (typeof batchId !== 'string' || batchId.length === 0) {
    return NextResponse.json({ error: 'batchId is required.' }, { status: 400 });
  }

  if (!isHiggsfieldConfigured()) {
    // Record the attempt anyway so the admin panel shows why nothing happened.
    try {
      const result = await dispatchBatchReel({
        batchId,
        requestedBy: viewer.userId,
        extraDirection,
      });
      return NextResponse.json(
        {
          ...result,
          error:
            result.error ??
            'HIGGSFIELD_API_KEY is not set. The job is recorded as FAILED rather than silently dropped.',
        },
        { status: 503 },
      );
    } catch (error) {
      return failure(error);
    }
  }

  try {
    const result = await dispatchBatchReel({
      batchId,
      requestedBy: viewer.userId,
      extraDirection,
    });
    return NextResponse.json(result, { status: result.error ? 502 : 202 });
  } catch (error) {
    return failure(error);
  }
}

export async function GET(request: NextRequest) {
  const viewer = await getViewer();

  if (!viewer.isStaff) {
    return NextResponse.json(
      { error: 'Active staff credentials are required.' },
      { status: 403 },
    );
  }

  const jobId = request.nextUrl.searchParams.get('jobId');
  const batchId = request.nextUrl.searchParams.get('batchId');

  try {
    if (jobId) {
      const status = await refreshReelStatus(jobId);
      return NextResponse.json(status);
    }

    if (batchId) {
      const preview = await previewBatchReelPrompt(batchId);
      return NextResponse.json({ ...preview, configured: isHiggsfieldConfigured() });
    }

    return NextResponse.json(
      { error: 'Pass either jobId to poll a job, or batchId to preview its prompt.' },
      { status: 400 },
    );
  } catch (error) {
    return failure(error);
  }
}
