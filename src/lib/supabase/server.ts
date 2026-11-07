import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database, MemberRow, StaffProfileRow } from '@/types/database';

export function isSupabaseServerConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

function readEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Supabase server client is missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }
  return { url, anonKey };
}

/**
 * Request-scoped client that carries the caller's session, so every query and
 * RPC runs under their RLS policies. Never cache this across requests.
 */
export async function createCartelServerClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = readEnv();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render, where cookies are read-only.
          // middleware.ts owns session refresh, so this is safe to ignore.
        }
      },
    },
  });
}

export async function getSessionUser() {
  if (!isSupabaseServerConfigured()) return null;
  const supabase = await createCartelServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

export interface CartelViewer {
  userId: string | null;
  member: MemberRow | null;
  staff: StaffProfileRow | null;
  isStaff: boolean;
  isManager: boolean;
  /** True only for an 18+ verified, non-suspended member. */
  isActiveMember: boolean;
}

export const ANONYMOUS_VIEWER: CartelViewer = {
  userId: null,
  member: null,
  staff: null,
  isStaff: false,
  isManager: false,
  isActiveMember: false,
};

/**
 * Resolves who is asking, in one round trip pair. Every gated page and server
 * action starts here; RLS is still the real boundary, this is for rendering.
 */
export async function getViewer(): Promise<CartelViewer> {
  if (!isSupabaseServerConfigured()) return ANONYMOUS_VIEWER;
  const supabase = await createCartelServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return ANONYMOUS_VIEWER;

  const [memberResult, staffResult] = await Promise.all([
    supabase.from('members').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('staff_profiles').select('*').eq('id', user.id).maybeSingle(),
  ]);

  const member = memberResult.data ?? null;
  const staff = staffResult.data ?? null;

  return {
    userId: user.id,
    member,
    staff,
    isStaff: Boolean(staff?.is_active),
    isManager: Boolean(staff?.is_active && (staff.role === 'OWNER' || staff.role === 'MANAGER')),
    isActiveMember: Boolean(
      member &&
        member.age_verified_at !== null &&
        (member.status === 'ACTIVE_MEMBER' || member.status === 'VIP'),
    ),
  };
}
