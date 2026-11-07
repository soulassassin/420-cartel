import type { PaymentMethod, ProcessOrderPaymentInput } from '@/types/database';
import {
  cardTerminalAdapter,
  cashAdapter,
  eftInstantAdapter,
  futureGatewayAdapter,
  manualEftAdapter,
  memberCreditAdapter,
  payOnCollectionAdapter,
} from './adapters';
import {
  PaymentAdapterError,
  type PaymentAdapter,
  type PaymentContext,
  type PaymentInstruction,
  type PaymentTenderInput,
} from './types';

/** Registration order is display order in the tender drawer and at checkout. */
const ADAPTERS: readonly PaymentAdapter[] = [
  cashAdapter,
  cardTerminalAdapter,
  memberCreditAdapter,
  eftInstantAdapter,
  manualEftAdapter,
  payOnCollectionAdapter,
  futureGatewayAdapter,
];

const BY_METHOD = new Map<PaymentMethod, PaymentAdapter>(
  ADAPTERS.map((adapter) => [adapter.method, adapter]),
);

export function getPaymentAdapter(method: PaymentMethod): PaymentAdapter {
  const adapter = BY_METHOD.get(method);
  if (!adapter) {
    throw new PaymentAdapterError(method, `No payment adapter registered for ${method}.`);
  }
  return adapter;
}

export interface PaymentOption {
  adapter: PaymentAdapter;
  available: boolean;
  reason: string | null;
  maxAmountCents: number;
}

/** Every registered method with its availability in this context. */
export function listPaymentOptions(context: PaymentContext): PaymentOption[] {
  return ADAPTERS.map((adapter) => {
    const verdict = adapter.isAvailable(context);
    return {
      adapter,
      available: verdict.available,
      reason: verdict.available ? null : verdict.reason,
      maxAmountCents: verdict.available ? adapter.maxAmountCents(context) : 0,
    };
  });
}

export function availablePaymentOptions(context: PaymentContext): PaymentOption[] {
  return listPaymentOptions(context).filter((option) => option.available);
}

export interface TenderLine {
  method: PaymentMethod;
  input: PaymentTenderInput;
}

export interface BuiltTender {
  payments: ProcessOrderPaymentInput[];
  instructions: { method: PaymentMethod; instruction: PaymentInstruction }[];
  capturedCents: number;
  pendingCents: number;
  outstandingCents: number;
  /** True when captured tender covers the whole total. */
  fullySettled: boolean;
}

/**
 * Turn a split tender into the `payments` array for `process_cartel_order`.
 *
 * Each line is validated against the balance still outstanding at that point,
 * so a split of cash + credit can never overshoot the total. Throws
 * PaymentAdapterError with a user-safe message on the first invalid line.
 */
export function buildTender(context: PaymentContext, lines: readonly TenderLine[]): BuiltTender {
  const payments: ProcessOrderPaymentInput[] = [];
  const instructions: { method: PaymentMethod; instruction: PaymentInstruction }[] = [];

  let captured = 0;
  let pending = 0;

  for (const line of lines) {
    const adapter = getPaymentAdapter(line.method);
    const remaining = context.amountCents - captured - pending;

    if (remaining <= 0) {
      throw new PaymentAdapterError(
        line.method,
        'The order is already fully tendered — remove a payment line first.',
      );
    }

    const verdict = adapter.isAvailable(context);
    if (!verdict.available) {
      throw new PaymentAdapterError(line.method, verdict.reason);
    }

    // Each adapter sees only the balance left to settle.
    const scoped: PaymentContext = { ...context, amountCents: remaining };
    const result = adapter.prepare(scoped, line.input);
    if (!result.ok) {
      throw new PaymentAdapterError(line.method, result.error);
    }

    payments.push(result.prepared.payment);
    instructions.push({ method: line.method, instruction: result.prepared.instruction });

    if (result.prepared.settlesImmediately) {
      captured += result.prepared.payment.amount_cents;
    } else {
      pending += result.prepared.payment.amount_cents;
    }
  }

  return {
    payments,
    instructions,
    capturedCents: captured,
    pendingCents: pending,
    outstandingCents: Math.max(0, context.amountCents - captured),
    fullySettled: captured >= context.amountCents,
  };
}

/**
 * Suggested default tender for a context: member credit first where it covers
 * the lot, otherwise the channel's primary method.
 */
export function suggestDefaultMethod(context: PaymentContext): PaymentMethod | null {
  const options = availablePaymentOptions(context);
  if (options.length === 0) return null;

  const credit = options.find((option) => option.adapter.method === 'MEMBER_CREDIT');
  if (credit && credit.maxAmountCents >= context.amountCents) return 'MEMBER_CREDIT';

  const preference: PaymentMethod[] =
    context.channel === 'POS'
      ? ['CASH', 'CARD_TERMINAL', 'EFT_INSTANT', 'MEMBER_CREDIT']
      : ['FUTURE_GATEWAY', 'MANUAL_EFT', 'PAY_ON_COLLECTION', 'MEMBER_CREDIT'];

  for (const method of preference) {
    if (options.some((option) => option.adapter.method === method)) return method;
  }
  const first = options[0];
  return first ? first.adapter.method : null;
}

export { PaymentAdapterError };
export type { PaymentAdapter, PaymentContext, PaymentInstruction, PaymentTenderInput };
