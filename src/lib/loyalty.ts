/**
 * Module F — Loyalty & Affiliate seams.
 *
 * The database already carries the ledgers, balances, rank fields and referral
 * attribution rows, and `process_cartel_order` writes them on every sale. What
 * is deliberately left configurable is the *rules*: earn rate, point value,
 * rank thresholds and category multipliers all live in the `loyalty_rules`
 * row, so changing the reward programme is an UPDATE, never a migration.
 *
 * These interfaces are the contract an eventual rules engine implements. The
 * default implementations below mirror the SQL exactly so the app and the
 * database never disagree about a balance.
 */

import type {
  AffiliateCodeRow,
  LoyaltyRulesRow,
  MemberRank,
  MemberRow,
  OrderRow,
  ProductCategory,
} from '@/types/database';

export const MEMBER_RANKS: readonly MemberRank[] = [
  'INITIATE',
  'SOLDIER',
  'CAPO',
  'CONSIGLIERE',
];

export const RANK_LABEL: Record<MemberRank, string> = {
  INITIATE: 'Initiate',
  SOLDIER: 'Soldier',
  CAPO: 'Capo',
  CONSIGLIERE: 'Consigliere',
};

export const DEFAULT_RANK_THRESHOLDS: Record<MemberRank, number> = {
  INITIATE: 0,
  SOLDIER: 250_000,
  CAPO: 1_000_000,
  CONSIGLIERE: 5_000_000,
};

export interface EarnContext {
  /** Net of discounts, excluding delivery fees — matches the SQL. */
  eligibleSubtotalCents: number;
  categories: ProductCategory[];
  member: Pick<MemberRow, 'id' | 'rank' | 'status'> | null;
}

export interface RedeemQuote {
  points: number;
  valueCents: number;
  allowed: boolean;
  reason: string | null;
}

export interface RankProgress {
  current: MemberRank;
  next: MemberRank | null;
  /** 0-1 toward the next rank; 1 at the top rank. */
  progress: number;
  centsToNext: number | null;
}

/**
 * The seam an eventual rules engine implements. Swap the implementation, keep
 * every caller.
 */
export interface LoyaltyEngine {
  readonly rules: LoyaltyRulesRow | null;
  pointsForOrder(context: EarnContext): number;
  quoteRedemption(points: number, member: MemberRow, orderSubtotalCents: number): RedeemQuote;
  rankForLifetimeValue(lifetimeValueCents: number): MemberRank;
  rankProgress(lifetimeValueCents: number): RankProgress;
  pointsToCents(points: number): number;
}

export interface AffiliateAttributionDraft {
  code: string;
  landingPath: string;
  capturedAt: string;
}

/**
 * The seam for referral attribution. `?ref=CARTEL-XXXX` is captured by
 * middleware into a first-party cookie, read at onboarding (signup credit) and
 * again at checkout (order credit).
 */
export interface AffiliateTracker {
  readonly cookieName: string;
  readonly cookieMaxAgeSeconds: number;
  normalizeCode(raw: string): string | null;
  isValidShape(code: string): boolean;
  commissionCents(code: AffiliateCodeRow, eligibleSubtotalCents: number): number;
}

// ---------------------------------------------------------------------------
// Default implementations — mirror of the SQL in 20261107000003.
// ---------------------------------------------------------------------------

export class DefaultLoyaltyEngine implements LoyaltyEngine {
  public readonly rules: LoyaltyRulesRow | null;

  constructor(rules: LoyaltyRulesRow | null) {
    this.rules = rules;
  }

  private get pointsPer100(): number {
    return this.rules?.points_per_100_cents ?? 1;
  }

  private get pointValueCents(): number {
    return this.rules?.point_value_cents ?? 1;
  }

  private get thresholds(): Record<MemberRank, number> {
    return this.rules?.rank_thresholds ?? DEFAULT_RANK_THRESHOLDS;
  }

