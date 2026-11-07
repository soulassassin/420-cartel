'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

export type CartelBrowserClient = ReturnType<typeof createCartelBrowserClient>;

let cached: ReturnType<typeof createBrowserClient<Database>> | null = null;

function readEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Supabase browser client is missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local.',
    );
  }
  return { url, anonKey };
}

/**
 * Singleton browser client. One instance per tab keeps a single Realtime
 * socket open for the POS <-> online stock sync.
 */
export function createCartelBrowserClient() {
  if (cached) return cached;
  const { url, anonKey } = readEnv();
  cached = createBrowserClient<Database>(url, anonKey, {
    realtime: { params: { eventsPerSecond: 8 } },
    global: { headers: { 'x-cartel-client': 'web' } },
  });
  return cached;
}
