import type {
  CrmInteractionRow,
  LoyaltyRulesRow,
  MemberRow,
  OrderItemRow,
  OrderRow,
} from '@/types/database';

/**
 * CRM intelligence for the counter.
 *
 * Everything the budtender should know in the three seconds after a pass is
 * scanned: can this person be served, what do they usually buy, has anyone
 * left a note, is there an open follow-up, and is today worth a mention
 * (birthday, first visit, back after a long gap).
 *
 * Pure functions over rows the till has already loaded, so the same maths
 * runs against Supabase and the local demo engine, and is trivially testable.
 */

/** What the till needs about one member. Loaded by `getPosMemberSnapshot`. */
export interface PosMemberSnapshot {
  member: MemberRow;
  orders: OrderRow[];
  orderItems: OrderItemRow[];
  interactions: CrmInteractionRow[];
  loyaltyRules: LoyaltyRulesRow;
}

export type PosMemberSegment = 'FIRST_VISIT' | 'NEW' | 'REGULAR' | 'AT_RISK' | 'LAPSED';

export const SEGMENT_LABEL: Record<PosMemberSegment, string> = {
  FIRST_VISIT: 'First visit',
  NEW: 'New member',
  REGULAR: 'Regular',
  AT_RISK: 'Cooling off',
  LAPSED: 'Lapsed',
};

/** Days without a purchase before a member counts as cooling off / lapsed. */
export const AT_RISK_AFTER_DAYS = 30;
export const LAPSED_AFTER_DAYS = 60;
/** Fewer settled orders than this is still a "new" relationship. */
export const REGULAR_FROM_ORDERS = 3;

export interface PosMemberAlert {
  /** `block` stops the sale, `warn` needs a human decision, `info` is a talking point. */
  level: 'block' | 'warn' | 'info';
  code:
    | 'SUSPENDED'
    | 'PENDING_KYC'
    | 'FOLLOW_UP_DUE'
    | 'BIRTHDAY'
    | 'FIRST_VISIT'
    | 'WIN_BACK'
    | 'POINTS_READY';
  message: string;
}

/** One line of "the usual": a specific tier the member keeps coming back for. */
export interface PosUsualItem {
  key: string;
  productId: string;
  variantId: string | null;
  productName: string;
  variantLabel: string;
  /** Base quantity of ONE unit of this line (grams / ml / units). */
  baseQtyPerUnit: number;
  quantity: number;
  timesBought: number;
  lastBoughtAt: string;
}

export interface PosMemberInsights {
  segment: PosMemberSegment;
  visitCount: number;
  lifetimeSpendCents: number;
  averageBasketCents: number;
  lastVisitAt: string | null;
  daysSinceLastVisit: number | null;
  /** Up to four tiers bought most often, most frequent first. */
  usual: PosUsualItem[];
  /** The lines of the most recent settled order, for "same again". */
  lastOrder: { order: OrderRow; items: PosUsualItem[] } | null;
  openFollowUps: CrmInteractionRow[];
  recentNotes: CrmInteractionRow[];
  alerts: PosMemberAlert[];
  /** Points the member may redeem right now (0 when under the minimum). */
  redeemablePoints: number;
  redeemableValueCents: number;
  isBirthdayToday: boolean;
}

const DAY_MS = 86_400_000;

/** Orders that represent a real purchase, not a draft or a reversed sale. */
export function isSettledOrder(order: Pick<OrderRow, 'status'>): boolean {
  return (
    order.status !== 'DRAFT' &&
    order.status !== 'AWAITING_PAYMENT' &&
    order.status !== 'CANCELLED' &&
    order.status !== 'REFUNDED'
  );
}

function toUsualItem(item: OrderItemRow, lastBoughtAt: string, timesBought: number): PosUsualItem {
  const quantity = Math.max(1, item.quantity);
  return {
    key: `${item.variant_id ?? item.product_id}:${item.variant_label}`,
    productId: item.product_id,
    variantId: item.variant_id,
    productName: item.product_name,
    variantLabel: item.variant_label,
    baseQtyPerUnit: item.base_qty / quantity,
    quantity,
    timesBought,
    lastBoughtAt,
  };
}

/**
 * Days until the member's next birthday, in the till's local calendar.
 * 0 means today. `date_of_birth` is a plain `YYYY-MM-DD`, so it is read by
 * parts rather than through `Date` parsing, which would shift it by timezone.
 */
export function daysUntilBirthday(dateOfBirth: string, now: Date): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOfBirth);
  if (!match) return null;
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(today.getFullYear(), month, day);
  if (next.getTime() < today.getTime()) next = new Date(today.getFullYear() + 1, month, day);
  return Math.round((next.getTime() - today.getTime()) / DAY_MS);
}

/** Most points this ticket can absorb, honouring balance and the house minimum. */
export function maxRedeemablePoints(
  member: Pick<MemberRow, 'points_balance'>,
  rules: Pick<LoyaltyRulesRow, 'point_value_cents' | 'min_redeem_points'>,
  ticketCents?: number,
): number {
  const pointValue = Math.max(0, rules.point_value_cents);
  if (pointValue <= 0) return 0;
  let points = Math.max(0, Math.floor(member.points_balance));
  if (ticketCents !== undefined) {
    points = Math.min(points, Math.floor(Math.max(0, ticketCents) / pointValue));
  }
  return points >= Math.max(1, rules.min_redeem_points) ? points : 0;
}