  /**
   * Base accrual matches the SQL: floor(rands * points_per_100_cents).
   * Category multipliers are applied on top of the base, so configuring one
   * never changes what the database already credited — the difference is
   * written as a separate bonus ledger entry by the caller.
   */
  pointsForOrder(context: EarnContext): number {
    if (!context.member) return 0;
    if (context.member.status === 'SUSPENDED') return 0;
    if (context.eligibleSubtotalCents <= 0) return 0;

    const base = Math.floor((context.eligibleSubtotalCents / 100) * this.pointsPer100);
    const multipliers = this.rules?.category_multipliers ?? {};

    const best = context.categories.reduce((highest, category) => {
      const multiplier = multipliers[category];
      return multiplier && multiplier > highest ? multiplier : highest;
    }, 1);

    return Math.floor(base * best);
  }

  quoteRedemption(points: number, member: MemberRow, orderSubtotalCents: number): RedeemQuote {
    const minimum = this.rules?.min_redeem_points ?? 0;
    const valueCents = this.pointsToCents(points);

    if (!Number.isInteger(points) || points <= 0) {
      return { points, valueCents: 0, allowed: false, reason: 'Enter a whole number of points.' };
    }
    if (points > member.points_balance) {
      return {
        points,
        valueCents,
        allowed: false,
        reason: `You hold ${member.points_balance} points.`,
      };
    }
    if (points < minimum) {
      return {
        points,
        valueCents,
        allowed: false,
        reason: `Minimum redemption is ${minimum} points.`,
      };
    }
    if (valueCents > orderSubtotalCents) {
      return {
        points,
        valueCents,
        allowed: false,
        reason: 'Redemption cannot exceed the order subtotal.',
      };
    }
    return { points, valueCents, allowed: true, reason: null };
  }

  rankForLifetimeValue(lifetimeValueCents: number): MemberRank {
    const entries = Object.entries(this.thresholds) as [MemberRank, number][];
    return entries
      .sort((a, b) => a[1] - b[1])
      .reduce<MemberRank>(
        (best, [rank, threshold]) => (lifetimeValueCents >= threshold ? rank : best),
        'INITIATE',
      );
  }

  rankProgress(lifetimeValueCents: number): RankProgress {
    const current = this.rankForLifetimeValue(lifetimeValueCents);
    const ordered = (Object.entries(this.thresholds) as [MemberRank, number][]).sort(
      (a, b) => a[1] - b[1],
    );
    const index = ordered.findIndex(([rank]) => rank === current);
    const nextEntry = ordered[index + 1];

    if (!nextEntry) {
      return { current, next: null, progress: 1, centsToNext: null };
    }

    const currentEntry = ordered[index];
    const floor = currentEntry ? currentEntry[1] : 0;
    const ceiling = nextEntry[1];
    const span = ceiling - floor;

    return {
      current,
      next: nextEntry[0],
      progress: span <= 0 ? 1 : Math.min(1, (lifetimeValueCents - floor) / span),
      centsToNext: Math.max(0, ceiling - lifetimeValueCents),
    };
  }

  pointsToCents(points: number): number {
    return Math.round(points * this.pointValueCents);
  }
}

export const REFERRAL_COOKIE = 'cartel_ref';
export const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export class DefaultAffiliateTracker implements AffiliateTracker {
  public readonly cookieName = REFERRAL_COOKIE;
  public readonly cookieMaxAgeSeconds = REFERRAL_COOKIE_MAX_AGE;

  /** `CARTEL-` + 4-12 alphanumerics, upper-cased. */
  normalizeCode(raw: string): string | null {
    const code = raw.trim().toUpperCase();
    return this.isValidShape(code) ? code : null;
  }

  isValidShape(code: string): boolean {
    return /^CARTEL-[A-Z0-9]{4,12}$/.test(code);
  }

  commissionCents(code: AffiliateCodeRow, eligibleSubtotalCents: number): number {
    if (!code.is_active || code.commission_bps <= 0) return 0;
    return Math.round((eligibleSubtotalCents * code.commission_bps) / 10_000);
  }
}

export const affiliateTracker = new DefaultAffiliateTracker();

/** Eligible subtotal for an order: net of discount, excluding delivery. */
export function eligibleSubtotalCents(order: Pick<OrderRow, 'subtotal_cents' | 'discount_cents'>): number {
  return Math.max(0, order.subtotal_cents - order.discount_cents);
}

export function referralLink(siteUrl: string, code: string): string {
  const url = new URL(siteUrl);
  url.searchParams.set('ref', code);
  return url.toString();
}
