/**
 * 420 CARTEL :: payment abstraction layer (Module 4)
 *
 * The single import surface for checkout and the POS tender drawer. Neither
 * ever branches on a payment method: they ask `listPaymentOptions` what applies
 * in the current context, render what each adapter declares about itself, and
 * hand `buildTender`'s output straight to `process_cartel_order`.
 *
 * The four immediate-checkout strategies Module 4 requires:
 *
 *   MEMBER_CREDIT       spends `members.credit_balance_cents`, capped at the
 *                       balance; `process_cartel_order` debits it atomically
 *                       inside the same transaction as the stock deduction.
 *   MANUAL_EFT          writes the order as AWAITING_PAYMENT and returns the
 *                       bank details plus the `CARTEL-ORDER-XXXX` reference.
 *   PAY_ON_COLLECTION   pickup only; stock is held for the collection slot and
 *                       settled at the counter.
 *   FUTURE_GATEWAY      the pre-wired seam. Flip NEXT_PUBLIC_CARTEL_GATEWAY_
 *                       ENABLED, implement the redirect in the adapter's
 *                       `prepare`, and handle the provider webhook by flipping
 *                       the payment row to CAPTURED. Checkout, the POS and the
 *                       order RPC are untouched by that work.
 *
 * Plus the three in-store methods the tender drawer adds: CASH (with change),
 * CARD_TERMINAL and EFT_INSTANT.
 *
 * ADDING A GATEWAY: write one object satisfying `PaymentAdapter` in
 * `lib/payments/adapters.ts`, register it in `lib/payments/registry.ts`, done.
 * Nothing in the UI needs to know it exists.
 */

export {
  getPaymentAdapter,
  listPaymentOptions,
  availablePaymentOptions,
  buildTender,
  suggestDefaultMethod,
  PaymentAdapterError,
} from '@/lib/payments/registry';

export type {
  PaymentOption,
  TenderLine,
  BuiltTender,
} from '@/lib/payments/registry';

export {
  cashAdapter,
  cardTerminalAdapter,
  eftInstantAdapter,
  manualEftAdapter,
  memberCreditAdapter,
  payOnCollectionAdapter,
  futureGatewayAdapter,
} from '@/lib/payments/adapters';

export type {
  PaymentAdapter,
  PaymentContext,
  PaymentInstruction,
  PaymentTenderInput,
  PreparedPayment,
} from '@/lib/payments/types';

import type { OrderChannel, PaymentMethod } from '@/types/database';

/**
 * Bank reference for a manual EFT: `CARTEL-ORDER-XXXX`.
 *
 * Derived from the order number Postgres already minted, so the reference a
 * member types into their banking app matches the order a human later
 * reconciles — never a second, independently generated code.
 */
export function bankReferenceFor(orderNumber: string): string {
  const digits = orderNumber.replace(/[^0-9]/g, '');
  const tail = digits.length >= 4 ? digits.slice(-6) : orderNumber.toUpperCase();
  return `CARTEL-ORDER-${tail}`;
}

/** Methods offered on each channel, in display order. */
export const CHANNEL_METHODS: Record<OrderChannel, readonly PaymentMethod[]> = {
  ONLINE: ['MEMBER_CREDIT', 'MANUAL_EFT', 'PAY_ON_COLLECTION', 'FUTURE_GATEWAY'],
  POS: ['CASH', 'CARD_TERMINAL', 'EFT_INSTANT', 'MEMBER_CREDIT'],
} as const;

/** Is a live online card gateway wired up yet? */
export function isGatewayLive(): boolean {
  return process.env.NEXT_PUBLIC_CARTEL_GATEWAY_ENABLED === 'true';
}
