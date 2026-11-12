import { NextResponse, type NextRequest } from 'next/server';

import {
  branchWhatsAppNumber,
  buildOrderWhatsAppMessage,
  orderItemLines,
  type OrderNotice,
} from '@/lib/notifications/order-whatsapp';
import { formatCents } from '@/lib/money';
import { createCartelServerClient, isSupabaseServerConfigured } from '@/lib/supabase/server';

/**
 * 420 CARTEL :: automatic branch WhatsApp notice
 *
 * Called by checkout once an order is confirmed. Sends the member and order
 * details to the order's branch through the WhatsApp Business Cloud API.
 *
 * The caller only supplies an order id. Everything in the message — member,
 * items, totals and the destination number — is read back from the database
 * under the caller's own session, so this cannot be used to send arbitrary
 * text to arbitrary numbers, or to announce someone else's order.
 *
 * Environment:
 *   WHATSAPP_ACCESS_TOKEN      Cloud API token (required to send)
 *   WHATSAPP_PHONE_NUMBER_ID   sending number's id (required to send)
 *   WHATSAPP_TEMPLATE_NAME     approved template; without it a free-form text
 *                              is sent, which WhatsApp only delivers if the
 *                              branch messaged the sending number in the last
 *                              24 hours
 *   WHATSAPP_TEMPLATE_LANG     template language code (default en)
 *
 * Template body variables, in order:
 *   {{1}} order number   {{2}} member name, code and phone
 *   {{3}} collection or delivery details   {{4}} items   {{5}} total
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const GRAPH_VERSION = 'v21.0';

const PAYMENT_LABELS: Record<string, string> = {
  CARD_TERMINAL: 'Card',
  EFT_INSTANT: 'Instant EFT',
  MEMBER_CREDIT: 'Member credit',
  CASH: 'Cash',
};

/** Template variables may not contain new lines, tabs or runs of spaces. */
function templateParam(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 900) || '-';
}

export async function POST(request: NextRequest) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId || !isSupabaseServerConfigured()) {
    // Not an error: the confirmation screen falls back to the one-tap link.
    return NextResponse.json({ sent: false, reason: 'not_configured' });
  }

  let orderId: unknown;
  try {
    ({ orderId } = (await request.json()) as { orderId?: unknown });
  } catch {
    return NextResponse.json({ sent: false, reason: 'bad_request' }, { status: 400 });
  }
  if (typeof orderId !== 'string' || !/^[0-9a-f-]{36}$/i.test(orderId)) {
    return NextResponse.json({ sent: false, reason: 'bad_request' }, { status: 400 });
  }

  const supabase = await createCartelServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ sent: false, reason: 'unauthorised' }, { status: 401 });
  }

  // Row security already limits a member to their own orders; the explicit
  // member filter keeps that true even for a staff session calling this.
  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .eq('member_id', user.id)
    .maybeSingle();
  if (!order) {
    return NextResponse.json({ sent: false, reason: 'order_not_found' }, { status: 404 });
  }

  const [{ data: items }, { data: branch }, { data: member }, { data: payments }] = await Promise.all([
    supabase.from('order_items').select('*').eq('order_id', order.id),
    supabase.from('branches').select('*').eq('id', order.branch_id).maybeSingle(),
    supabase.from('members').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('payments').select('*').eq('order_id', order.id),
  ]);

  const to = branch ? branchWhatsAppNumber(branch) : null;
  if (!branch || !to) {
    return NextResponse.json({ sent: false, reason: 'branch_has_no_number' });
  }

  const notice: OrderNotice = {
    orderNumber: order.order_number,
    branchName: branch.name,
    fulfilment: order.fulfilment_type === 'DELIVERY' ? 'DELIVERY' : 'PICKUP',
    member: {
      name: member ? `${member.first_name} ${member.last_name}`.trim() : 'Member',
      code: member?.member_code ?? null,
      phone: member?.phone ?? null,
    },
    items: (items ?? []).map((item) => ({
      quantity: item.quantity,
      productName: item.product_name,
      variantLabel: item.variant_label,
      lineTotalCents: item.line_total_cents,
    })),
    subtotalCents: order.subtotal_cents,
    discountCents: order.subtotal_cents + order.delivery_fee_cents - order.total_cents,
    deliveryFeeCents: order.delivery_fee_cents,
    totalCents: order.total_cents,
    paymentLabel:
      (payments ?? [])
        .map((payment) => PAYMENT_LABELS[payment.method] ?? payment.method)
        .filter((label, index, all) => all.indexOf(label) === index)
        .join(' + ') || null,
    pickupSlotStart: order.pickup_slot_start,
    pickupSlotEnd: order.pickup_slot_end,
    deliveryAddress: order.delivery_address,
    deliverySuburb: order.delivery_suburb,
    deliveryInstructions: order.delivery_instructions,
  };

  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
  const payload = templateName
    ? {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG ?? 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                notice.orderNumber,
                [notice.member.name, notice.member.code, notice.member.phone].filter(Boolean).join(' / '),
                notice.fulfilment === 'DELIVERY'
                  ? `Delivery to ${[notice.deliveryAddress, notice.deliverySuburb].filter(Boolean).join(', ')}${
                      notice.deliveryInstructions ? ` (${notice.deliveryInstructions})` : ''
                    }`
                  : 'Collection in store',
                orderItemLines(notice).join('; '),
                formatCents(notice.totalCents),
              ].map((text) => ({ type: 'text', text: templateParam(text) })),
            },
          ],
        },
      }
    : {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { preview_url: false, body: buildOrderWhatsAppMessage(notice) },
      };

  try {
    const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error(`[order-whatsapp] ${order.order_number} rejected (${response.status}): ${detail.slice(0, 500)}`);
      return NextResponse.json({ sent: false, reason: 'provider_rejected' });
    }
    return NextResponse.json({ sent: true });
  } catch (caught) {
    console.error(`[order-whatsapp] ${order.order_number} failed:`, caught);
    return NextResponse.json({ sent: false, reason: 'provider_unreachable' });
  }
}
