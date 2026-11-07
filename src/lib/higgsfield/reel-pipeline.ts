import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createCartelAdminClient } from '@/lib/supabase/admin';
import { createHiggsfieldClient, HiggsfieldNotConfiguredError } from '@/lib/higgsfield/client';
import { buildPromoReelPrompt, REEL_PARAMS, type MediaJobKind } from '@/lib/higgsfield/prompt';
import { HIGGSFIELD_VISUAL_FORMULA } from '@/lib/brand';
import type {
  Database,
  Json,
  MasterBatchRow,
  MediaJobStatus,
  ProductMediaJobRow,
  ProductRow,
} from '@/types/database';

/**
 * 420 CARTEL :: Higgsfield MCP auto-reel pipeline (Module 6)
 *
 * The admin inventory grid fires one button per batch. That button hits
 * `/api/higgsfield/generate-reel`, which calls into this module. Nothing here
 * ever runs in a browser: the MCP server is reached with a secret key, so the
 * whole orchestration is server-only.
 *
 * Flow for one batch:
 *   1. Resolve the batch and its product (service role, after the route has
 *      already established the caller is active staff).
 *   2. Compose the 420 Cartel monochrome-and-gold prompt from the batch's own
 *      name, category, strain and *lab-measured* terpene profile.
 *   3. Write a `product_media_jobs` row first, so a dispatch that dies mid
 *      flight is still visible in the admin panel instead of vanishing.
 *   4. Submit to the Higgsfield MCP server, stamping the batch with the
 *      returned `higgsfield_job_id`.
 *   5. On completion — by webhook push or by poll — persist the .mp4 onto
 *      `master_batches.higgsfield_promo_video_url`, which the storefront card
 *      plays as its hover preview via `product_stock_board`.
 *
 * A job is never marked COMPLETED without a real output URL, and the batch is
 * never stamped with a video that the provider did not return.
 */

type AdminClient = SupabaseClient<Database>;

export class ReelPipelineError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'ReelPipelineError';
    this.statusCode = statusCode;
  }
}

/** The batch row joined with the product fields the prompt formula needs. */
interface BatchWithProduct {
  batch: MasterBatchRow;
  product: ProductRow;
}

async function loadBatch(admin: AdminClient, batchId: string): Promise<BatchWithProduct> {
  const { data: batch, error } = await admin
    .from('master_batches')
    .select('*')
    .eq('id', batchId)
    .maybeSingle();

  if (error) throw new ReelPipelineError(error.message, 500);
  if (!batch) throw new ReelPipelineError(`No batch found for ${batchId}.`, 404);

  const { data: product, error: productError } = await admin
    .from('products')
    .select('*')
    .eq('id', batch.product_id)
    .maybeSingle();

  if (productError) throw new ReelPipelineError(productError.message, 500);
  if (!product) throw new ReelPipelineError(`Batch ${batch.batch_code} has no product.`, 404);

  return { batch, product };
}

/**
 * Terpene direction for the prompt.
 *
 * The batch's lab-measured `terpene_profile` ({ limonene: 0.82, ... }) is
 * authoritative and ordered by concentration; the product's hand-written
 * `terpene_tags` are the fallback for a batch with no lab panel yet.
 */
