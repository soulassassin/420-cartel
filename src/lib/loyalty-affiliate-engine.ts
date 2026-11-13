/**
 * 420 CARTEL :: loyalty & affiliate engine (Module 7)
 *
 * STATUS: rule parameters ready for final calibration.
 *
 * Every business rule in the rewards programme lives in ONE config object,
 * `CARTEL_REWARD_CONFIG`, below. The rest of this file is mechanism. Tuning the
 * programme means editing that object, or — better, in production — editing the
 * `loyalty_rules` row it mirrors, because `process_cartel_order` reads the row,
 * not this file. `CartelLoyaltyAndAffiliateEngine.fromRules()` loads the row and
 * falls back to these defaults field by field, so the two can never drift into
 * an inconsistent state: the database always wins where it has an opinion.
 *
 * WHY POINTS ARE EARNED IN SQL: the order function credits points in the same
 * transaction as the sale, so a member's balance can never disagree with their
 * order history. This engine computes the *same* numbers for display, quoting
 * and admin projection — it does not write balances.
 */

import type {
  AffiliateCodeRow,
  LoyaltyRulesRow,
  MemberRank,
  MemberRow,
  OrderRow,
  ProductCategory,
} from '@/types/database';

// ===========================================================================
// THE CONFIG OBJECT — the only thing to touch when calibrating the programme
// ===========================================================================

export interface CartelRewardConfig {
  /** Points earned per R10 of eligible spend. */
  POINTS_PER_TEN_RAND: number;
  /** What one point is worth when redeemed, in cents. */
  POINT_VALUE_CENTS: number;
  /** Fewest points redeemable in one order. */
  MIN_REDEEM_POINTS: number;
  /** Share of an order that points may cover, 0-1. */
  MAX_REDEMPTION_SHARE: number;
  /** Lifetime spend (cents) required for each rank. */
  RANK_THRESHOLDS: Record<MemberRank, number>;
  /** The street name shown on a member's badge for each rank. */
  RANK_LABELS: Record<MemberRank, string>;
  /** Earn multiplier per rank — loyalty compounding for the top ranks. */
  RANK_EARN_MULTIPLIER: Record<MemberRank, number>;
  /** Optional earn multipliers per catalogue category. */
  CATEGORY_MULTIPLIERS: Partial<Record<ProductCategory, number>>;
  /** Default affiliate commission, in basis points. 500 = 5%. */
  DEFAULT_COMMISSION_BPS: number;
  /** Ceiling on any single affiliate code's commission. */
  MAX_COMMISSION_BPS: number;
  /** How long a captured `?ref=` code stays attributable, in days. */
  REFERRAL_WINDOW_DAYS: number;
  /** Points granted to a new member who signed up through a referral. */
  SIGNUP_BONUS_POINTS: number;
  /** Points granted to the referrer once their referral's first order lands. */
  REFERRER_BONUS_POINTS: number;
  /** Commission is paid on subtotal net of discount, never on delivery. */
  COMMISSION_EXCLUDES_DELIVERY: boolean;
}

export const CARTEL_REWARD_CONFIG: CartelRewardConfig = {
  POINTS_PER_TEN_RAND: 1,
  POINT_VALUE_CENTS: 1,
  MIN_REDEEM_POINTS: 100,
  MAX_REDEMPTION_SHARE: 0.5,

  RANK_THRESHOLDS: {
    INITIATE: 0,
    SOLDIER: 250_000,
    CAPO: 1_000_000,
    CONSIGLIERE: 5_000_000,
  },

  // The enum values are fixed in Postgres; the wording members see is not.
  RANK_LABELS: {
    INITIATE: 'ASSOCIATE',
    SOLDIER: 'SOLDIER',
    CAPO: 'CAPOREGIME',
    CONSIGLIERE: 'DON',
  },

  RANK_EARN_MULTIPLIER: {
    INITIATE: 1,
    SOLDIER: 1,
    CAPO: 1.25,
    CONSIGLIERE: 1.5,
  },

  CATEGORY_MULTIPLIERS: {},

  DEFAULT_COMMISSION_BPS: 500,
  MAX_COMMISSION_BPS: 2_000,
  REFERRAL_WINDOW_DAYS: 30,
  SIGNUP_BONUS_POINTS: 0,
  REFERRER_BONUS_POINTS: 0,
  COMMISSION_EXCLUDES_DELIVERY: true,
};

/** Rank order, lowest to highest. */
export const RANK_ORDER: readonly MemberRank[] = [
  'INITIATE',
  'SOLDIER',
  'CAPO',
  'CONSIGLIERE',
];

export const REFERRAL_COOKIE_NAME = 'cartel_ref';
/** `CARTEL-` + 4-12 alphanumerics. Matches the SQL default shape. */
export const REFERRAL_CODE_PATTERN = /^CARTEL-[A-Z0-9]{4,12}$/;

