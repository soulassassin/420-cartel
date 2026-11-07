import { formatCents } from '@/lib/money';
import type {
  PaymentAdapter,
  PaymentContext,
  PaymentTenderInput,
  PreparedPayment,
} from './types';

/** Banking details for manual EFT, read from env so they are not hard-coded. */
function bankDetails() {
  return {
    accountName: process.env.CARTEL_BANK_ACCOUNT_NAME ?? '420 Cartel Collective',
    bank: process.env.CARTEL_BANK_NAME ?? 'FNB',
    accountNumber: process.env.CARTEL_BANK_ACCOUNT_NUMBER ?? 'Set CARTEL_BANK_ACCOUNT_NUMBER',
    branchCode: process.env.CARTEL_BANK_BRANCH_CODE ?? '250655',
  };
}

function ok(prepared: PreparedPayment): { ok: true; prepared: PreparedPayment } {
  return { ok: true, prepared };
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

function requirePositive(
  input: PaymentTenderInput,
  context: PaymentContext,
): string | null {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    return 'Enter an amount greater than zero.';
  }
  if (input.amountCents > context.amountCents) {
    return `That is more than the ${formatCents(context.amountCents)} outstanding.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// CASH — in-store only, settles at the drawer, computes change.
// ---------------------------------------------------------------------------
export const cashAdapter: PaymentAdapter = {
  method: 'CASH',
  label: 'Cash',
  description: 'Settled in the drawer. Change calculated automatically.',
  icon: 'Banknote',
  settlesImmediately: true,
  requiresOperatorInput: true,
  supportsSplit: true,

  isAvailable(context) {
    if (context.channel !== 'POS') {
      return { available: false, reason: 'Cash is accepted in store only.' };
    }
    return { available: true };
  },

  maxAmountCents(context) {
    return context.amountCents;
  },

  prepare(context, input) {
    const problem = requirePositive(input, context);
    if (problem) return fail(problem);

    const tendered = input.tenderedCents ?? input.amountCents;
    if (tendered < input.amountCents) {
      return fail(
        `Tendered ${formatCents(tendered)} is short of ${formatCents(input.amountCents)}.`,
      );
    }

    return ok({
      payment: {
        method: 'CASH',
        amount_cents: input.amountCents,
        tendered_cents: tendered,
        provider: 'INTERNAL',
      },
      instruction: { kind: 'CASH_DRAWER', changeDueCents: tendered - input.amountCents },
      settlesImmediately: true,
    });
  },
};

// ---------------------------------------------------------------------------
// CARD_TERMINAL — physical speedpoint beside the till.
// ---------------------------------------------------------------------------
export const cardTerminalAdapter: PaymentAdapter = {
  method: 'CARD_TERMINAL',
  label: 'Card Terminal',
  description: 'Tap or insert on the in-store speedpoint, then capture the slip number.',
  icon: 'CreditCard',
  settlesImmediately: true,
  requiresOperatorInput: true,
  supportsSplit: true,

  isAvailable(context) {
    if (context.channel !== 'POS') {
      return { available: false, reason: 'The card terminal is in store only.' };
    }
    return { available: true };
  },

  maxAmountCents(context) {
    return context.amountCents;
  },

  prepare(context, input) {
    const problem = requirePositive(input, context);
    if (problem) return fail(problem);

    const reference = input.reference?.trim();
    if (!reference) {
      return fail('Capture the terminal slip or approval number.');
    }

    return ok({
      payment: {
        method: 'CARD_TERMINAL',
        amount_cents: input.amountCents,
        provider: 'IN_STORE_TERMINAL',
        provider_ref: reference,
      },
      instruction: {
        kind: 'TERMINAL_PROMPT',
        prompt: `Confirm ${formatCents(input.amountCents)} approved on the terminal.`,
      },
      settlesImmediately: true,
    });
  },
};

// ---------------------------------------------------------------------------
// EFT_INSTANT — instant-verification EFT confirmed at the till.
// ---------------------------------------------------------------------------
export const eftInstantAdapter: PaymentAdapter = {
  method: 'EFT_INSTANT',
  label: 'Instant EFT',
  description: 'Member pays live and the cashier confirms the instant notification.',
  icon: 'Zap',
  settlesImmediately: true,
  requiresOperatorInput: true,
  supportsSplit: true,

  isAvailable(context) {
    if (context.channel !== 'POS') {
      return {
        available: false,
        reason: 'Online orders use Manual EFT so the transfer can clear first.',
      };
    }
    return { available: true };
  },

  maxAmountCents(context) {
    return context.amountCents;
  },

  prepare(context, input) {
    const problem = requirePositive(input, context);
    if (problem) return fail(problem);

    const reference = input.reference?.trim();
    if (!reference) {
      return fail('Capture the bank notification reference.');
    }

    return ok({
      payment: {
        method: 'EFT_INSTANT',
        amount_cents: input.amountCents,
        provider: 'INSTANT_EFT',
        provider_ref: reference,
      },
      instruction: { kind: 'NONE' },
      settlesImmediately: true,
    });
  },
};

// ---------------------------------------------------------------------------
// MANUAL_EFT — online default. Order parks in AWAITING_PAYMENT.
// ---------------------------------------------------------------------------
export const manualEftAdapter: PaymentAdapter = {
  method: 'MANUAL_EFT',
  label: 'EFT / Bank Transfer',
  description: 'Transfer using your order reference. Released once the funds reflect.',
  icon: 'Landmark',
  settlesImmediately: false,
  requiresOperatorInput: false,
  supportsSplit: false,

  isAvailable() {
    return { available: true };
  },

  maxAmountCents(context) {
    return context.amountCents;
  },

  prepare(context, input) {
    const problem = requirePositive(input, context);
    if (problem) return fail(problem);

    if (input.amountCents !== context.amountCents) {
      return fail('A bank transfer must cover the full outstanding balance.');
    }

    const details = bankDetails();
    const reference = input.reference?.trim() ?? 'ORDER_NUMBER';

    return ok({
      payment: {
        method: 'MANUAL_EFT',
        amount_cents: input.amountCents,
        provider: 'MANUAL_BANK_TRANSFER',
      },
      instruction: {
        kind: 'BANK_TRANSFER',
        ...details,
        reference,
        note: 'Your order is held until the transfer reflects. Use the reference exactly as shown.',
      },
      settlesImmediately: false,
    });
  },
};

// ---------------------------------------------------------------------------
// MEMBER_CREDIT — spends the member's account balance.
// ---------------------------------------------------------------------------
export const memberCreditAdapter: PaymentAdapter = {
  method: 'MEMBER_CREDIT',
  label: 'Member Credit',
  description: 'Draw against the account balance on the Cartel profile.',
  icon: 'Wallet',
  settlesImmediately: true,
  requiresOperatorInput: false,
  supportsSplit: true,

  isAvailable(context) {
    if (!context.memberId) {
      return { available: false, reason: 'Link a member profile to use account credit.' };
    }
    if (context.memberCreditCents <= 0) {
      return { available: false, reason: 'No account credit available.' };
    }
    return { available: true };
  },

  maxAmountCents(context) {
    return Math.min(context.amountCents, Math.max(0, context.memberCreditCents));
  },

  prepare(context, input) {
    const problem = requirePositive(input, context);
    if (problem) return fail(problem);

    if (!context.memberId) {
      return fail('Link a member profile to use account credit.');
    }
    if (input.amountCents > context.memberCreditCents) {
      return fail(
        `Available credit is ${formatCents(context.memberCreditCents)}.`,
      );
    }

    return ok({
      payment: {
        method: 'MEMBER_CREDIT',
        amount_cents: input.amountCents,
        provider: 'INTERNAL',
      },
      instruction: { kind: 'NONE' },
      settlesImmediately: true,
    });
  },
};

// ---------------------------------------------------------------------------
// PAY_ON_COLLECTION — pickup only, settled at the counter.
// ---------------------------------------------------------------------------
export const payOnCollectionAdapter: PaymentAdapter = {
  method: 'PAY_ON_COLLECTION',
  label: 'Pay on Collection',
  description: 'Reserve now, settle at the counter when you collect.',
  icon: 'Store',
  settlesImmediately: false,
  requiresOperatorInput: false,
  supportsSplit: false,

  isAvailable(context) {
    if (context.fulfilment !== 'PICKUP') {
      return { available: false, reason: 'Available on in-store collection orders only.' };
    }
    return { available: true };
  },

  maxAmountCents(context) {
    return context.amountCents;
  },

  prepare(context, input) {
    const problem = requirePositive(input, context);
    if (problem) return fail(problem);

    if (input.amountCents !== context.amountCents) {
      return fail('Pay on collection covers the full order.');
    }

    return ok({
      payment: {
        method: 'PAY_ON_COLLECTION',
        amount_cents: input.amountCents,
        provider: 'INTERNAL',
      },
      instruction: {
        kind: 'ON_COLLECTION',
        note: 'Bring your Cartel pass. Stock is held for your collection slot.',
      },
      settlesImmediately: false,
    });
  },
};

// ---------------------------------------------------------------------------
// FUTURE_GATEWAY — the seam a live gateway drops into.
//
// Wiring one up means: set CARTEL_GATEWAY_ENABLED=true, implement the redirect
// in `prepare`, and handle the provider webhook by flipping the payment row to
// CAPTURED. Nothing in checkout or the POS changes.
// ---------------------------------------------------------------------------
export const futureGatewayAdapter: PaymentAdapter = {
  method: 'FUTURE_GATEWAY',
  label: 'Card / Instant Pay',
  description: 'Pay by card or instant transfer through our payment partner.',
  icon: 'Globe',
  settlesImmediately: false,
  requiresOperatorInput: false,
  supportsSplit: false,

  isAvailable(context) {
    if (process.env.NEXT_PUBLIC_CARTEL_GATEWAY_ENABLED !== 'true') {
      return { available: false, reason: 'Online card payments are not live yet.' };
    }
    if (context.channel !== 'ONLINE') {
      return { available: false, reason: 'Use the in-store terminal at the till.' };
    }
    return { available: true };
  },

  maxAmountCents(context) {
    return context.amountCents;
  },

  prepare(context, input) {
    const problem = requirePositive(input, context);
    if (problem) return fail(problem);

    if (process.env.NEXT_PUBLIC_CARTEL_GATEWAY_ENABLED !== 'true') {
      return fail('Online card payments are not live yet. Choose EFT or collection.');
    }

    // A live adapter creates the provider checkout session here and returns its
    // redirect URL. Until a provider is chosen the order is written as pending
    // so nothing is ever recorded as paid without a real capture.
    return ok({
      payment: {
        method: 'FUTURE_GATEWAY',
        amount_cents: input.amountCents,
        provider: process.env.NEXT_PUBLIC_CARTEL_GATEWAY_NAME ?? 'PENDING_PROVIDER',
      },
      instruction: {
        kind: 'UNAVAILABLE',
        reason: 'No payment provider is configured yet.',
      },
      settlesImmediately: false,
    });
  },
};