export function terpeneDirection(batch: MasterBatchRow, product: ProductRow): string[] {
  const measured = Object.entries(batch.terpene_profile ?? {})
    .filter(([, value]) => typeof value === 'number' && value > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  return measured.length > 0 ? measured.slice(0, 4) : product.terpene_tags.slice(0, 4);
}

/** The exact prompt that will be sent for this batch, shown in the admin panel. */
export async function previewBatchReelPrompt(batchId: string): Promise<{
  prompt: string;
  batchCode: string;
  productName: string;
}> {
  const admin = createCartelAdminClient();
  const { batch, product } = await loadBatch(admin, batchId);

  return {
    prompt: composeBatchPrompt(batch, product),
    batchCode: batch.batch_code,
    productName: product.name,
  };
}

/**
 * Splice operator direction in ahead of the brand formula.
 *
 * The 420 Cartel visual formula must remain the LAST clause of every prompt —
 * it is what makes generated media grade identically to the WebGL scenes — so
 * a camera/lighting note from the admin studio is inserted before it rather
 * than appended after.
 */
function withDirection(prompt: string, direction?: string | null): string {
  const note = direction?.trim();
  if (!note) return prompt;

  const formulaAt = prompt.indexOf(HIGGSFIELD_VISUAL_FORMULA);
  if (formulaAt < 0) return `${prompt} ${note}`;
  return `${prompt.slice(0, formulaAt)}${note} ${prompt.slice(formulaAt)}`;
}

function composeBatchPrompt(
  batch: MasterBatchRow,
  product: ProductRow,
  extraDirection?: string | null,
): string {
  const prompt = buildPromoReelPrompt({
    productName: product.name,
    category: product.category,
    baseUom: product.base_uom,
    strain: product.strain,
    terpeneTags: terpeneDirection(batch, product),
    // Lab figures for THIS batch beat the product's nominal numbers.
    thcPct: batch.lab_thc_pct ?? product.thc_pct,
    cbdPct: batch.lab_cbd_pct ?? product.cbd_pct,
    featuredTier: null,
  });

  return withDirection(prompt, extraDirection);
}

function webhookUrl(jobId: string): string | undefined {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  const secret = process.env.HIGGSFIELD_WEBHOOK_SECRET;
  if (!site || !secret) return undefined;

  const url = new URL('/api/higgsfield/webhook', site);
  url.searchParams.set('job', jobId);
  url.searchParams.set('token', secret);
  return url.toString();
}

export interface DispatchReelResult {
  jobId: string;
  providerJobId: string | null;
  status: MediaJobStatus;
  prompt: string;
  batchCode: string;
  productName: string;
  /** Set when Higgsfield is not configured, or declined the request. */
  error: string | null;
}

/**
 * Queue a promo reel for one batch.
 *
 * `requestedBy` is the authenticated staff user id — the route establishes it,
 * this module trusts it, because the service-role client bypasses RLS.
 */
export async function dispatchBatchReel(input: {
  batchId: string;
  requestedBy: string;
  kind?: MediaJobKind;
  /** Camera / lighting / director note from the admin studio controls. */
  extraDirection?: string | null;
}): Promise<DispatchReelResult> {
  const kind: MediaJobKind = input.kind ?? 'PROMO_REEL';
  const admin = createCartelAdminClient();
  const { batch, product } = await loadBatch(admin, input.batchId);

  const prompt = composeBatchPrompt(batch, product, input.extraDirection);
  const params = {
    ...REEL_PARAMS[kind],
    // product_media_jobs is keyed by product; the batch lives in params so a
    // reel is always traceable to the exact harvest it was shot for.
    master_batch_id: batch.id,
    batch_code: batch.batch_code,
  };

  // Record the intent before the network call, so a failed dispatch is visible.
  const { data: job, error: insertError } = await admin
    .from('product_media_jobs')
    .insert({
      product_id: product.id,
      provider: 'higgsfield',
      kind,
      prompt,
      params: params as unknown as Json,
      status: 'QUEUED' as MediaJobStatus,
      requested_by: input.requestedBy,
      attempts: 1,
    })
    .select('*')
    .single();

  if (insertError || !job) {
    throw new ReelPipelineError(
      insertError?.message ?? 'Could not record the media job.',
      500,
    );
  }

  const client = createHiggsfieldClient();
  const callback = webhookUrl(job.id);

  try {
    const submission = await client.submit({
      prompt,
      params: REEL_PARAMS[kind],
      correlationId: job.id,
      ...(callback ? { webhookUrl: callback } : {}),
    });

    await admin
      .from('product_media_jobs')
      .update({
        provider_job_id: submission.providerJobId,
        status: submission.status,
      })
      .eq('id', job.id);

    // Stamp the batch so the admin row can poll without re-deriving the job.
    await admin
      .from('master_batches')
      .update({ higgsfield_job_id: submission.providerJobId })
      .eq('id', batch.id);

    return {
      jobId: job.id,
      providerJobId: submission.providerJobId,
      status: submission.status,
      prompt,
      batchCode: batch.batch_code,
      productName: product.name,
      error: null,
    };
  } catch (caught) {
    const message =
      caught instanceof HiggsfieldNotConfiguredError
        ? caught.message
        : caught instanceof Error
          ? caught.message
          : 'Higgsfield declined the request.';

    // Fail loudly and visibly rather than leaving a job stuck on QUEUED.
    await admin
      .from('product_media_jobs')
      .update({ status: 'FAILED' as MediaJobStatus, error_message: message })
      .eq('id', job.id);

    return {
      jobId: job.id,
      providerJobId: null,
      status: 'FAILED',
      prompt,
      batchCode: batch.batch_code,
      productName: product.name,
      error: message,
    };
  }
}

export interface ReelStatusResult {
  jobId: string;
  providerJobId: string | null;
  status: MediaJobStatus;
  outputUrl: string | null;
  posterUrl: string | null;
  /** True when this call is what moved the job to COMPLETED. */
  justCompleted: boolean;
  error: string | null;
}

/**
 * Persist a terminal provider result onto the job row and, on success, onto the
 * batch. Shared by the poll route and the webhook so both land identically.
 */
async function persistTerminalResult(
  admin: AdminClient,
  job: ProductMediaJobRow,
  result: {
    status: MediaJobStatus;
    outputUrl: string | null;
    posterUrl: string | null;
    durationSeconds: number | null;
    error: string | null;
  },
): Promise<ReelStatusResult> {
  // A COMPLETED status with no file is a provider bug, not a finished reel.
  if (result.status === 'COMPLETED' && !result.outputUrl) {
    await admin
      .from('product_media_jobs')
      .update({
        status: 'FAILED' as MediaJobStatus,
        error_message: 'Higgsfield reported success but returned no video URL.',
      })
      .eq('id', job.id);

    return {
      jobId: job.id,
      providerJobId: job.provider_job_id,
      status: 'FAILED',
      outputUrl: null,
      posterUrl: null,
      justCompleted: false,
      error: 'Higgsfield reported success but returned no video URL.',
    };
  }

  const completedAt = result.status === 'COMPLETED' ? new Date().toISOString() : null;

  await admin
    .from('product_media_jobs')
    .update({
      status: result.status,
      output_url: result.outputUrl,
      poster_url: result.posterUrl,
      duration_seconds: result.durationSeconds,
      error_message: result.error,
      completed_at: completedAt,
    })
    .eq('id', job.id);

  let justCompleted = false;

  if (result.status === 'COMPLETED' && result.outputUrl) {
    const batchId =
      typeof job.params === 'object' && job.params !== null && !Array.isArray(job.params)
        ? (job.params as Record<string, Json>).master_batch_id
        : null;

    if (typeof batchId === 'string') {
      // The storefront reads this through product_stock_board, whose trigger
      // fires on this very update.
      const { error } = await admin
        .from('master_batches')
        .update({
          higgsfield_promo_video_url: result.outputUrl,
          higgsfield_poster_url: result.posterUrl,
          higgsfield_generated_at: completedAt,
        })
        .eq('id', batchId);

      justCompleted = !error;
    }
  }

  return {
    jobId: job.id,
    providerJobId: job.provider_job_id,
    status: result.status,
    outputUrl: result.outputUrl,
    posterUrl: result.posterUrl,
    justCompleted,
    error: result.error,
  };
}

/** Poll Higgsfield for a job and persist whatever it reports. */
export async function refreshReelStatus(jobId: string): Promise<ReelStatusResult> {
  const admin = createCartelAdminClient();

  const { data: job, error } = await admin
    .from('product_media_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();

  if (error) throw new ReelPipelineError(error.message, 500);
  if (!job) throw new ReelPipelineError(`No media job found for ${jobId}.`, 404);

  // Already finished: report what is on file instead of calling out again.
  if (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELLED') {
    return {
      jobId: job.id,
      providerJobId: job.provider_job_id,
      status: job.status,
      outputUrl: job.output_url,
      posterUrl: job.poster_url,
      justCompleted: false,
      error: job.error_message,
    };
  }

  if (!job.provider_job_id) {
    throw new ReelPipelineError('That job was never accepted by Higgsfield.', 409);
  }

  const client = createHiggsfieldClient();

  try {
    const status = await client.status(job.provider_job_id);
    return await persistTerminalResult(admin, job, {
      status: status.status,
      outputUrl: status.outputUrl,
      posterUrl: status.posterUrl,
      durationSeconds: status.durationSeconds,
      error: status.error,
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Higgsfield status check failed.';
    // A transient status failure must not bury a job that is still rendering.
    await admin
      .from('product_media_jobs')
      .update({ error_message: message })
      .eq('id', job.id);

    throw new ReelPipelineError(message, 502);
  }
}

/** Apply a provider webhook payload to a job. */
export async function applyReelWebhook(input: {
  jobId: string;
  status: MediaJobStatus;
  outputUrl: string | null;
  posterUrl: string | null;
  durationSeconds: number | null;
  error: string | null;
}): Promise<ReelStatusResult> {
  const admin = createCartelAdminClient();

  const { data: job, error } = await admin
    .from('product_media_jobs')
    .select('*')
    .eq('id', input.jobId)
    .maybeSingle();

  if (error) throw new ReelPipelineError(error.message, 500);
  if (!job) throw new ReelPipelineError(`No media job found for ${input.jobId}.`, 404);

  return persistTerminalResult(admin, job, {
    status: input.status,
    outputUrl: input.outputUrl,
    posterUrl: input.posterUrl,
    durationSeconds: input.durationSeconds,
    error: input.error,
  });
}
