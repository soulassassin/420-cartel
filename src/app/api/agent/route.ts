import { createAgentUIStreamResponse } from 'ai';
import { cartelSommelierAgent } from '@/lib/ai/cartel-agent';

export async function POST(request: Request) {
  const { messages } = await request.json();

  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    return Response.json(
      {
        error: 'AI_GATEWAY_UNCONFIGURED',
        message:
          'AI_GATEWAY_API_KEY or Vercel OIDC token is not configured. Using local tool-loop preview mode.',
      },
      { status: 503 }
    );
  }

  return createAgentUIStreamResponse({
    agent: cartelSommelierAgent,
    uiMessages: messages,
  });
}

