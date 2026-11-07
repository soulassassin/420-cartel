'use client';

import Link from 'next/link';
import { ArrowRight, IdCard, ShieldCheck, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, Card, EmptyState, Eyebrow, Separator, Stat } from '@/components/ui/surfaces';
import { formatCents } from '@/lib/money';
import { RANK_LABEL } from '@/lib/loyalty';
import { listOrders } from '@/lib/data/source';
import { useCartelQuery } from '@/lib/data/useCartelQuery';
import { useSessionStore } from '@/lib/store/session';

export default function AccountPage() {
  const member = useSessionStore((state) => state.member);
  const ordersQuery = useCartelQuery(() => listOrders(50), []);

  const memberOrders = (ordersQuery.data ?? []).filter(
    (o) => !member || o.member_id === member.id,
  );

  return (
    <main className="min-h-screen bg-void pb-28 pt-14">
      <div className="container max-w-4xl space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Private Member File</Eyebrow>
            <h1 className="mt-2 display-md text-white">
              Account <span className="gold-text">Dossier</span>
            </h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/pass">
                <IdCard className="size-3.5" />
                Digital Pass
              </Link>
            </Button>
            <Button variant="gold" size="sm" asChild>
              <Link href="/shop">
                <ShoppingBag className="size-3.5" />
                Dispensary
              </Link>
            </Button>
          </div>
        </header>

        {member ? (
          <Card className="space-y-6 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-display text-2xl uppercase text-white">
                  {member.first_name} {member.last_name}
                </p>
                <p className="font-mono text-sm text-gold">{member.member_code}</p>
              </div>
              <Badge tone="live">
                <ShieldCheck className="size-3.5" />
                {member.status.replace(/_/g, ' ')}
              </Badge>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Rank" value={RANK_LABEL[member.rank]} tone="gold" />
              <Stat label="Store Credit" value={formatCents(member.credit_balance_cents)} />
              <Stat label="Points" value={member.points_balance.toLocaleString('en-ZA')} />
              <Stat label="Lifetime Value" value={formatCents(member.lifetime_value_cents)} />
            </div>
          </Card>
        ) : (
          <Card className="flex items-center justify-between p-6">
            <p className="text-sm text-muted-foreground">
              No active member session selected. Complete onboarding or open your pass.
            </p>
            <Button variant="gold" asChild>
              <Link href="/pass">
                Load Member Pass
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </Card>
        )}

        <Card className="space-y-4 p-6">
          <Eyebrow>Recent Allocations</Eyebrow>
          {memberOrders.length === 0 ? (
            <EmptyState
              title="No allocations recorded yet"
              description="Place an allocation in the dispensary or at the Sandton POS terminal to view your history."
            />
          ) : (
            <div className="divide-y divide-[color:var(--border-mono)] font-mono text-xs">
              {memberOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="text-white">{order.order_number}</p>
                    <p className="text-[0.625rem] text-muted-foreground">
                      {order.channel} · {order.fulfilment_type} ·{' '}
                      {new Date(order.created_at).toLocaleString('en-ZA')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone="gold">{order.status}</Badge>
                    <span className="text-sm tabular-nums text-gold">
                      {formatCents(order.total_cents)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
