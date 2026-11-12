/**
 * 420 CARTEL :: branch WhatsApp order notification
 *
 * One place that decides WHO gets told about an order (the branch's WhatsApp
 * number) and WHAT they are told (member + order details). It is pure and has
 * no server or browser dependencies, so the checkout screen and the API route
 * build the identical message.
 *
 * Two delivery paths use it:
 *   - automatic: /api/notifications/order-whatsapp sends through the WhatsApp
 *     Business Cloud API as soon as checkout confirms (needs credentials);
 *   - one tap:   a wa.me link on the confirmation screen opens WhatsApp with
 *     the message pre-written to the branch (needs nothing).
 */

import { formatCents } from '@/lib/money';

export interface OrderNotice {
  orderNumber: string;
  branchName: string;
  fulfilment: 'PICKUP' | 'DELIVERY';
  member: {
    name: string;
    code: string | null;
    phone: string | null;
  };
  items: {
    quantity: number;
    productName: string;
    variantLabel: string;
    lineTotalCents: number;
  }[];
  subtotalCents: number;
  discountCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  paymentLabel?: string | null;
  /** ISO timestamps of the collection window, for PICKUP orders. */
  pickupSlotStart?: string | null;
  pickupSlotEnd?: string | null;
  deliveryAddress?: string | null;
  deliverySuburb?: string | null;
  deliveryInstructions?: string | null;
}

/**
 * The demo catalogue uses stand-in branches with made-up landlines. Point them
 * at the real lounges so a demo order opens a chat with an actual branch.
 */
const BRANCH_WHATSAPP_BY_SLUG: Record<string, string> = {
  'sandton-vault': '067 755 1674', // Rivonia
  'rosebank-dispensary': '072 333 0854', // Norwood
};

/** Digits only, in international form without the plus: 0721234567 -> 27721234567. */
export function toWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `27${digits.slice(1)}`;
  // SA numbers are 27 + 9 digits; accept other countries at a sane length.
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

/** The WhatsApp number a branch receives order notices on. */
export function branchWhatsAppNumber(branch: {
  slug?: string | null;
  phone?: string | null;
}): string | null {
  const override = branch.slug ? BRANCH_WHATSAPP_BY_SLUG[branch.slug] : undefined;
  return toWhatsAppNumber(override ?? branch.phone);
}

const TIME = new Intl.DateTimeFormat('en-ZA', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Africa/Johannesburg',
});
const DAY = new Intl.DateTimeFormat('en-ZA', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'Africa/Johannesburg',
});

function pickupWindow(start?: string | null, end?: string | null): string | null {
  if (!start) return null;
  const from = new Date(start);
  if (Number.isNaN(from.getTime())) return null;
  const to = end ? new Date(end) : null;
  const range =
    to && !Number.isNaN(to.getTime()) ? `${TIME.format(from)} to ${TIME.format(to)}` : TIME.format(from);
  return `${DAY.format(from)}, ${range}`;
}

/** One line per item, used by both the full message and the template send. */
export function orderItemLines(notice: OrderNotice): string[] {
  return notice.items.map(
    (item) =>
      `${item.quantity} x ${item.productName} (${item.variantLabel}) - ${formatCents(item.lineTotalCents)}`,
  );
}

/** The full message a branch reads. WhatsApp renders *text* as bold. */
export function buildOrderWhatsAppMessage(notice: OrderNotice): string {
  const lines: string[] = [];
  const isDelivery = notice.fulfilment === 'DELIVERY';

  lines.push(`*NEW ORDER ${notice.orderNumber}*`);
  lines.push(`${notice.branchName} · ${isDelivery ? 'Delivery' : 'Collection'}`);
  lines.push('');

  lines.push('*Member*');
  lines.push(notice.member.code ? `${notice.member.name} (${notice.member.code})` : notice.member.name);
  if (notice.member.phone) lines.push(`Phone: ${notice.member.phone}`);
  lines.push('');

  lines.push('*Order*');
  for (const line of orderItemLines(notice)) lines.push(`• ${line}`);
  lines.push('');

  lines.push(`Subtotal: ${formatCents(notice.subtotalCents)}`);
  if (notice.discountCents > 0) lines.push(`Discount: -${formatCents(notice.discountCents)}`);
  if (isDelivery) {
    lines.push(
      `Delivery fee: ${notice.deliveryFeeCents === 0 ? 'Free' : formatCents(notice.deliveryFeeCents)}`,
    );
  }
  lines.push(`*Total: ${formatCents(notice.totalCents)}*`);
  if (notice.paymentLabel) lines.push(`Payment: ${notice.paymentLabel}`);
  lines.push('');

  if (isDelivery) {
    lines.push('*Deliver to*');
    lines.push(
      [notice.deliveryAddress, notice.deliverySuburb].filter(Boolean).join(', ') || 'Address on the order',
    );
    if (notice.deliveryInstructions) lines.push(`Note: ${notice.deliveryInstructions}`);
  } else {
    const window = pickupWindow(notice.pickupSlotStart, notice.pickupSlotEnd);
    lines.push(`*Collection*${window ? `: ${window}` : ''}`);
  }

  return lines.join('\n').trim();
}

/** A link that opens WhatsApp with the message pre-written to the branch. */
export function orderWhatsAppLink(number: string, message: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
