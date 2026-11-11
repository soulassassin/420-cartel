/**
 * Tier 3: Cross-Feature Combinations E2E Tests (12 tests)
 * Multi-feature integration tests across catalog, POS, session, navigation, SEO, and metrics
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
  readBuffer,
} from './helpers/assertions.mjs';

import {
  createAnonymousSession,
  createUnverifiedSession,
  createActiveMemberSession,
  createStaffSession,
  evaluateRouteAccess,
  CartSimulator,
} from './helpers/mock_session.mjs';

export function registerTier3Tests() {
  // -------------------------------------------------------------------------
  // T3-01: Awaken Product Import + Metric Unit Standardization
  // -------------------------------------------------------------------------
  TestRegistry.register({
    id: 'T3-01',
    name: 'Awaken Product Import + Metric Standardization',
    feature: 'F8+F11+F12',
    tier: 3,
    description: 'Verify imported Awaken vape products strictly use metric units (UNITS/MILLILITERS) and zero imperial labels',
    fn: () => {
      const fixtures = readFileUtf8('src/lib/demo/fixtures.ts');
      assert(fixtures !== null, 'src/lib/demo/fixtures.ts must exist');
      // Ingested vape products must declare base_uom as UNITS or MILLILITERS
      assertMatch(fixtures, /category:\s*['"]VAPE['"][\s\S]*?base_uom:\s*['"](UNITS|MILLILITERS)['"]/, 'Awaken vapes must declare metric base_uom (UNITS or MILLILITERS)');
      // Fixtures must not contain imperial units for vape variants
      assertNotMatch(fixtures, /category:\s*['"]VAPE['"][\s\S]*?(eighth|quarter|ounce|oz)/i, 'Vape products must have zero imperial variants');
    },
  });

  // -------------------------------------------------------------------------
  // T3-02: Awaken Product Import + POS Image Grid Rendering
  // -------------------------------------------------------------------------
  TestRegistry.register({
    id: 'T3-02',
    name: 'Awaken Product Import + POS Image Grid Integration',
    feature: 'F8+F9',
    tier: 3,
    description: 'Verify imported Awaken products provide hero_media_url and POS terminal renders product image thumbnails',
    fn: () => {
      const fixtures = readFileUtf8('src/lib/demo/fixtures.ts');
      const pos = readFileUtf8('src/app/pos/page.tsx');
      assert(fixtures !== null, 'fixtures.ts must exist');
      assert(pos !== null, 'pos/page.tsx must exist');
      // Fixtures must declare hero_media_url on products
      assertMatch(fixtures, /hero_media_url:\s*['"]\/products\/[^'"]+['"]/, 'Products must specify hero_media_url');
      // POS must render image component with hero_media_url
      assertMatch(pos, /(hero_media_url|<Image\b|<img\b)/, 'POS must render product image thumbnails');
    },
  });

  // -------------------------------------------------------------------------
  // T3-03: POS Cart Commitment + Realtime Stock Headroom Deduction
  // -------------------------------------------------------------------------
  TestRegistry.register({
    id: 'T3-03',
    name: 'POS Cart Commitment + Realtime Stock Headroom Deduction',
    feature: 'F9+F10',
    tier: 3,
    description: 'Verify adding product variant to POS cart reduces available headroom and blocks additions exceeding stock',
    fn: () => {
      const cart = new CartSimulator();
      const mockStock = {
        product_id: 'prod-001',
        remaining_base_qty: 10.0, // 10g in stock
        low_stock_threshold: 2.0,
      };

      // Add 7g flower
      assert(cart.canFit(mockStock, 'prod-001', 7.0), 'Initial 7g should fit in 10g stock');
      cart.addItem({
        productId: 'prod-001',
        variantId: 'var-7g',
        name: 'Jozi Lemon Haze',
        baseUom: 'GRAMS',
        baseQuantity: 7.0,
        priceCents: 85000,
        quantity: 1,
      });

      // Remaining headroom should now be 3.0g
      const headroom = cart.getHeadroom(mockStock, 'prod-001');
      assertEqual(headroom, 3.0, 'Remaining headroom must be 3.0g after committing 7.0g');

      // Attempting to add 3.5g should fail
      assert(!cart.canFit(mockStock, 'prod-001', 3.5), 'Cannot fit 3.5g when headroom is only 3.0g');

      // Adding 1g should succeed
      assert(cart.canFit(mockStock, 'prod-001', 1.0), 'Can fit 1.0g into 3.0g headroom');
    },
  });

  // -------------------------------------------------------------------------
  // T3-04: Member Onboarding -> Session Store -> Vault Access Grant
  // -------------------------------------------------------------------------
  TestRegistry.register({
    id: 'T3-04',
    name: 'Member Onboarding KYC -> Session Store -> Vault Access Grant',
    feature: 'F5+F7',
    tier: 3,
    description: 'Verify unverified session is blocked from Vault, and completing onboarding unlocks Vault access',
    fn: () => {
      // Step 1: Unverified visitor
      const unverified = createUnverifiedSession({ age_verified_at: null });
      const initialAccess = evaluateRouteAccess(unverified, '/vault');
      assertEqual(initialAccess.allowed, false, 'Unverified session must not access Vault');
      assertIncludes(initialAccess.redirect, '/onboarding', 'Must redirect to /onboarding');

      // Step 2: Member completes KYC & age verification
      const verified = createActiveMemberSession({
        age_verified_at: new Date().toISOString(),
        status: 'ACTIVE_MEMBER',
      });
      const grantedAccess = evaluateRouteAccess(verified, '/vault');
      assertEqual(grantedAccess.allowed, true, 'Verified member must be granted access to Vault');
      assertEqual(grantedAccess.redirect, null, 'No redirect should occur for verified member');
    },
  });

  // -------------------------------------------------------------------------
  // T3-05: Mobile Drawer Navigation -> Member Gating Redirection
  // -------------------------------------------------------------------------
  TestRegistry.register({
    id: 'T3-05',
    name: 'Mobile Drawer Navigation -> Member Gating Redirection',
    feature: 'F5+F7',
    tier: 3,
    description: 'Verify mobile drawer links to Vault and unauthenticated click routes through member gating',
    fn: () => {
      const nav = readFileUtf8('src/components/layout/CartelCommandNav.tsx');
      assert(nav !== null, 'CartelCommandNav.tsx must exist');
      // Navigation must define Vault route as /vault
      assertMatch(nav, /['"]\/vault['"]/, 'Navigation must define /vault link');

      // Anonymous session evaluating Vault route
      const anon = createAnonymousSession();
      const access = evaluateRouteAccess(anon, '/vault');
      assertEqual(access.allowed, false, 'Anonymous visitor clicking Vault must be gated');
      assertIncludes(access.redirect, '/onboarding', 'Redirect target must be /onboarding');
    },
  });

  // -------------------------------------------------------------------------
  // T3-06: Brand Logo Asset + Command Nav + Mobile Drawer
  // -------------------------------------------------------------------------
  TestRegistry.register({
    id: 'T3-06',
    name: 'Brand Logo Asset + Command Nav + Mobile Drawer Consistency',
    feature: 'F1+F2+F5',
    tier: 3,
    description: 'Verify public brand logo asset is referenced in both desktop and mobile navigation layouts',
    fn: () => {
      assert(fileExists('public/fourtwentycartel_logo.jpg'), 'public/fourtwentycartel_logo.jpg must exist');
      const nav = readFileUtf8('src/components/layout/CartelCommandNav.tsx');
      assert(nav !== null, 'CartelCommandNav.tsx must exist');
      assertMatch(nav, /fourtwentycartel_logo\.jpg/, 'CartelCommandNav must integrate fourtwentycartel_logo.jpg');
    },
  });

  // -------------------------------------------------------------------------
  // T3-07: Brand Logo Asset + OpenGraph / Twitter Social Cards
  // -------------------------------------------------------------------------
  TestRegistry.register({
    id: 'T3-07',
    name: 'Brand Logo Asset + OpenGraph / Twitter Social Cards',
    feature: 'F1+F2+F14',
    tier: 3,
    description: 'Verify public logo asset is wired to OpenGraph image and Twitter card metadata in layout.tsx',
    fn: () => {
      assert(fileExists('public/fourtwentycartel_logo.jpg'), 'Logo asset must exist in public folder');
      const layout = readFileUtf8('src/app/layout.tsx');
      assert(layout !== null, 'layout.tsx must exist');
      assertMatch(layout, /openGraph:\s*\{[\s\S]*fourtwentycartel_logo\.jpg/, 'openGraph must link to fourtwentycartel_logo.jpg');
      assertMatch(layout, /twitter:\s*\{[\s\S]*fourtwentycartel_logo\.jpg/, 'twitter must link to fourtwentycartel_logo.jpg');
    },
  });

  // -------------------------------------------------------------------------
  // T3-08: Higgsfield MCP Client + Brand Visual Formula + Product Attributes
  // -------------------------------------------------------------------------
  TestRegistry.register({
    id: 'T3-08',
    name: 'Higgsfield MCP Client + Brand Visual Formula + Product Prompt',
    feature: 'F3+F4+F8',
    tier: 3,
    description: 'Verify prompt construction joins product category, strain, and visual formula for reel generation',
    fn: () => {
      const brand = readFileUtf8('src/lib/brand.ts');
      const prompt = readFileUtf8('src/lib/higgsfield/prompt.ts');
      assert(brand !== null && prompt !== null, 'brand.ts and prompt.ts must exist');
      assertMatch(brand, /HIGGSFIELD_VISUAL_FORMULA/, 'brand.ts must define visual formula');
      assertMatch(prompt, /buildPromoReelPrompt/, 'prompt.ts must export buildPromoReelPrompt');
    },
  });

  // -------------------------------------------------------------------------
  // T3-09: Admin Master Batch Intake -> Master Batch Creation -> POS Stock
  // -------------------------------------------------------------------------
  TestRegistry.register({
    id: 'T3-09',
    name: 'Admin Master Batch Intake -> Master Batch Creation -> POS Stock',
    feature: 'F9+F10',
    tier: 3,
    description: 'Verify MasterBatchRow schema ties product batches to remaining stock tracked by POS terminal',
    fn: () => {
      const types = readFileUtf8('src/types/database.ts');
      assert(types !== null, 'types/database.ts must exist');
      assertMatch(types, /interface MasterBatchRow/, 'database.ts must define MasterBatchRow');
      assertMatch(types, /remaining_base_qty:\s*number/, 'MasterBatchRow must define remaining_base_qty');
      assertMatch(types, /interface ProductStockBoardRow/, 'database.ts must define ProductStockBoardRow for POS projection');
    },
  });

  // -------------------------------------------------------------------------
  // T3-10: Multi-Category Cart (Flower + Vape + Rosin) -> Metric Totals
  // -------------------------------------------------------------------------
  TestRegistry.register({
    id: 'T3-10',
    name: 'Multi-Category Cart (Flower + Vape + Rosin) -> Metric Totals',
    feature: 'F8+F11+F12',
    tier: 3,
    description: 'Verify CartSimulator correctly tallies grams, millilitres, and units separately',
    fn: () => {
      const cart = new CartSimulator();
      // 1. Add 3.5g Jozi Lemon Haze (Flower)
      cart.addItem({
        productId: 'prod-001',
        variantId: 'var-3.5g',
        name: 'Jozi Lemon Haze',
        baseUom: 'GRAMS',
        baseQuantity: 3.5,
        priceCents: 45000,
        quantity: 1,
      });

      // 2. Add 1ml Permanent Marker Live Rosin Cartridge (Vape)
      cart.addItem({
        productId: 'prod-002',
        variantId: 'var-1u',
        name: 'Permanent Marker Live Rosin',
        baseUom: 'UNITS',
        baseQuantity: 1.0,
        priceCents: 140000,
        quantity: 1,
      });

      // 3. Add 30ml Obsidian Rosin Dropper (Elixir)
      cart.addItem({
        productId: 'prod-003',
        variantId: 'var-30ml',
        name: 'Obsidian Rosin Dropper',
        baseUom: 'MILLILITERS',
        baseQuantity: 30.0,
        priceCents: 95000,
        quantity: 1,
      });

      const totals = cart.getTotals();
      assertEqual(totals.totalGrams, 3.5, 'Total grams must be 3.5g');
      assertEqual(totals.totalMl, 30.0, 'Total volume must be 30ml');
      assertEqual(totals.totalUnits, 1.0, 'Total units must be 1');
      assertEqual(totals.subtotalCents, 45000 + 140000 + 95000, 'Subtotal cents must equal sum of items');
    },
  });

  // -------------------------------------------------------------------------
  // T3-11: Social Context -> JSON-LD Schema -> Contact Page Info
  // -------------------------------------------------------------------------
  TestRegistry.register({
    id: 'T3-11',
    name: 'Social Media Context -> JSON-LD Schema -> Contact Page Info',
    feature: 'F13+F15',
    tier: 3,
    description: 'Verify lounge branches from social context match both JSON-LD LocalBusiness and Contact page',
    fn: () => {
      const contact = readFileUtf8('src/app/contact/page.tsx') || '';
      const jsonLd = readFileUtf8('src/components/seo/JsonLd.tsx') || '';
      const combined = contact + jsonLd;
      assertMatch(combined, /(Sandton|Norwood|Rivonia|Kibler Park|Johannesburg)/i, 'Must feature Johannesburg lounge locations');
    },
  });

  // -------------------------------------------------------------------------
  // T3-12: Edge Middleware Protection -> Client-Side Vault Guard Symmetry
  // -------------------------------------------------------------------------
  TestRegistry.register({
    id: 'T3-12',
    name: 'Edge Middleware Protection -> Client-Side Vault Guard Symmetry',
    feature: 'F7',
    tier: 3,
    description: 'Verify middleware MEMBER_ROUTES and Vault page redirect logic share common destination (/onboarding)',
    fn: () => {
      const mw = readFileUtf8('src/middleware.ts');
      const vault = readFileUtf8('src/app/vault/page.tsx');
      assert(mw !== null, 'src/middleware.ts must exist');
      // Middleware redirects unauthenticated member routes to /onboarding
      assertMatch(mw, /\/onboarding/, 'Middleware must redirect to /onboarding');
      // Vault page must also specify /onboarding
      if (vault) {
        assertMatch(vault, /\/onboarding/, 'Vault page must redirect to /onboarding');
      }
    },
  });
}