// ===========================================================================
// MECHANISM
// ===========================================================================

export interface EarnBreakdown {
  /** Spend the accrual was computed on. */
  eligibleCents: number;
  /** Points the SQL credits: floor(rands x points_per_100_cents). */
  basePoints: number;
  rankMultiplier: number;
  categoryMultiplier: number;
  /** Total after multipliers — what the member is shown. */
  totalPoints: number;
  /** Points above `basePoints`, written as a separate bonus ledger entry. */
  bonusPoints: number;
}

export interface RedemptionQuote {
  points: number;
  valueCents: number;
  allowed: boolean;
  reason: string | null;
  /** Largest redemption this order and balance permit. */
  maxPoints: number;
}

export interface RankProgress {
  current: MemberRank;
  currentLabel: string;
  next: MemberRank | null;
  nextLabel: string | null;
  /** 0-1 toward the next rank; 1 at the top. */
  progress: number;
  centsToNext: number | null;
}

export interface CommissionBreakdown {
  code: string;
  commissionBps: number;
  eligibleCents: number;
  commissionCents: number;
  /** False when the code is inactive or carries no rate. */
  payable: boolean;
  reason: string | null;
}

/**
 * The rules engine. Construct from a `loyalty_rules` row in production, or from
 * the bare config in tests and previews.
 */
export class CartelLoyaltyAndAffiliateEngine {
  public readonly config: CartelRewardConfig;
  /** The row this engine was built from, when there was one. */
  public readonly rules: LoyaltyRulesRow | null;

  constructor(config: CartelRewardConfig = CARTEL_REWARD_CONFIG, rules: LoyaltyRulesRow | null = null) {
    this.config = config;
    this.rules = rules;
  }

  /**
   * Build from the live `loyalty_rules` row, falling back per field.
   *
   * The row stores `points_per_100_cents` (points per R1) because that is the
   * unit the SQL accrues in; the config states the same rule per R10, which is
   * how the business talks about it. The conversion happens here, once.
   */
  static fromRules(rules: LoyaltyRulesRow | null): CartelLoyaltyAndAffiliateEngine {
    if (!rules) return new CartelLoyaltyAndAffiliateEngine();

    const base = CARTEL_REWARD_CONFIG;

    return new CartelLoyaltyAndAffiliateEngine(
      {
        ...base,
        POINTS_PER_TEN_RAND: Number(rules.points_per_100_cents) * 10,
        POINT_VALUE_CENTS: Number(rules.point_value_cents),
        MIN_REDEEM_POINTS: Number(rules.min_redeem_points),
        RANK_THRESHOLDS: { ...base.RANK_THRESHOLDS, ...(rules.rank_thresholds ?? {}) },
        RANK_LABELS: { ...base.RANK_LABELS, ...(rules.rank_labels ?? {}) },
        CATEGORY_MULTIPLIERS: {
          ...base.CATEGORY_MULTIPLIERS,
          ...(rules.category_multipliers ?? {}),
        },
        DEFAULT_COMMISSION_BPS: rules.default_commission_bps ?? base.DEFAULT_COMMISSION_BPS,
        REFERRAL_WINDOW_DAYS: rules.referral_window_days ?? base.REFERRAL_WINDOW_DAYS,
        SIGNUP_BONUS_POINTS: Number(rules.signup_bonus_points ?? base.SIGNUP_BONUS_POINTS),
        REFERRER_BONUS_POINTS: Number(rules.referrer_bonus_points ?? base.REFERRER_BONUS_POINTS),
      },
      rules,
    );
  }

  /** Points per R1 — the unit the SQL accrual uses. */
  get pointsPerRand(): number {
    return this.config.POINTS_PER_TEN_RAND / 10;
  }

  /** Eligible spend for earning and commission: net of discount, ex delivery. */
  eligibleCents(order: Pick<OrderRow, 'subtotal_cents' | 'discount_cents' | 'delivery_fee_cents'>): number {
    const net = order.subtotal_cents - order.discount_cents;
    return Math.max(
      0,
      this.config.COMMISSION_EXCLUDES_DELIVERY ? net : net + order.delivery_fee_cents,
    );
  }

