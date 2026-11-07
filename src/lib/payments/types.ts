/**
 * Payment abstraction layer.
 *
 * Checkout and the POS tender drawer never branch on a payment method. They ask
 * the registry which adapters apply to the current context, render what those
 * adapters declare, and hand the adapter's `ProcessOrderPaymentInput` straight
 * to `process_cartel_order`.
 *
 * Adding a live gateway later means writing one adapter and registering it —
 * no change to checkout, the POS, or the order function.
 */

import type {
  FulfilmentType,
  OrderChannel,
  PaymentMethod,
  ProcessOrderPaymentInput,
} from '@/types/database';

export interface PaymentContext {
  channel: OrderChannel;
  fulfilment: FulfilmentType;
  /** Order total in cents, after discounts and delivery fees. */
  amountCents: number;
  branchId: string;
  memberId: string | null;
  /** Spendable member account credit, in cents. */
  memberCreditCents: number;
  /** Set when a cashier is operating a till; null online. */
  staffId: string | null;
}

/** What the UI must show the payer after the order is written. */
export type PaymentInstruction =
  | { kind: 'NONE' }
  | { kind: 'CASH_DRAWER'; changeDueCents: number }
  | { kind: 'TERMINAL_PROMPT'; prompt: string }
  | {
      kind: 'BANK_TRANSFER';
      accountName: string;
      bank: string;
      accountNumber: string;
      branchCode: string;
      reference: string;
      note: string;
    }
  | { kind: 'ON_COLLECTION'; note: string }
  | { kind: 'REDIRECT'; url: string }
  | { kind: 'UNAVAILABLE'; reason: string };

export interface PaymentTenderInput {
  /** Amount this adapter should settle, in cents. */
  amountCents: number;
  /** Cash only: what the customer handed over. */
  tenderedCents?: number;
  /** Operator-supplied reference (card slip number, EFT reference). */
  reference?: string;
}

export interface PreparedPayment {
  /** Passed verbatim into the `payments` array of `process_cartel_order`. */
  payment: ProcessOrderPaymentInput;
  instruction: PaymentInstruction;
  /** False when the order should land in AWAITING_PAYMENT. */
  settlesImmediately: boolean;
}

export interface PaymentAdapter {
  readonly method: PaymentMethod;
  readonly label: string;
  readonly description: string;
  /** Lucide icon name, resolved by the UI layer. */
  readonly icon: string;
  /** True when funds are considered captured the moment the order is written. */
  readonly settlesImmediately: boolean;
  /** True when the adapter needs a human to type a reference or amount. */
  readonly requiresOperatorInput: boolean;
  /** Can this adapter settle the whole remaining balance by itself? */
  readonly supportsSplit: boolean;

  /** Is this method offerable in the given context? */
  isAvailable(context: PaymentContext): { available: true } | { available: false; reason: string };

  /** Highest amount this adapter may take in this context, in cents. */
  maxAmountCents(context: PaymentContext): number;

  /** Validate operator input and build the payment row. */
  prepare(
    context: PaymentContext,
    input: PaymentTenderInput,
  ): { ok: true; prepared: PreparedPayment } | { ok: false; error: string };
}

export class PaymentAdapterError extends Error {
  public readonly method: PaymentMethod;

  constructor(method: PaymentMethod, message: string) {
    super(message);
    this.name = 'PaymentAdapterError';
    this.method = method;
  }
}