export function buildPosMemberInsights(
  snapshot: PosMemberSnapshot,
  now: Date = new Date(),
): PosMemberInsights {
  const { member, interactions, loyaltyRules } = snapshot;

  const settled = snapshot.orders
    .filter(isSettledOrder)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const orderById = new Map(settled.map((order) => [order.id, order]));

  // The member row carries the authoritative lifetime counters; the loaded
  // order window (most recent 50) is only used when it knows more.
  const windowSpend = settled.reduce((sum, order) => sum + order.total_cents, 0);
  const visitCount = Math.max(member.order_count, settled.length);
  const lifetimeSpendCents = Math.max(member.lifetime_value_cents, windowSpend);
  const averageBasketCents =
    settled.length > 0
      ? Math.round(windowSpend / settled.length)
      : visitCount > 0
        ? Math.round(lifetimeSpendCents / visitCount)
        : 0;

  const lastVisitAt = settled[0]?.created_at ?? null;
  const daysSinceLastVisit = lastVisitAt
    ? Math.max(0, Math.floor((now.getTime() - new Date(lastVisitAt).getTime()) / DAY_MS))
    : null;

  let segment: PosMemberSegment;
  if (visitCount === 0) segment = 'FIRST_VISIT';
  else if (daysSinceLastVisit !== null && daysSinceLastVisit >= LAPSED_AFTER_DAYS) segment = 'LAPSED';
  else if (daysSinceLastVisit !== null && daysSinceLastVisit >= AT_RISK_AFTER_DAYS) segment = 'AT_RISK';
  else if (visitCount < REGULAR_FROM_ORDERS) segment = 'NEW';
  else segment = 'REGULAR';

  // "The usual": tiers ranked by how many separate orders they appear on.
  const tally = new Map<string, { item: OrderItemRow; orders: Set<string>; lastAt: string }>();
  for (const item of snapshot.orderItems) {
    const order = orderById.get(item.order_id);
    if (!order) continue;
    const key = `${item.variant_id ?? item.product_id}:${item.variant_label}`;
    const entry = tally.get(key);
    if (!entry) {
      tally.set(key, { item, orders: new Set([order.id]), lastAt: order.created_at });
      continue;
    }
    entry.orders.add(order.id);
    if (order.created_at > entry.lastAt) {
      entry.lastAt = order.created_at;
      entry.item = item;
    }
  }
  const usual = [...tally.values()]
    .sort((a, b) => b.orders.size - a.orders.size || b.lastAt.localeCompare(a.lastAt))
    .slice(0, 4)
    .map((entry) => toUsualItem(entry.item, entry.lastAt, entry.orders.size));

  const lastSettled = settled[0] ?? null;
  const lastOrderItems = lastSettled
    ? snapshot.orderItems
        .filter((item) => item.order_id === lastSettled.id)
        .map((item) => toUsualItem(item, lastSettled.created_at, 1))
    : [];
  const lastOrder =
    lastSettled && lastOrderItems.length > 0 ? { order: lastSettled, items: lastOrderItems } : null;

  const openFollowUps = interactions
    .filter((row) => row.follow_up_at !== null && !row.follow_up_done)
    .sort((a, b) => (a.follow_up_at ?? '').localeCompare(b.follow_up_at ?? ''));
  const recentNotes = [...interactions]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5);

  const redeemablePoints = maxRedeemablePoints(member, loyaltyRules);
  const redeemableValueCents = Math.round(redeemablePoints * loyaltyRules.point_value_cents);

  const birthdayIn = daysUntilBirthday(member.date_of_birth, now);
  const isBirthdayToday = birthdayIn === 0;

  const alerts: PosMemberAlert[] = [];
  if (member.status === 'SUSPENDED') {
    alerts.push({
      level: 'block',
      code: 'SUSPENDED',
      message: `Suspended — do not serve.${member.suspended_reason ? ` ${member.suspended_reason}` : ''}`,
    });
  }
  if (member.status === 'PENDING_KYC') {
    alerts.push({
      level: 'warn',
      code: 'PENDING_KYC',
      message: 'KYC not approved yet. Check ID at the counter before serving.',
    });
  }
  const dueNow = openFollowUps.filter(
    (row) => row.follow_up_at !== null && new Date(row.follow_up_at).getTime() <= now.getTime(),
  );
  if (dueNow.length > 0) {
    alerts.push({
      level: 'warn',
      code: 'FOLLOW_UP_DUE',
      message:
        dueNow.length === 1
          ? `Follow-up due: ${dueNow[0]!.summary}`
          : `${dueNow.length} follow-ups are due for this member.`,
    });
  }
  if (isBirthdayToday) {
    alerts.push({ level: 'info', code: 'BIRTHDAY', message: 'Birthday today — say something.' });
  } else if (birthdayIn !== null && birthdayIn <= 7) {
    alerts.push({
      level: 'info',
      code: 'BIRTHDAY',
      message: `Birthday in ${birthdayIn} ${birthdayIn === 1 ? 'day' : 'days'}.`,
    });
  }
  if (segment === 'FIRST_VISIT') {
    alerts.push({
      level: 'info',
      code: 'FIRST_VISIT',
      message: 'First purchase — walk them through the menu and the points programme.',
    });
  }
  if ((segment === 'AT_RISK' || segment === 'LAPSED') && daysSinceLastVisit !== null) {
    alerts.push({
      level: 'info',
      code: 'WIN_BACK',
      message: `Back after ${daysSinceLastVisit} days — welcome them back.`,
    });
  }
  if (redeemablePoints > 0) {
    alerts.push({
      level: 'info',
      code: 'POINTS_READY',
      message: `${redeemablePoints} points ready to redeem.`,
    });
  }

  return {
    segment,
    visitCount,
    lifetimeSpendCents,
    averageBasketCents,
    lastVisitAt,
    daysSinceLastVisit,
    usual,
    lastOrder,
    openFollowUps,
    recentNotes,
    alerts,
    redeemablePoints,
    redeemableValueCents,
    isBirthdayToday,
  };
}