  /**
   * Points for an order.
   *
   * `basePoints` is exactly what `process_cartel_order` credits. Rank and
   * category multipliers are applied on top, and the difference is reported as
   * `bonusPoints` so the caller writes it as its own ledger row rather than
   * silently disagreeing with what SQL already banked.
   */
  pointsForOrder(input: {
    eligibleCents: number;
    rank?: MemberRank | null;
    categories?: ProductCategory[];
    suspended?: boolean;
  }): EarnBreakdown {
    const empty: EarnBreakdown = {
      eligibleCents: Math.max(0, input.eligibleCents),
      basePoints: 0,
      rankMultiplier: 1,
      categoryMultiplier: 1,
      totalPoints: 0,
      bonusPoints: 0,
    };

    if (input.suspended || input.eligibleCents <= 0) return empty;

    const basePoints = Math.floor((input.eligibleCents / 100) * this.pointsPerRand);
    const rankMultiplier = input.rank
      ? this.config.RANK_EARN_MULTIPLIER[input.rank] ?? 1
      : 1;

    // Highest applicable category multiplier wins; they never stack.
    const categoryMultiplier = (input.categories ?? []).reduce((highest, category) => {
      const multiplier = this.config.CATEGORY_MULTIPLIERS[category];
      return multiplier && multiplier > highest ? multiplier : highest;
    }, 1);

    const totalPoints = Math.floor(basePoints * rankMultiplier * categoryMultiplier);

    return {
      eligibleCents: input.eligibleCents,
      basePoints,
      rankMultiplier,
      categoryMultiplier,
      totalPoints,
      bonusPoints: Math.max(0, totalPoints - basePoints),
    };
  }

  pointsToCents(points: number): number {
    return Math.round(points * this.config.POINT_VALUE_CENTS);
  }

  centsToPoints(cents: number): number {
    if (this.config.POINT_VALUE_CENTS <= 0) return 0;
    return Math.floor(cents / this.config.POINT_VALUE_CENTS);
  }

  /** Most points this member may spend on this order. */
  maxRedeemablePoints(pointsBalance: number, orderSubtotalCents: number): number {
    const shareCap = Math.floor(orderSubtotalCents * this.config.MAX_REDEMPTION_SHARE);
    return Math.max(0, Math.min(pointsBalance, this.centsToPoints(shareCap)));
  }

  quoteRedemption(
    points: number,
    member: Pick<MemberRow, 'points_balance' | 'status'>,
    orderSubtotalCents: number,
  ): RedemptionQuote {
    const maxPoints = this.maxRedeemablePoints(member.points_balance, orderSubtotalCents);
    const valueCents = this.pointsToCents(points);
    const base = { points, valueCents, maxPoints };

    if (member.status === 'SUSPENDED') {
      return { ...base, allowed: false, reason: 'This membership is suspended.' };
    }
    if (!Number.isInteger(points) || points <= 0) {
      return { ...base, allowed: false, reason: 'Enter a whole number of points.' };
    }
    if (points > member.points_balance) {
      return { ...base, allowed: false, reason: `You hold ${member.points_balance} points.` };
    }
    if (points < this.config.MIN_REDEEM_POINTS) {
      return {
        ...base,
        allowed: false,
        reason: `Minimum redemption is ${this.config.MIN_REDEEM_POINTS} points.`,
      };
    }
    if (points > maxPoints) {
      const share = Math.round(this.config.MAX_REDEMPTION_SHARE * 100);
      return {
        ...base,
        allowed: false,
        reason: `Points may cover at most ${share}% of an order — ${maxPoints} here.`,
      };
    }
    return { ...base, allowed: true, reason: null };
  }

  /** Rank for a lifetime spend. Mirrors `public.rank_for_lifetime_value`. */
  rankForLifetimeValue(lifetimeValueCents: number): MemberRank {
    return RANK_ORDER.reduce<MemberRank>((best, rank) => {
      const threshold = this.config.RANK_THRESHOLDS[rank];
      return lifetimeValueCents >= threshold ? rank : best;
    }, 'INITIATE');
  }

  rankLabel(rank: MemberRank): string {
    return this.config.RANK_LABELS[rank] ?? rank;
  }

  rankProgress(lifetimeValueCents: number): RankProgress {
    const current = this.rankForLifetimeValue(lifetimeValueCents);
    const index = RANK_ORDER.indexOf(current);
    const next = RANK_ORDER[index + 1] ?? null;

    if (!next) {
      return {
        current,
        currentLabel: this.rankLabel(current),
        next: null,
        nextLabel: null,
        progress: 1,
        centsToNext: null,
      };
    }

    const floor = this.config.RANK_THRESHOLDS[current];
    const ceiling = this.config.RANK_THRESHOLDS[next];
    const span = ceiling - floor;

    return {
      current,
      currentLabel: this.rankLabel(current),
      next,
      nextLabel: this.rankLabel(next),
      progress: span <= 0 ? 1 : Math.min(1, Math.max(0, (lifetimeValueCents - floor) / span)),
      centsToNext: Math.max(0, ceiling - lifetimeValueCents),
    };
  }

  /** Distribution of members across ranks, for the admin panel. */
  rankDistribution(
    members: readonly Pick<MemberRow, 'rank'>[],
  ): { rank: MemberRank; label: string; count: number; share: number }[] {
    const total = members.length;
    return RANK_ORDER.map((rank) => {
      const count = members.filter((member) => member.rank === rank).length;
      return {
        rank,
        label: this.rankLabel(rank),
        count,
        share: total === 0 ? 0 : count / total,
      };
    });
  }

