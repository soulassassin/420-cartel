/**
 * Money is integer cents (ZAR) everywhere — in the database, over the wire and
 * in state. Floats only ever appear at the formatting boundary.
 */

const ZAR = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const ZAR_COMPACT = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatCents(cents: number): string {
  return ZAR.format(cents / 100);
}

export function formatCentsCompact(cents: number): string {
  return ZAR_COMPACT.format(cents / 100);
}

/** Bare amount with no currency symbol — for receipt columns. */
export function formatCentsBare(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function randsToCents(rands: number): number {
  return Math.round(rands * 100);
}

export function centsToRands(cents: number): number {
  return cents / 100;
}

/** Parse free-text currency input ("R 1 299,50", "1299.5") into cents. */
export function parseCurrencyToCents(input: string): number | null {
  const cleaned = input
    .replace(/[Rr\s ]/g, '')
    .replace(/,(\d{1,2})$/, '.$1')
    .replace(/,/g, '');
  if (cleaned === '' || !/^-?\d*\.?\d*$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/** Cash-drawer rounding: ZAR coins bottom out at 10c. */
export function roundToNearest10Cents(cents: number): number {
  return Math.round(cents / 10) * 10;
}

export function sumCents(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** Gross margin in basis points, guarded against zero revenue. */
export function marginBps(revenueCents: number, costCents: number): number {
  if (revenueCents <= 0) return 0;
  return Math.round(((revenueCents - costCents) / revenueCents) * 10_000);
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}
