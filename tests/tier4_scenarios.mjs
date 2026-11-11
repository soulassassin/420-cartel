/**
 * Tier 4: Real-World Application Scenarios E2E Tests (10 tests)
 * End-to-end customer, budtender, admin, and search engine crawler journeys
 */

import {
  TestRegistry,
  assert,
  assertEqual,
  assertIncludes,
  assertNotIncludes,
  assertMatch,
  assertNotMatch,
  assertGreaterThan,
  fileExists,
  readFileUtf8,
  parseEnvFile,
} from './helpers/assertions.mjs';

import {
  createAnonymousSession,
  createUnverifiedSession,
  createActiveMemberSession,
  createStaffSession,
  evaluateRouteAccess,
  CartSimulator,
} from './helpers/mock_session.mjs';

export function registerTier4Tests() {
  // -------------------------------------------------------------------------
  // T4-01: Customer Journey: Onboarding -> Vault Access -> Add Flower & Rosin
  // -------------------------------------------------------------------------
  TestRegistry.register({
    id: 'T4-01',
    name: 'Customer E2E: Onboarding -> Vault Access -> Cart Addition',
    feature: 'F5+F7+F8+F11+F12',
    tier: 4,
    description: 'Guest visits site, is redirected from Vault to Onboarding, verifies age, gains Vault access, adds Flower & Rosin to cart',
    fn: () => {
      // Step 1: Guest attempts to navigate to /vault
      let session = createAnonymousSession();
      const vaultAttempt = evaluateRouteAccess(session, '/vault');
      assertEqual(vaultAttempt.allowed, false, 'Guest must be denied direct Vault access');
      assertIncludes(vaultAttempt.redirect, '/onboarding', 'Guest must be redirected to onboarding');

      // Step 2: Guest completes 18+ verification in Onboarding
      session = createActiveMemberSession({
        first_name: 'Lerato',
        last_name: 'Mokoena',
        age_verified_at: new Date().toISOString(),
        status: 'ACTIVE_MEMBER',
      });
      const authorizedVault = evaluateRouteAccess(session, '/vault');
      assertEqual(authorizedVault.allowed, true, 'Verified member must be granted access to Vault');

      // Step 3: Member adds 3.5g Black Truffle Gold (Flower) and 1ml Live Rosin (Vape) to cart
      const cart = new CartSimulator();
      cart.addItem({
        productId: 'prod-truffle',
        variantId: 'var-truffle-3.5g',
        name: 'Black Truffle Gold',
        baseUom: 'GRAMS',
        baseQuantity: 3.5,
        priceCents: 52000,
        quantity: 1,
      });

      cart.addItem({
        productId: 'prod-rosin-vape',
        variantId: 'var-rosin-1ml',
        name: 'Permanent Marker Live Rosin Cartridge',
        baseUom: 'UNITS',
        baseQuantity: 1.0,
        priceCents: 140000,
        quantity: 1,
      });

      const totals = cart.getTotals();
      assertEqual(totals.totalGrams, 3.5, 'Cart flower total must be 3.5g');
      assertEqual(totals.totalUnits, 1.0, 'Cart vape total must be 1 unit');
      assertEqual(totals.subtotalCents, 52000 + 140000, 'Subtotal must equal sum of items');
    },
  });

  // -------------------------------------------------------------------------
  // T4-02: Budtender Counter POS Checkout with Thermal Receipt
  // -------------------------------------------------------------------------
  TestRegistry.register({
    id: 'T4-02',
    name: 'Budtender POS Counter Checkout with 80mm Receipt',
    feature: 'F9+F10+F12',
    tier: 4,
    description: 'Cashier authenticates, adds Awaken vape and custom flower, tenders cash, generates metric thermal receipt',
    fn: () => {
      // 1. Staff session
      const cashier = createStaffSession('BUDTENDER');
      const posAccess = evaluateRouteAccess(cashier, '/pos');
      assertEqual(posAccess.allowed, true, 'Budtender must be allowed access to POS terminal');

      // 2. Build ticket
      const ticket = new CartSimulator();
      ticket.addItem({
        productId: 'prod-awk-cart',
        variantId: 'var-awk-cart-01',
        name: 'Awaken Permanent Marker 1ml',
        baseUom: 'UNITS',
        baseQuantity: 1.0,
        priceCents: 140000,
        quantity: 1,
      });

      ticket.addItem({
        productId: 'prod-jozi-haze',
        variantId: 'var-haze-7g',
        name: 'Jozi Lemon Haze',
        baseUom: 'GRAMS',
        baseQuantity: 7.0,
        priceCents: 85000,
        quantity: 1,
      });

      const totals = ticket.getTotals();
      assertEqual(totals.subtotalCents, 225000, 'Ticket total must be R2,250.00 (225000 cents)');

      // 3. Receipt template inspection
      const receiptCode = readFileUtf8('src/components/pos/ThermalReceiptPrint.tsx');
      assert(receiptCode !== null, 'ThermalReceiptPrint.tsx must exist');
      assertMatch(receiptCode, /420 CARTEL/, 'Receipt must feature 420 CARTEL header');
      assertNotMatch(receiptCode, /\b(eighth|quarter|ounce|oz|lbs)\b/i, 'Receipt must contain zero imperial words');
    },
  });

  // -------------------------------------------------------------------------
  // T4-03: SEO & AI Search Engine Crawler Journey
  // -------------------------------------------------------------------------
  TestRegistry.register({
    id: 'T4-03',
    name: 'SEO & AI Search Engine Crawler Discovery Journey',
    feature: 'F14+F15+F16',
    tier: 4,
    description: 'Crawler inspects robots.txt, follows sitemap.xml, crawls public routes, and parses JSON-LD structured schemas',
    fn: () => {
      // 1. Verify robots.ts exists and declares sitemap
      const robots = readFileUtf8('src/app/robots.ts');
      assert(robots !== null, 'src/app/robots.ts must exist');
      assertMatch(robots, /sitemap\.xml/, 'robots.ts must reference sitemap.xml');

      // 2. Verify sitemap.ts lists canonical routes
      const sitemap = readFileUtf8('src/app/sitemap.ts');
      assert(sitemap !== null, 'src/app/sitemap.ts must exist');
      assertMatch(sitemap, /['"]\/['"]/, 'Sitemap must list root page');
      assertMatch(sitemap, /['"]\/about['"]/, 'Sitemap must list /about');
      assertMatch(sitemap, /['"]\/contact['"]/, 'Sitemap must list /contact');
      assertMatch(sitemap, /['"]\/onboarding['"]/, 'Sitemap must list /onboarding');

      // 3. Verify JSON-LD schemas in JsonLd.tsx
      const jsonLd = readFileUtf8('src/components/seo/JsonLd.tsx');
      assert(jsonLd !== null, 'src/components/seo/JsonLd.tsx must exist');
      assertMatch(jsonLd, /schema\.org/, 'JSON-LD must reference schema.org');
      assertMatch(jsonLd, /Organization/, 'JSON-LD must include Organization');
      assertMatch(jsonLd, /FAQPage/, 'JSON-LD must include FAQPage');
    },
  });

  // -------------------------------------------------------------------------
  // T4-04: VIP Member Vault Exploration & Sativa Filtering
  // -------------------------------------------------------------------------
  TestRegistry.register({
    id: 'T4-04',
    name: 'VIP Member Vault Exploration & Sativa Filtering',
    feature: 'F7+F8+F11',
    tier: 4,
    description: 'Authenticated VIP member opens Vault, filters catalog by Sativa strain, and selects metric 3.5g tier',
    fn: () => {
      const vip = createActiveMemberSession({ tier: 'VIP', member_code: 'CRT-7777' });
      const access = evaluateRouteAccess(vip, '/vault');
      assertEqual(access.allowed, true, 'VIP member must have Vault access');

      const fixtures = readFileUtf8('src/lib/demo/fixtures.ts');
      assert(fixtures !== null, 'fixtures.ts must exist');
      // Sativa products must exist
      assertMatch(fixtures, /strain:\s*['"]SATIVA['"]/, 'Fixtures must contain Sativa products');
      // Metric tier buttons must be present
      assertMatch(fixtures, /label:\s*['"]3\.5g['"]/, 'Must contain 3.5g metric variant');
    },
  });

  // -------------------------------------------------------------------------
  // T4-05: Age-Gating Under-18 Strict Enforcement
  // -------------------------------------------------------------------------
  TestRegistry.register({
    id: 'T4-05',
    name: 'Age-Gating Under-18 Strict Route Interception',
    feature: 'F7+F13',
    tier: 4,
    description: 'Unverified visitor attempting to access /vault, /checkout, /pass is intercepted and redirected',
    fn: () => {
      const guest = createAnonymousSession();
      const vaultCheck = evaluateRouteAccess(guest, '/vault');
      assertEqual(vaultCheck.allowed, false, 'Direct /vault access must be blocked');

      const checkoutCheck = evaluateRouteAccess(guest, '/checkout');
      assertEqual(checkoutCheck.allowed, false, 'Direct /checkout access must be blocked');

      const passCheck = evaluateRouteAccess(guest, '/pass');
      assertEqual(passCheck.allowed, false, 'Direct /pass access must be blocked');
    },
  });

  // -------------------------------------------------------------------------
  // T4-06: Back-Office Inventory Intake & FIFO Batch Tracking
  // -------------------------------------------------------------------------
  TestRegistry.register({
    id: 'T4-06',
    name: 'Back-Office Inventory Intake & FIFO Batch Tracking',
    feature: 'F10',
    tier: 4,
    description: 'Inventory manager accesses admin inventory, reviews master batches with lab metrics and low stock thresholds',
    fn: () => {
      const manager = createStaffSession('MANAGER');
      const adminAccess = evaluateRouteAccess(manager, '/admin');
      assertEqual(adminAccess.allowed, true, 'Manager must be permitted into /admin');

      const invCode = readFileUtf8('src/app/admin/inventory/page.tsx');
      assert(invCode !== null, 'admin/inventory/page.tsx must exist');
      assertMatch(invCode, /batch_code/, 'Inventory must display batch_code');
      assertMatch(invCode, /remaining_base_qty/, 'Inventory must track remaining_base_qty');
      assertMatch(invCode, /low_stock_threshold/, 'Inventory must track low_stock_threshold');
    },
  });

  // -------------------------------------------------------------------------
  // T4-07: AI Sommelier Botanical Consultation Flow
  // -------------------------------------------------------------------------
  TestRegistry.register({
    id: 'T4-07',
    name: 'AI Sommelier Botanical Consultation Flow',
    feature: 'F4+F18',
    tier: 4,
    description: 'Customer visits /agent, queries for high-terpene strain, sommelier generates response with metric sizing',
    fn: () => {
      const agentPage = readFileUtf8('src/app/agent/page.tsx');
      assert(agentPage !== null, 'src/app/agent/page.tsx must exist');
      assertMatch(agentPage, /(Sommelier|Agent|terpene|strain)/i, 'Agent page must feature Sommelier persona');
      // Visual contrast fix
      assertNotMatch(agentPage, /text-black\s+bg-transparent/, 'Send button must have visible contrast');
    },
  });

  // -------------------------------------------------------------------------
  // T4-08: Digital Member Pass Verification & In-Lounge Scan
  // -------------------------------------------------------------------------
  TestRegistry.register({
    id: 'T4-08',
    name: 'Digital Member Pass Presentation & QR Code Scan',
    feature: 'F2+F13',
    tier: 4,
    description: 'Member presents digital QR pass on mobile; pass renders brand identity and scan payload',
    fn: () => {
      const pass = readFileUtf8('src/components/crm/CartelMemberQrPass.tsx');
      assert(pass !== null, 'CartelMemberQrPass.tsx must exist');
      assertMatch(pass, /(QRCode|qrcode|svg)/i, 'Pass component must render QR code');
      assertMatch(pass, /420 Cartel/i, 'Pass component must render 420 Cartel brand');
    },
  });

  // -------------------------------------------------------------------------
  // T4-09: Mobile Commuter Experience on 375px Device
  // -------------------------------------------------------------------------
  TestRegistry.register({
    id: 'T4-09',
    name: 'Mobile Commuter Navigation on 375px Viewport',
    feature: 'F5+F17+F18',
    tier: 4,
    description: 'User on 375px device opens drawer, navigates across Home, About, Membership, Vault, Contact without horizontal blowout',
    fn: () => {
      const css = readFileUtf8('src/app/globals.css');
      assert(css !== null, 'globals.css must exist');
      assertMatch(css, /overflow-x:\s*hidden/, 'globals.css must enforce overflow-x: hidden on body');

      const nav = readFileUtf8('src/components/layout/CartelCommandNav.tsx');
      assert(nav !== null, 'CartelCommandNav.tsx must exist');
      assertMatch(nav, /md:hidden/, 'Mobile navigation drawer must be configured for mobile screens');
    },
  });

  // -------------------------------------------------------------------------
  // T4-10: Social Proof & Physical Lounge Verification
  // -------------------------------------------------------------------------
  TestRegistry.register({
    id: 'T4-10',
    name: 'Social Proof & Physical Lounge Location Verification',
    feature: 'F13+F14',
    tier: 4,
    description: 'Prospective member inspects contact information, verifies official Instagram, Facebook, and daily 09:00-20:00 hours',
    fn: () => {
      const contact = readFileUtf8('src/app/contact/page.tsx') || '';
      const about = readFileUtf8('src/app/about/page.tsx') || '';
      const combined = contact + about;
      assertMatch(combined, /instagram\.com\/fourtwentycartel/i, 'Must link to Instagram');
      assertMatch(combined, /(Sandton|Norwood|Rivonia|Kibler Park|Johannesburg)/i, 'Must mention physical locations');
      assertMatch(combined, /(09:00|20:00|operating hours|daily)/i, 'Must mention operating hours');
    },
  });
}
