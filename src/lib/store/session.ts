'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { MemberRow } from '@/types/database';

/**
 * Member session for the customer-facing surfaces.
 *
 * On a configured Supabase project the authoritative session is the Supabase
 * auth cookie and RLS; this store only remembers *which* verified member
 * profile the browser is acting as, which is what `/shop` and `/checkout` gate
 * on for rendering. In local preview it is the whole session.
 *
 * The member row is cached so the shop can gate instantly on first paint
 * without a round trip; balances shown from it are refreshed on load.
 */

export interface SessionState {
  member: MemberRow | null;
  /** True when this session was started by the "simulate member" shortcut. */
  simulated: boolean;
  referralCode: string | null;

  signIn: (member: MemberRow, simulated?: boolean) => void;
  signOut: () => void;
  /** Refresh the cached row without changing who is signed in. */
  syncMember: (member: MemberRow) => void;
  setReferralCode: (code: string | null) => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      member: null,
      simulated: false,
      referralCode: null,

      signIn: (member, simulated = false) => set({ member, simulated }),
      signOut: () => set({ member: null, simulated: false }),
      syncMember: (member) =>
        set((state) => (state.member?.id === member.id ? { member } : state)),
      setReferralCode: (referralCode) => set({ referralCode }),
    }),
    {
      name: 'cartel-session',
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/** A member may transact only once they are 18+ verified and in good standing. */
export function isVerifiedMember(member: MemberRow | null): member is MemberRow {
  if (!member) return false;
  if (member.age_verified_at === null) return false;
  // New applicants get in at sign-up; a rejection records a reason. This
  // mirrors `is_active_member` in Postgres, which is the real boundary.
  if (member.status === 'PENDING_KYC') return member.suspended_reason === null;
  return member.status === 'ACTIVE_MEMBER' || member.status === 'VIP';
}

export function memberFullName(member: MemberRow): string {
  return `${member.first_name} ${member.last_name}`.trim();
}

/** VIP members are quoted the compare-at price as their member price. */
export function isVipMember(member: MemberRow | null): boolean {
  return member?.status === 'VIP';
}
