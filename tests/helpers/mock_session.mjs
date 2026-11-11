/**
 * Mock Session & Cart Simulation Helpers
 * Simulates client session store, access control, and transaction math
 */

export function createAnonymousSession() {
  return {
    member: null,
    staff: null,
    branchId: 'b1000000-0000-4000-8000-000000000001',
    verified: false,
    isAuthenticated: false,
  };
}

export function createUnverifiedSession(overrides = {}) {
  return {
    member: {
      id: 'd1000000-0000-4000-8000-000000000003',
      member_code: 'CRT-PENDING',
      status: 'PENDING_KYC',
      age_verified_at: null,
      first_name: 'Pending',
      last_name: 'Applicant',
      ...overrides,
    },
    staff: null,
    branchId: 'b1000000-0000-4000-8000-000000000001',
    verified: false,
    isAuthenticated: true,
  };
}

export function createActiveMemberSession(overrides = {}) {
  return {
    member: {
      id: 'd1000000-0000-4000-8000-000000000001',
      member_code: 'CRT-0420',
      status: 'ACTIVE_MEMBER',
      age_verified_at: '2026-11-01T08:00:00Z',
      tier: 'CONNOISSEUR',
      first_name: 'Zack',
      last_name: 'Cartel',
      ...overrides,
    },
    staff: null,
    branchId: 'b1000000-0000-4000-8000-000000000001',
    verified: true,
    isAuthenticated: true,
  };
}

export function createSuspendedSession(overrides = {}) {
  return {
    member: {
      id: 'd1000000-0000-4000-8000-000000000005',
      member_code: 'CRT-FREEZE',
      status: 'SUSPENDED',
      age_verified_at: '2026-10-01T08:00:00Z',
      suspended_reason: 'Chargeback dispute unresolved',
      ...overrides,
    },
    staff: null,
    branchId: 'b1000000-0000-4000-8000-000000000001',
    verified: false,
    isAuthenticated: true,
  };
}

export function createStaffSession(role = 'BUDTENDER') {
  return {
    member: null,
    staff: {
      id: 'c1000000-0000-4000-8000-000000000002',
      staff_code: 'STF-02',
      role,
      is_active: true,
    },
    branchId: 'b1000000-0000-4000-8000-000000000001',
    verified: true,
    isAuthenticated: true,
  };
}

/**
 * Access control resolver matching Next.js middleware and client guard
 */
export function evaluateRouteAccess(session, targetRoute) {
  const norm = targetRoute.split('?')[0];
  const query = targetRoute.includes('?') ? targetRoute.slice(targetRoute.indexOf('?')) : '';

  // Public routes
  if (['/', '/about', '/contact', '/login', '/onboarding', '/agent'].includes(norm)) {
    return { allowed: true, redirect: null };
  }

  // Member-gated routes
  if (['/vault', '/shop'].includes(norm)) {
    if (session.member && session.member.age_verified_at && session.member.status !== 'SUSPENDED') {
      return { allowed: true, redirect: null };
    }
    return { allowed: false, redirect: `/onboarding?next=${encodeURIComponent(targetRoute)}` };
  }

  if (['/account', '/pass', '/checkout'].includes(norm)) {
    if (session.isAuthenticated && session.member) {
      return { allowed: true, redirect: null };
    }
    return { allowed: false, redirect: `/login?next=${encodeURIComponent(targetRoute)}` };
  }

  // Staff routes
  if (norm.startsWith('/pos') || norm.startsWith('/admin')) {
    if (session.staff && session.staff.is_active) {
      return { allowed: true, redirect: null };
    }
    return { allowed: false, redirect: `/staff-login?next=${encodeURIComponent(targetRoute)}` };
  }

  return { allowed: true, redirect: null };
}

/**
 * Cart and stock headroom simulator
 */
export class CartSimulator {
  constructor() {
    this.items = [];
  }

  addItem(item) {
    // item: { productId, variantId, name, baseUom, baseQuantity, priceCents, quantity }
    const existing = this.items.find((i) => i.variantId === item.variantId);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      this.items.push({ ...item });
    }
  }

  getCommittedQty(productId) {
    return this.items
      .filter((i) => i.productId === productId)
      .reduce((sum, i) => sum + i.baseQuantity * i.quantity, 0);
  }

  getHeadroom(productStock, productId) {
    const committed = this.getCommittedQty(productId);
    return Math.max(0, productStock.remaining_base_qty - committed);
  }

  canFit(productStock, productId, requiredQty) {
    const headroom = this.getHeadroom(productStock, productId);
    return requiredQty <= headroom + 1e-9;
  }

  getTotals() {
    let subtotalCents = 0;
    let totalGrams = 0;
    let totalMl = 0;
    let totalUnits = 0;

    for (const item of this.items) {
      subtotalCents += item.priceCents * item.quantity;
      const totalBase = item.baseQuantity * item.quantity;
      if (item.baseUom === 'GRAMS') totalGrams += totalBase;
      else if (item.baseUom === 'MILLILITERS') totalMl += totalBase;
      else if (item.baseUom === 'UNITS') totalUnits += totalBase;
    }

    return {
      subtotalCents,
      totalGrams,
      totalMl,
      totalUnits,
      itemCount: this.items.reduce((sum, i) => sum + i.quantity, 0),
    };
  }

  clear() {
    this.items = [];
  }
}
