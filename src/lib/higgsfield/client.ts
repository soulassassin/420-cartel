import 'server-only';

import type { Json } from '@/types/database';

/**
 * Higgsfield transport.
 *
 * The admin panel never talks to Higgsfield directly — it writes a row to
 * `product_media_jobs` and a server action hands that row to this client. The
 * client is an interface so the MCP transport, a future REST transport and the
 * test double are interchangeable.
 *
 * STATUS: the MCP endpoint (https://mcp.higgsfield.ai/mcp) is called over
 * streamable HTTP JSON-RPC, which is the standard MCP wire format. The tool
 * name and argument keys below are configurable via env because they must be
 * confirmed against the live server's `tools/list` response before first use:
 *
 *   HIGGSFIELD_TOOL_SUBMIT  (default: generate_video)
 *   HIGGSFIELD_TOOL_STATUS  (default: get_job_status)
 *
 * Without HIGGSFIELD_API_KEY the pipeline runs in NotConfigured mode: jobs are
 * recorded and surfaced in the admin panel as FAILED with a clear reason, and
 * nothing silently pretends to have generated media.
 */

export interface SubmitMediaJobInput {
  prompt: string;
  params: Record<string, string | number | boolean>;
  /** Our own job row id, echoed back on the webhook. */
  correlationId: string;
  webhookUrl?: string;
}

export interface SubmitMediaJobResult {
  providerJobId: string;
  status: 'QUEUED' | 'PROCESSING';
}

export interface MediaJobStatusResult {
  providerJobId: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  outputUrl: string | null;
  posterUrl: string | null;
  durationSeconds: number | null;
  error: string | null;
}

export interface HiggsfieldClient {
  readonly configured: boolean;
  submit(input: SubmitMediaJobInput): Promise<SubmitMediaJobResult>;
  status(providerJobId: string): Promise<MediaJobStatusResult>;
}

export class HiggsfieldNotConfiguredError extends Error {
  constructor() {
    super(
      'Higgsfield is not configured. Set HIGGSFIELD_API_KEY (and confirm the tool names against the MCP server) to enable reel generation.',
    );
    this.name = 'HiggsfieldNotConfiguredError';
  }
}

export class HiggsfieldRequestError extends Error {
  public readonly statusCode: number | null;

  constructor(message: string, statusCode: number | null = null) {
    super(message);
    this.name = 'HiggsfieldRequestError';
    this.statusCode = statusCode;
  }
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: {
    content?: { type: string; text?: string }[];
    structuredContent?: Record<string, Json>;
    isError?: boolean;
  };
  error?: { code: number; message: string; data?: Json };
}

/** MCP streamable-HTTP transport. */
class HiggsfieldMcpClient implements HiggsfieldClient {
  public readonly configured = true;

  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly submitTool: string;
  private readonly statusTool: string;

  constructor(endpoint: string, apiKey: string) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.submitTool = process.env.HIGGSFIELD_TOOL_SUBMIT ?? 'generate_video';
    this.statusTool = process.env.HIGGSFIELD_TOOL_STATUS ?? 'get_job_status';
  }

  private async callTool(
    name: string,
    args: Record<string, Json>,
  ): Promise<Record<string, Json>> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'tools/call',
        params: { name, arguments: args },
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new HiggsfieldRequestError(
        `Higgsfield returned ${response.status} ${response.statusText}.`,
        response.status,
      );
    }

    const body = (await response.json()) as JsonRpcResponse;

    if (body.error) {
      throw new HiggsfieldRequestError(body.error.message, null);
    }
    if (body.result?.isError) {
      const text = body.result.content?.find((part) => part.type === 'text')?.text;
      throw new HiggsfieldRequestError(text ?? 'Higgsfield reported a tool error.');
    }

    if (body.result?.structuredContent) return body.result.structuredContent;

    // Fall back to parsing the first text block as JSON.
    const text = body.result?.content?.find((part) => part.type === 'text')?.text;
    if (!text) {
      throw new HiggsfieldRequestError('Higgsfield returned an empty result.');
    }
    try {
      return JSON.parse(text) as Record<string, Json>;
    } catch {
      throw new HiggsfieldRequestError(`Could not parse the Higgsfield result: ${text.slice(0, 200)}`);
    }
  }

  private static pickString(source: Record<string, Json>, ...keys: string[]): string | null {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.length > 0) return value;
    }
    return null;
  }

  private static pickNumber(source: Record<string, Json>, ...keys: string[]): number | null {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
    return null;
  }

  async submit(input: SubmitMediaJobInput): Promise<SubmitMediaJobResult> {
    const result = await this.callTool(this.submitTool, {
      prompt: input.prompt,
      ...input.params,
      metadata: { correlation_id: input.correlationId },
      ...(input.webhookUrl ? { webhook_url: input.webhookUrl } : {}),
    });

    const providerJobId = HiggsfieldMcpClient.pickString(result, 'job_id', 'id', 'jobId');
    if (!providerJobId) {
      throw new HiggsfieldRequestError('Higgsfield did not return a job id.');
    }

    const status = HiggsfieldMcpClient.pickString(result, 'status');
    return {
      providerJobId,
      status: status === 'processing' || status === 'PROCESSING' ? 'PROCESSING' : 'QUEUED',
    };
  }

  async status(providerJobId: string): Promise<MediaJobStatusResult> {
    const result = await this.callTool(this.statusTool, { job_id: providerJobId });

    const raw = (HiggsfieldMcpClient.pickString(result, 'status') ?? 'processing').toUpperCase();
    const status: MediaJobStatusResult['status'] =
      raw === 'COMPLETED' || raw === 'SUCCEEDED' || raw === 'SUCCESS'
        ? 'COMPLETED'
        : raw === 'FAILED' || raw === 'ERROR'
          ? 'FAILED'
          : raw === 'QUEUED' || raw === 'PENDING'
            ? 'QUEUED'
            : 'PROCESSING';

    return {
      providerJobId,
      status,
      outputUrl: HiggsfieldMcpClient.pickString(result, 'output_url', 'video_url', 'url'),
      posterUrl: HiggsfieldMcpClient.pickString(result, 'poster_url', 'thumbnail_url'),
      durationSeconds: HiggsfieldMcpClient.pickNumber(result, 'duration_seconds', 'duration'),
      error: HiggsfieldMcpClient.pickString(result, 'error', 'error_message'),
    };
  }
}

/** Used when no API key is present. Fails loudly and early. */
class HiggsfieldNotConfiguredClient implements HiggsfieldClient {
  public readonly configured = false;

  async submit(): Promise<SubmitMediaJobResult> {
    throw new HiggsfieldNotConfiguredError();
  }

  async status(): Promise<MediaJobStatusResult> {
    throw new HiggsfieldNotConfiguredError();
  }
}

export function createHiggsfieldClient(): HiggsfieldClient {
  const apiKey = process.env.HIGGSFIELD_API_KEY;
  const endpoint = process.env.HIGGSFIELD_MCP_URL ?? 'https://mcp.higgsfield.ai/mcp';
  if (!apiKey) return new HiggsfieldNotConfiguredClient();
  return new HiggsfieldMcpClient(endpoint, apiKey);
}

export function isHiggsfieldConfigured(): boolean {
  return Boolean(process.env.HIGGSFIELD_API_KEY);
}