  // -----------------------------------------------------------------------
  // Affiliate side
  // -----------------------------------------------------------------------

  normalizeCode(raw: string): string | null {
    const code = raw.trim().toUpperCase();
    return REFERRAL_CODE_PATTERN.test(code) ? code : null;
  }

  isValidCodeShape(code: string): boolean {
    return REFERRAL_CODE_PATTERN.test(code.trim().toUpperCase());
  }

  get cookieMaxAgeSeconds(): number {
    return this.config.REFERRAL_WINDOW_DAYS * 24 * 60 * 60;
  }

  /** Commission on one order. Mirrors the SQL in `process_cartel_order`. */
  commissionFor(
    code: Pick<AffiliateCodeRow, 'code' | 'commission_bps' | 'is_active'>,
    eligibleCents: number,
  ): CommissionBreakdown {
    const bps = Math.min(code.commission_bps, this.config.MAX_COMMISSION_BPS);
    const base = {
      code: code.code,
      commissionBps: bps,
      eligibleCents: Math.max(0, eligibleCents),
    };

    if (!code.is_active) {
      return { ...base, commissionCents: 0, payable: false, reason: 'Code is deactivated.' };
    }
    if (bps <= 0) {
      return { ...base, commissionCents: 0, payable: false, reason: 'No commission rate set.' };
    }
    if (eligibleCents <= 0) {
      return { ...base, commissionCents: 0, payable: false, reason: 'Nothing eligible on this order.' };
    }

    return {
      ...base,
      commissionCents: Math.round((eligibleCents * bps) / 10_000),
      payable: true,
      reason: null,
    };
  }

  /** Is a captured referral still inside the attribution window? */
  isAttributionLive(capturedAtIso: string, now: Date = new Date()): boolean {
    const capturedAt = new Date(capturedAtIso).getTime();
    if (!Number.isFinite(capturedAt)) return false;
    return now.getTime() - capturedAt <= this.cookieMaxAgeSeconds * 1000;
  }

  /** A member's shareable referral link. */
  referralLink(siteUrl: string, code: string): string {
    const url = new URL(siteUrl);
    url.searchParams.set('ref', code);
    return url.toString();
  }
}

/** Default engine for surfaces that have not loaded the rules row. */
export const cartelRewardEngine = new CartelLoyaltyAndAffiliateEngine();

// ===========================================================================
// REFERRAL CAPTURE (`?ref=CARTEL-XXXX` -> 30-day cookie)
// ===========================================================================

/**
 * Cookie attributes for a captured referral.
 *
 * `httpOnly` is deliberately false: the onboarding form reads the code to
 * prefill "referred by", and the checkout reads it to attribute the order. It
 * is an attribution hint, not a credential — the authoritative check is the
 * `affiliate_codes` lookup inside `process_cartel_order`.
 *
 * `src/proxy.ts` performs the capture on every page request.
 */
export function referralCookieAttributes(
  config: CartelRewardConfig = CARTEL_REWARD_CONFIG,
): {
  name: string;
  maxAge: number;
  path: string;
  sameSite: 'lax';
  httpOnly: false;
  secure: boolean;
} {
  return {
    name: REFERRAL_COOKIE_NAME,
    maxAge: config.REFERRAL_WINDOW_DAYS * 24 * 60 * 60,
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
  };
}

/** Pull `?ref=` out of a URL or query string, normalised. */
export function captureReferralFromUrl(url: string): string | null {
  try {
    const parsed = url.includes('://') ? new URL(url) : new URL(url, 'https://cartel.local');
    const raw = parsed.searchParams.get('ref');
    return raw ? cartelRewardEngine.normalizeCode(raw) : null;
  } catch {
    return null;
  }
}

/** Read the captured code in the browser. Returns null server-side. */
export function readReferralCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${REFERRAL_COOKIE_NAME}=([^;]*)`),
  );
  if (!match?.[1]) return null;
  return cartelRewardEngine.normalizeCode(decodeURIComponent(match[1]));
}

/**
 * Referral code to attribute an order to.
 *
 * A member's own code is never honoured — self-referral would pay commission on
 * a member's own spend.
 */
export function resolveAttributionCode(input: {
  cookieCode: string | null;
  memberReferralCode?: string | null;
  memberReferredByCode?: string | null;
}): string | null {
  const candidate =
    (input.cookieCode ? cartelRewardEngine.normalizeCode(input.cookieCode) : null) ??
    (input.memberReferredByCode
      ? cartelRewardEngine.normalizeCode(input.memberReferredByCode)
      : null);

  if (!candidate) return null;
  if (input.memberReferralCode && candidate === input.memberReferralCode.toUpperCase()) {
    return null;
  }
  return candidate;
}
