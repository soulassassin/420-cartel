import 'server-only';

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * Service-role client. Bypasses RLS entirely, so it is reserved for trusted
 * server-side work that cannot run as a user:
 *   - signing short-lived URLs for KYC documents under staff review
 *   - the Higgsfield webhook writing back media job results
 *   - scheduled reservation sweeps
 *
 * Never import this into a Client Component or pass its results to the browser
 * without filtering them first.
 */
export function createCartelAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    );
  }

  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-cartel-client': 'service' } },
  });
}

/** Signed URL lifetime for a KYC document opened in the admin reviewer. */
export const KYC_SIGNED_URL_TTL_SECONDS = 120;

export async function signKycDocument(storagePath: string): Promise<string | null> {
  const admin = createCartelAdminClient();
  const { data, error } = await admin.storage
    .from('kyc-documents')
    .createSignedUrl(storagePath, KYC_SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}
