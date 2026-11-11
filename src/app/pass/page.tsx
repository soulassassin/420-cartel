'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, Eyebrow } from '@/components/ui/surfaces';
import { CartelMemberQrPass } from '@/components/crm/CartelMemberQrPass';
import { listMembers } from '@/lib/data/source';
import { useSessionStore } from '@/lib/store/session';
import type { MemberRow } from '@/types/database';

/**
 * Digital Member Pass Page (`/pass`).
 *
 * Renders the active member's obsidian & 24K gold QR pass (`CartelMemberQrPass`),
 * with downloadable SVG export and shareable referral link. In preview mode,
 * allows switching between seeded members (`CARTEL-0420`, `CARTEL-0108`, etc.).
 */

export default function MemberPassPage() {
  const sessionMember = useSessionStore((state) => state.member);
  const signIn = useSessionStore((state) => state.signIn);
  const [members, setMembers] = useState<MemberRow[]>([]);

  useEffect(() => {
    void listMembers()
      .then((rows) => {
        setMembers(rows);
        if (!useSessionStore.getState().member && rows[0]) {
          signIn(rows[0], true);
        }
      })
      .catch(() => undefined);
  }, [signIn]);

  const activeMember = sessionMember ?? members[0] ?? null;

  return (
    <main className="min-h-screen bg-void pb-28 pt-14">
      <div className="container flex max-w-xl flex-col items-center gap-8">
        <header className="text-center">
          <Eyebrow>Private Collective Credential</Eyebrow>
          <h1 className="mt-2 display-md text-white">
            Member <span className="">Pass</span>
          </h1>
          <p className="mt-2 type-ui text-ash">
            Present this pass at the Sandton Vault counter or share your referral link to earn
            collective store credit.
          </p>
        </header>

        {members.length > 1 ? (
          <Card className="flex w-full flex-wrap items-center justify-between gap-2 p-3">
            <span className="flex items-center gap-1.5 font-mono type-ui text-ash">
              <Sparkles className="size-3 text-foreground" />
              Active Holder:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {members.slice(0, 4).map((m) => (
                <Button
                  key={m.id}
                  variant={activeMember?.id === m.id ? 'active' : 'surface'}
                  size="sm"
                  onClick={() => signIn(m, true)}
                >
                  <UserCheck className="size-3" />
                  {m.member_code}
                </Button>
              ))}
            </div>
          </Card>
        ) : null}

        {activeMember ? <CartelMemberQrPass member={activeMember} /> : null}

        <div className="flex flex-wrap justify-center gap-3">
          <Button variant="gold" size="lg" asChild>
            <Link href="/shop">
              Open Private Dispensary
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="/account">Member Dossier & Orders</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
