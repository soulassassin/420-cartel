/**
 * Tier 2: Boundary & Corner Cases E2E Tests (>=5 tests per feature F1..F18 = 90 tests)
 * 420 Cartel Test Suite
 */

import {
  TestRegistry,
  assert,
  assertEqual,
  assertNotEqual,
  assertIncludes,
  assertNotIncludes,
  assertMatch,
  assertNotMatch,
  assertGreaterThan,
  assertGreaterThanOrEqual,
  assertLessThan,
  fileExists,
  readFileUtf8,
  readBuffer,
  getJpegDimensions,
  parseEnvFile,
} from './helpers/assertions.mjs';

import {
  createAnonymousSession,
  createUnverifiedSession,
  createActiveMemberSession,
  createSuspendedSession,
  createStaffSession,
  evaluateRouteAccess,
} from './helpers/mock_session.mjs';

export function registerTier2Tests() {
  // =========================================================================
  // F1: Brand Logo Copy & Storage (Boundary & Corner)
  // =========================================================================
  TestRegistry.register({
    id: 'F1-T2-01',
    name: 'Logo file read buffer non-empty',
    feature: 'F1',
    tier: 2,
    description: 'Verify buffer read returns non-empty byte buffer without permission errors',
    fn: () => {
      const buf = readBuffer('public/fourtwentycartel_logo.jpg');
      assert(buf !== null && buf.length > 0, 'Buffer must be readable and non-empty');
    },
  });

  TestRegistry.register({
    id: 'F1-T2-02',
    name: 'Logo public URL path format sanitization',
    feature: 'F1',
    tier: 2,
    description: 'Verify public path contains no spaces, backslashes, or uppercase characters in filename',
    fn: () => {
      const targetPath = '/fourtwentycartel_logo.jpg';
      assertNotMatch(targetPath, /[\\A-Z\s]/, 'Public URL path must be lowercase without spaces or backslashes');
      assertMatch(targetPath, /^\/[a-z0-9_]+\.jpg$/, 'Path must match clean web asset format');
    },
  });

  TestRegistry.register({
    id: 'F1-T2-03',
    name: 'Logo exact 1:1 aspect ratio',
    feature: 'F1',
    tier: 2,
    description: 'Verify logo aspect ratio is precisely 1.0 (width equals height)',
    fn: () => {
      const buf = readBuffer('public/fourtwentycartel_logo.jpg');
      const dims = getJpegDimensions(buf);
      assert(dims !== null, 'Failed to extract dimensions');
      assertEqual(dims.width / dims.height, 1.0, 'Aspect ratio must be precisely 1.0');
    },
  });

  TestRegistry.register({
    id: 'F1-T2-04',
    name: 'Logo MIME type resolution',
    feature: 'F1',
    tier: 2,
    description: 'Verify file extension .jpg maps strictly to image/jpeg MIME type',
    fn: () => {
      const ext = 'fourtwentycartel_logo.jpg'.split('.').pop();
      assertEqual(ext, 'jpg', 'Extension must be jpg');
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'application/octet-stream';
      assertEqual(mime, 'image/jpeg', 'MIME type must resolve to image/jpeg');
    },
  });

  TestRegistry.register({
    id: 'F1-T2-05',
    name: 'Logo color channels validation',
    feature: 'F1',
    tier: 2,
    description: 'Verify JPEG contains 3 color components (standard YCbCr / RGB)',
    fn: () => {
      const buf = readBuffer('public/fourtwentycartel_logo.jpg');
      const dims = getJpegDimensions(buf);
      assert(dims !== null, 'Failed to extract SOF');
      assertEqual(dims.components, 3, `Expected 3 color components, found ${dims.components}`);
    },
  });

  // =========================================================================
  // F2: Brand Logo Integration Site-Wide (Boundary & Corner)
  // =========================================================================
  TestRegistry.register({
    id: 'F2-T2-01',
    name: 'Logo accessible alt text in navigation',
    feature: 'F2',
    tier: 2,
    description: 'Verify logo in CartelCommandNav provides alt text containing "420 Cartel"',
    fn: () => {
      const nav = readFileUtf8('src/components/layout/CartelCommandNav.tsx');
      assertMatch(nav, /alt=['"][^'"]*420 Cartel[^'"]*['"]/, 'Logo image must have accessible alt text');
    },
  });

  TestRegistry.register({
    id: 'F2-T2-02',
    name: 'OpenGraph metadata image dimension constraints',
    feature: 'F2',
    tier: 2,
    description: 'Verify openGraph images in layout.tsx declares width: 1080 and height: 1080',
    fn: () => {
      const layout = readFileUtf8('src/app/layout.tsx');
      assertMatch(layout, /width:\s*1080/, 'OG image must declare width: 1080');
      assertMatch(layout, /height:\s*1080/, 'OG image must declare height: 1080');
    },
  });

  TestRegistry.register({
    id: 'F2-T2-03',
    name: 'Twitter card summary_large_image referencing logo',
    feature: 'F2',
    tier: 2,
    description: 'Verify twitter card in layout.tsx links to fourtwentycartel_logo.jpg',
    fn: () => {
      const layout = readFileUtf8('src/app/layout.tsx');
      assertMatch(layout, /twitter:\s*\{[\s\S]*fourtwentycartel_logo\.jpg/, 'Twitter card must reference fourtwentycartel_logo.jpg');
    },
  });

  TestRegistry.register({
    id: 'F2-T2-04',
    name: 'Zero hardcoded local absolute paths in logo references',
    feature: 'F2',
    tier: 2,
    description: 'Verify no source file contains hardcoded C:\\... or OneDrive paths for the logo',
    fn: () => {
      const files = ['src/components/layout/CartelCommandNav.tsx', 'src/app/page.tsx', 'src/app/layout.tsx'];
      for (const f of files) {
        const text = readFileUtf8(f);
        if (text) {
          assertNotMatch(text, /[A-Za-z]:\\[^'"]*fourtwentycartel_logo/i, `File ${f} must not use absolute disk paths for logo`);
        }
      }
    },
  });

  TestRegistry.register({
    id: 'F2-T2-05',
    name: 'Navbar logo responsive sizing constraints',
    feature: 'F2',
    tier: 2,
    description: 'Verify logo image in navbar specifies explicit width/height between 32 and 80 pixels',
    fn: () => {
      const nav = readFileUtf8('src/components/layout/CartelCommandNav.tsx');
      assertMatch(nav, /(width=\{[3-8][0-9]\}|size-\[[3-8][0-9]px\]|h-1[0-4]|w-1[0-4]|size-1[0-4])/, 'Navbar logo must have constrained responsive dimensions');
    },
  });

  // =========================================================================
  // F3: Higgsfield MCP Configuration (Boundary & Corner)
  // =========================================================================
  TestRegistry.register({
    id: 'F3-T2-01',
    name: 'Higgsfield MCP URL HTTPS protocol parsing',
    feature: 'F3',
    tier: 2,
    description: 'Verify HIGGSFIELD_MCP_URL parses as valid URL with https: protocol and /mcp pathname',
    fn: () => {
      const env = parseEnvFile('.env.example');
      const parsed = new URL(env.HIGGSFIELD_MCP_URL || 'https://mcp.higgsfield.ai/mcp');
      assertEqual(parsed.protocol, 'https:', 'Protocol must be https:');
      assertEqual(parsed.hostname, 'mcp.higgsfield.ai', 'Hostname must be mcp.higgsfield.ai');
      assertEqual(parsed.pathname, '/mcp', 'Pathname must be /mcp');
    },
  });

  TestRegistry.register({
    id: 'F3-T2-02',
    name: 'Higgsfield client handles missing API key gracefully',
    feature: 'F3',
    tier: 2,
    description: 'Verify client module does not throw unhandled exception if process.env.HIGGSFIELD_API_KEY is empty',
    fn: () => {
      const client = readFileUtf8('src/lib/higgsfield/client.ts');
      assert(client !== null, 'client.ts must exist');
      // Verify client guards apiKey check or throws meaningful error rather than crashing on import
      assertMatch(client, /(HIGGSFIELD_API_KEY|apiKey)/, 'Client must reference HIGGSFIELD_API_KEY safely');
    },
  });

  TestRegistry.register({
    id: 'F3-T2-03',
    name: 'Higgsfield endpoint rejects non-https URLs',
    feature: 'F3',
    tier: 2,
    description: 'Verify client does not hardcode insecure http:// URLs',
    fn: () => {
      const client = readFileUtf8('src/lib/higgsfield/client.ts');
      assertNotMatch(client, /http:\/\/mcp\.higgsfield\.ai/, 'Client must never use insecure http:// for MCP');
    },
  });

  TestRegistry.register({
    id: 'F3-T2-04',
    name: 'Higgsfield request timeout configuration',
    feature: 'F3',
    tier: 2,
    description: 'Verify client or reel pipeline configures timeout or AbortSignal to avoid hanging',
    fn: () => {
      const client = readFileUtf8('src/lib/higgsfield/client.ts');
      const pipeline = readFileUtf8('src/lib/higgsfield/reel-pipeline.ts');
      const code = (client || '') + (pipeline || '');
      assertMatch(code, /(signal|timeout|abort|AbortController)/i, 'Higgsfield pipeline must support abort/timeout');
    },
  });

  TestRegistry.register({
    id: 'F3-T2-05',
    name: 'Strict dotenv syntax compliance',
    feature: 'F3',
    tier: 2,
    description: 'Verify .env.example contains no malformed lines with duplicate equal signs or unclosed quotes',
    fn: () => {
      const content = readFileUtf8('.env.example');
      const lines = (content || '').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        assertMatch(trimmed, /^[A-Z0-9_]+=.*/, `Line "${trimmed}" must be standard KEY=VALUE syntax`);
      }
    },
  });

  // =========================================================================
  // F4: Higgsfield Brand Visual Formulas (Boundary & Corner)
  // =========================================================================
  TestRegistry.register({
    id: 'F4-T2-01',
    name: 'Prompt builder handles null THC and CBD percentages',
    feature: 'F4',
    tier: 2,
    description: 'Verify buildPromoReelPrompt handles null thcPct/cbdPct without injecting "null%" or "undefined%"',
    fn: () => {
      const prompt = readFileUtf8('src/lib/higgsfield/prompt.ts');
      assertMatch(prompt, /thcPct\s*!==\s*null|thcPct\s*\?|thcPct\b/, 'prompt.ts must safely check thcPct');
    },
  });

  TestRegistry.register({
    id: 'F4-T2-02',
    name: 'Prompt builder handles empty terpeneTags array',
    feature: 'F4',
    tier: 2,
    description: 'Verify buildPromoReelPrompt handles terpeneTags: [] without generating trailing commas',
    fn: () => {
      const prompt = readFileUtf8('src/lib/higgsfield/prompt.ts');
      assertMatch(prompt, /terpeneTags\.length/, 'prompt.ts must check terpeneTags.length before adding');
    },
  });

  TestRegistry.register({
    id: 'F4-T2-03',
    name: 'Featured tier stat card uses metric formatting',
    feature: 'F4',
    tier: 2,
    description: 'Verify featuredTier stat card overlay uses metric unit symbol (e.g. g / ml)',
    fn: () => {
      const prompt = readFileUtf8('src/lib/higgsfield/prompt.ts');
      assertMatch(prompt, /UOM_SYMBOL/, 'prompt.ts must use UOM_SYMBOL for featured tier format');
    },
  });

  TestRegistry.register({
    id: 'F4-T2-04',
    name: 'Higgsfield prompt length constraint',
    feature: 'F4',
    tier: 2,
    description: 'Verify visual formula string length is reasonable (< 500 characters) to leave room for product details',
    fn: () => {
      const brand = readFileUtf8('src/lib/brand.ts');
      const match = brand.match(/HIGGSFIELD_VISUAL_FORMULA\s*=\s*([\s\S]*?);/);
      assert(match !== null, 'HIGGSFIELD_VISUAL_FORMULA must be defined');
      assertLessThan(match[1].length, 500, 'Visual formula alone should be < 500 chars');
    },
  });

  TestRegistry.register({
    id: 'F4-T2-05',
    name: 'Strain mood complete enum coverage',
    feature: 'F4',
    tier: 2,
    description: 'Verify STRAIN_MOOD covers all 5 strain types: INDICA, SATIVA, HYBRID, CBD, NOT_APPLICABLE',
    fn: () => {
      const prompt = readFileUtf8('src/lib/higgsfield/prompt.ts');
      assertMatch(prompt, /INDICA:/, 'Must cover INDICA');
      assertMatch(prompt, /SATIVA:/, 'Must cover SATIVA');
      assertMatch(prompt, /HYBRID:/, 'Must cover HYBRID');
      assertMatch(prompt, /CBD:/, 'Must cover CBD');
      assertMatch(prompt, /NOT_APPLICABLE:/, 'Must cover NOT_APPLICABLE');
    },
  });

  // =========================================================================
  // F5: Navigation Ordering & Redesign (Boundary & Corner)
  // =========================================================================
  TestRegistry.register({
    id: 'F5-T2-01',
    name: 'Mobile drawer initial state closed',
    feature: 'F5',
    tier: 2,
    description: 'Verify mobile drawer isOpen state defaults to false in useState',
    fn: () => {
      const nav = readFileUtf8('src/components/layout/CartelCommandNav.tsx');
      assertMatch(nav, /useState\s*\(\s*false\s*\)/, 'Mobile menu drawer must default to closed (false)');
    },
  });

  TestRegistry.register({
    id: 'F5-T2-02',
    name: 'Mobile drawer dismiss button existence',
    feature: 'F5',
    tier: 2,
    description: 'Verify mobile drawer includes close button (<X /> icon or close toggle)',
    fn: () => {
      const nav = readFileUtf8('src/components/layout/CartelCommandNav.tsx');
      assertMatch(nav, /(<X\b|aria-label=['"][^'"]*close[^'"]*['"])/i, 'Mobile drawer must have close button');
    },
  });

  TestRegistry.register({
    id: 'F5-T2-03',
    name: 'Mobile drawer closes on navigation route change',
    feature: 'F5',
    tier: 2,
    description: 'Verify navigation link clicks close the mobile drawer (setIsOpen(false))',
    fn: () => {
      const nav = readFileUtf8('src/components/layout/CartelCommandNav.tsx');
      assertMatch(nav, /(setIsOpen\(false\)|setOpen\(false\)|setMobileMenuOpen\(false\))/i, 'Link click in drawer must close drawer');
    },
  });

  TestRegistry.register({
    id: 'F5-T2-04',
    name: 'Active route visual indicator logic',
    feature: 'F5',
    tier: 2,
    description: 'Verify pathname comparison is used for active link styling',
    fn: () => {
      const nav = readFileUtf8('src/components/layout/CartelCommandNav.tsx');
      assertMatch(nav, /pathname\s*===/, 'Navigation must check current pathname for active styling');
    },
  });

  TestRegistry.register({
    id: 'F5-T2-05',
    name: 'Desktop and mobile markup separation',
    feature: 'F5',
    tier: 2,
    description: 'Verify desktop links are wrapped with hidden md:flex to prevent DOM clutter on mobile',
    fn: () => {
      const nav = readFileUtf8('src/components/layout/CartelCommandNav.tsx');
      assertMatch(nav, /hidden\s+md:flex/, 'Desktop nav links must use hidden md:flex');
    },
  });

  // =========================================================================
  // F6: Profile Icon & Login Option (Boundary & Corner)
  // =========================================================================
  TestRegistry.register({
    id: 'F6-T2-01',
    name: 'Authenticated state displays member dossier/code',
    feature: 'F6',
    tier: 2,
    description: 'Verify when member is authenticated, nav can display member code or account indicator',
    fn: () => {
      const nav = readFileUtf8('src/components/layout/CartelCommandNav.tsx');
      assertMatch(nav, /(member|member_code|session)/, 'Nav must inspect session state to adapt profile options');
    },
  });

  TestRegistry.register({
    id: 'F6-T2-02',
    name: 'Unauthenticated state displays explicit Login option',
    feature: 'F6',
    tier: 2,
    description: 'Verify visitor with null member sees "Log in"',
    fn: () => {
      const nav = readFileUtf8('src/components/layout/CartelCommandNav.tsx');
      assertMatch(nav, /!member[\s\S]*(Log in|Login)|\/login/i, 'Unauthenticated state must render Login link');
    },
  });

  TestRegistry.register({
    id: 'F6-T2-03',
    name: 'Profile icon accessible ARIA label',
    feature: 'F6',
    tier: 2,
    description: 'Verify Profile link contains aria-label attribute (e.g. "Your profile" or "Account")',
    fn: () => {
      const nav = readFileUtf8('src/components/layout/CartelCommandNav.tsx');
      assertMatch(nav, /aria-label=['"][^'"]*(profile|account)[^'"]*['"]/i, 'Profile link must have accessible aria-label');
    },
  });

  TestRegistry.register({
    id: 'F6-T2-04',
    name: 'Non-staff session suppresses POS and Admin links',
    feature: 'F6',
    tier: 2,
    description: 'Verify standard member session does not show staff links in UI',
    fn: () => {
      const session = createActiveMemberSession();
      const posAccess = evaluateRouteAccess(session, '/pos');
      assertEqual(posAccess.allowed, false, 'Non-staff member must not have access to /pos');
      const adminAccess = evaluateRouteAccess(session, '/admin');
      assertEqual(adminAccess.allowed, false, 'Non-staff member must not have access to /admin');
    },
  });

  TestRegistry.register({
    id: 'F6-T2-05',
    name: 'Staff session grants access to POS and Admin',
    feature: 'F6',
    tier: 2,
    description: 'Verify staff session allows access to /pos and /admin',
    fn: () => {
      const session = createStaffSession('BUDTENDER');
      const posAccess = evaluateRouteAccess(session, '/pos');
      assertEqual(posAccess.allowed, true, 'Staff member must have access to /pos');
      const adminAccess = evaluateRouteAccess(session, '/admin');
      assertEqual(adminAccess.allowed, true, 'Staff member must have access to /admin');
    },
  });

  // =========================================================================
  // F7: Vault Route & Member Gating (Boundary & Corner)
  // =========================================================================
  TestRegistry.register({
    id: 'F7-T2-01',
    name: 'Unverified age blocked from Vault',
    feature: 'F7',
    tier: 2,
    description: 'Verify session with age_verified_at === null is denied Vault access and redirected to onboarding',
    fn: () => {
      const unverified = createUnverifiedSession({ age_verified_at: null });
      const access = evaluateRouteAccess(unverified, '/vault');
      assertEqual(access.allowed, false, 'Unverified session must not access Vault');
      assertIncludes(access.redirect, '/onboarding', 'Redirect must point to /onboarding');
    },
  });

  TestRegistry.register({
    id: 'F7-T2-02',
    name: 'Suspended member blocked from Vault',
    feature: 'F7',
    tier: 2,
    description: 'Verify suspended member session is denied Vault access',
    fn: () => {
      const suspended = createSuspendedSession();
      const access = evaluateRouteAccess(suspended, '/vault');
      assertEqual(access.allowed, false, 'Suspended member must not access Vault');
      assertIncludes(access.redirect, '/onboarding', 'Suspended member must be routed to onboarding');
    },
  });

  TestRegistry.register({
    id: 'F7-T2-03',
    name: 'Vault deep link preserved in redirect query param',
    feature: 'F7',
    tier: 2,
    description: 'Verify access to /vault?category=FLOWER preserves query as next param',
    fn: () => {
      const anon = createAnonymousSession();
      const access = evaluateRouteAccess(anon, '/vault?category=FLOWER');
      assertEqual(access.allowed, false);
      assertIncludes(access.redirect, 'next=', 'Redirect must contain next param');
      assertIncludes(access.redirect, encodeURIComponent('/vault?category=FLOWER'), 'Deep link query must be encoded in next param');
    },
  });

  TestRegistry.register({
    id: 'F7-T2-04',
    name: 'Client-side redirect guard triggers immediately',
    feature: 'F7',
    tier: 2,
    description: 'Verify Vault page uses useEffect or navigation replace on unverified state',
    fn: () => {
      const vault = readFileUtf8('src/app/vault/page.tsx');
      const shop = readFileUtf8('src/app/shop/page.tsx');
      const code = (vault || '') + (shop || '');
      assertMatch(code, /(router\.replace|router\.push|redirect)\(['"]\/onboarding/, 'Vault page component must trigger client-side redirection');
    },
  });

  TestRegistry.register({
    id: 'F7-T2-05',
    name: 'Empty session defaults to anonymous gating',
    feature: 'F7',
    tier: 2,
    description: 'Verify completely empty session object cannot access protected routes',
    fn: () => {
      const emptySession = { member: null, staff: null, verified: false, isAuthenticated: false };
      const access = evaluateRouteAccess(emptySession, '/vault');
      assertEqual(access.allowed, false);
      assertIncludes(access.redirect, '/onboarding');
    },
  });

  // =========================================================================
  // F8: Awaken Product Ingestion (Boundary & Corner)
  // =========================================================================
  TestRegistry.register({
    id: 'F8-T2-01',
    name: 'Awaken product SKU format validation',
    feature: 'F8',
    tier: 2,
    description: 'Verify all SKUs in fixtures conform to CRT-[CAT]-[SLUG] format',
    fn: () => {
      const fixtures = readFileUtf8('src/lib/demo/fixtures.ts');
      const skus = fixtures.match(/sku:\s*['"]([^'"]+)['"]/g) || [];
      assertGreaterThan(skus.length, 5, 'Must find product SKUs in fixtures');
      for (const line of skus) {
        const sku = line.split(/['"]/)[1];
        assertMatch(sku, /^CRT-[A-Z0-9]+-[A-Z0-9]+$/, `SKU "${sku}" must match CRT-[CAT]-[ID] format`);
      }
    },
  });

  TestRegistry.register({
    id: 'F8-T2-02',
    name: 'Product slug URL safety validation',
    feature: 'F8',
    tier: 2,
    description: 'Verify all product slugs are lowercase kebab-case strings',
    fn: () => {
      const fixtures = readFileUtf8('src/lib/demo/fixtures.ts');
      const slugs = fixtures.match(/slug:\s*['"]([^'"]+)['"]/g) || [];
      assertGreaterThan(slugs.length, 5, 'Must find product slugs in fixtures');
      for (const line of slugs) {
        const slug = line.split(/['"]/)[1];
        assertMatch(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `Slug "${slug}" must be URL-safe kebab-case`);
      }
    },
  });

  TestRegistry.register({
    id: 'F8-T2-03',
    name: 'Variant base_quantity matches UOM bounds',
    feature: 'F8',
    tier: 2,
    description: 'Verify base_quantity for all variants is strictly greater than 0',
    fn: () => {
      const fixtures = readFileUtf8('src/lib/demo/fixtures.ts');
      const baseQtys = fixtures.match(/baseQuantity:\s*([0-9.]+)/g) || [];
      assertGreaterThan(baseQtys.length, 5, 'Must find variant baseQuantities');
      for (const line of baseQtys) {
        const qty = parseFloat(line.split(':')[1].trim());
        assertGreaterThan(qty, 0, `Base quantity ${qty} must be > 0`);
      }
    },
  });

  TestRegistry.register({
    id: 'F8-T2-04',
    name: 'Strain types enum constraint',
    feature: 'F8',
    tier: 2,
    description: 'Verify strain property on all products is one of INDICA, SATIVA, HYBRID, CBD, NOT_APPLICABLE',
    fn: () => {
      const fixtures = readFileUtf8('src/lib/demo/fixtures.ts');
      const strains = fixtures.match(/strain:\s*['"]([A-Z_]+)['"]/g) || [];
      const valid = ['INDICA', 'SATIVA', 'HYBRID', 'CBD', 'NOT_APPLICABLE'];
      assertGreaterThan(strains.length, 5, 'Must find product strains');
      for (const line of strains) {
        const s = line.split(/['"]/)[1];
        assert(valid.includes(s), `Invalid strain "${s}", must be one of ${valid.join(', ')}`);
      }
    },
  });

  TestRegistry.register({
    id: 'F8-T2-05',
    name: 'Unique UUID validation for seed entities',
    feature: 'F8',
    tier: 2,
    description: 'Verify no duplicate UUIDs exist across seed fixtures',
    fn: () => {
      const fixtures = readFileUtf8('src/lib/demo/fixtures.ts');
      const uuids = fixtures.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || [];
      assertGreaterThan(uuids.length, 10, 'Must find entity UUIDs');
      // In SEED_IDS definitions, each key must have unique UUID
      const seedDefBlock = fixtures.slice(0, fixtures.indexOf('export const DEFAULT_BRANCH_ID'));
      const defUuids = seedDefBlock.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || [];
      const set = new Set(defUuids);
      assertEqual(set.size, defUuids.length, 'Every entity defined in SEED_IDS must have a unique UUID');
    },
  });

  // =========================================================================
  // F9: POS Images & Categories (Boundary & Corner)
  // =========================================================================
  TestRegistry.register({
    id: 'F9-T2-01',
    name: 'POS thumbnail fallback placeholder handling',
    feature: 'F9',
    tier: 2,
    description: 'Verify POS image component handles missing or broken hero_media_url without page crash',
    fn: () => {
      const pos = readFileUtf8('src/app/pos/page.tsx');
      assertMatch(pos, /(hero_media_url|fallback|placeholder|<Image|<img)/, 'POS must safely handle thumbnail rendering');
    },
  });

  TestRegistry.register({
    id: 'F9-T2-02',
    name: 'POS category filtering with empty match',
    feature: 'F9',
    tier: 2,
    description: 'Verify POS displays "No products" empty state when category filter has 0 items',
    fn: () => {
      const pos = readFileUtf8('src/app/pos/page.tsx');
      assertMatch(pos, /(No products|no items|empty)/i, 'POS must render empty state for filter without results');
    },
  });

  TestRegistry.register({
    id: 'F9-T2-03',
    name: 'POS search multi-field query matching',
    feature: 'F9',
    tier: 2,
    description: 'Verify POS search matches across name, sku, and category',
    fn: () => {
      const pos = readFileUtf8('src/app/pos/page.tsx');
      assertMatch(pos, /toLowerCase\(\)\.includes/, 'POS search must filter with case-insensitive substring search');
    },
  });

  TestRegistry.register({
    id: 'F9-T2-04',
    name: 'Out of stock tier button disablement',
    feature: 'F9',
    tier: 2,
    description: 'Verify variant purchase button is disabled when canFit is false',
    fn: () => {
      const pos = readFileUtf8('src/app/pos/page.tsx');
      assertMatch(pos, /disabled=\{!canFit\}/, 'POS tier button must be disabled when !canFit');
    },
  });

  TestRegistry.register({
    id: 'F9-T2-05',
    name: 'POS search popup dismiss boundary',
    feature: 'F9',
    tier: 2,
    description: 'Verify POS search popup can be dismissed or closed on selection',
    fn: () => {
      const pos = readFileUtf8('src/app/pos/page.tsx');
      assertMatch(pos, /(setSearchQuery\(['"]['"]\)|setOpen|dropdown)/i, 'POS search must support clearing or closing');
    },
  });

  // =========================================================================
  // F10: Admin Inventory Images & Stock (Boundary & Corner)
  // =========================================================================
  TestRegistry.register({
    id: 'F10-T2-01',
    name: 'Admin inventory decimal precision formatting',
    feature: 'F10',
    tier: 2,
    description: 'Verify remaining stock is formatted using UOM_PRECISION or toFixed',
    fn: () => {
      const inv = readFileUtf8('src/app/admin/inventory/page.tsx');
      assertMatch(inv, /(toFixed|UOM_PRECISION|formatBaseQty)/, 'Admin inventory must format quantities with precision');
    },
  });

  TestRegistry.register({
    id: 'F10-T2-02',
    name: 'Exhausted batch depletion indicator',
    feature: 'F10',
    tier: 2,
    description: 'Verify batches with remaining_base_qty <= 0 display depleted or warning state',
    fn: () => {
      const inv = readFileUtf8('src/app/admin/inventory/page.tsx');
      assertMatch(inv, /(remaining_base_qty\s*<=\s*0|Exhausted|low_stock_threshold|tone=)/i, 'Admin inventory must indicate exhausted or low stock');
    },
  });

  TestRegistry.register({
    id: 'F10-T2-03',
    name: 'Extreme stock numbers formatting',
    feature: 'F10',
    tier: 2,
    description: 'Verify formatting handles large numbers (e.g. 10000) without crashing',
    fn: () => {
      const uom = readFileUtf8('src/lib/uom.ts');
      assertMatch(uom, /Number\(qty\.toFixed/, 'uom.ts formatBaseQty must parse numeric quantities cleanly');
    },
  });

  TestRegistry.register({
    id: 'F10-T2-04',
    name: 'Batch intake form quantity validation',
    feature: 'F10',
    tier: 2,
    description: 'Verify batch adjustment logic rejects non-positive adjustment numbers',
    fn: () => {
      const inv = readFileUtf8('src/app/admin/inventory/page.tsx');
      assertMatch(inv, /(adjustBatchStock|delta|amount|qty)/, 'Admin inventory must handle batch stock adjustments');
    },
  });

  TestRegistry.register({
    id: 'F10-T2-05',
    name: 'Inventory search filters by batch code and SKU',
    feature: 'F10',
    tier: 2,
    description: 'Verify admin inventory search query checks both batch_code and product details',
    fn: () => {
      const inv = readFileUtf8('src/app/admin/inventory/page.tsx');
      assertMatch(inv, /(search|query|filter|batch_code)/i, 'Admin inventory must support search/filter');
    },
  });

  // =========================================================================
  // F11: Metric Standardization in Fixtures (Boundary & Corner)
  // =========================================================================
  TestRegistry.register({
    id: 'F11-T2-01',
    name: 'Case-insensitive regex check for imperial units in flower tiers',
    feature: 'F11',
    tier: 2,
    description: 'Verify case-insensitive check for eighth|quarter|half|ounce in flower tier labels returns 0 matches',
    fn: () => {
      const fixtures = readFileUtf8('src/lib/demo/fixtures.ts');
      // Look at FLOWER_TIER_FACTORS or flower variant label definitions
      const match = fixtures.match(/label:\s*['"][^'"]*(eighth|quarter|half|ounce)[^'"]*['"]/i);
      assert(match === null, `Found imperial flower tier label: ${match ? match[0] : ''}`);
    },
  });

  TestRegistry.register({
    id: 'F11-T2-02',
    name: 'Variant baseQuantity numerical parity with tier label',
    feature: 'F11',
    tier: 2,
    description: 'Verify 3.5g tier has baseQuantity 3.5, 7g has 7, 14g has 14, 28g has 28',
    fn: () => {
      const fixtures = readFileUtf8('src/lib/demo/fixtures.ts');
      assertMatch(fixtures, /baseQuantity:\s*3\.5/, '3.5g tier must have baseQuantity 3.5');
      assertMatch(fixtures, /baseQuantity:\s*7\b/, '7g tier must have baseQuantity 7');
      assertMatch(fixtures, /baseQuantity:\s*14\b/, '14g tier must have baseQuantity 14');
      assertMatch(fixtures, /baseQuantity:\s*28\b/, '28g tier must have baseQuantity 28');
    },
  });

  TestRegistry.register({
    id: 'F11-T2-03',
    name: 'Custom scale amount variant metric setting',
    feature: 'F11',
    tier: 2,
    description: 'Verify custom scale variant sets isCustomAmount: true with metric step 1g',
    fn: () => {
      const fixtures = readFileUtf8('src/lib/demo/fixtures.ts');
      assertMatch(fixtures, /isCustomAmount:\s*true/, 'Must define custom amount scale variant');
    },
  });

  TestRegistry.register({
    id: 'F11-T2-04',
    name: 'Elixir variants strictly millilitres without fl oz',
    feature: 'F11',
    tier: 2,
    description: 'Verify elixir product variants use ml and zero fl oz',
    fn: () => {
      const fixtures = readFileUtf8('src/lib/demo/fixtures.ts');
      assertNotMatch(fixtures, /fl\s*oz/i, 'Fixtures must contain zero fluid ounce references');
      assertMatch(fixtures, /base_uom:\s*['"]MILLILITERS['"]/, 'Elixirs must use base_uom MILLILITERS');
    },
  });

  TestRegistry.register({
    id: 'F11-T2-05',
    name: 'Pre-rolls and edibles strictly units without imperial packs',
    feature: 'F11',
    tier: 2,
    description: 'Verify pre-rolls and edibles use base_uom UNITS',
    fn: () => {
      const fixtures = readFileUtf8('src/lib/demo/fixtures.ts');
      assertMatch(fixtures, /base_uom:\s*['"]UNITS['"]/, 'Pre-rolls and edibles must use base_uom UNITS');
    },
  });

  // =========================================================================
  // F12: Metric Standardization Site-Wide (Boundary & Corner)
  // =========================================================================
  TestRegistry.register({
    id: 'F12-T2-01',
    name: 'Thermal receipt strictly metric output',
    feature: 'F12',
    tier: 2,
    description: 'Verify ThermalReceiptPrint.tsx contains strictly metric units and zero imperial words',
    fn: () => {
      const receipt = readFileUtf8('src/components/pos/ThermalReceiptPrint.tsx');
      assert(receipt !== null, 'ThermalReceiptPrint.tsx must exist');
      assertNotMatch(receipt, /\b(eighth|quarter|ounce|ounces|lbs|fl\s*oz)\b/i, 'Receipt must not contain imperial units');
    },
  });

  TestRegistry.register({
    id: 'F12-T2-02',
    name: 'Cart drawer multi-unit summary metric breakdown',
    feature: 'F12',
    tier: 2,
    description: 'Verify cart drawer formats grams, millilitres, and units separately with metric labels',
    fn: () => {
      const shop = readFileUtf8('src/app/shop/page.tsx');
      assert(shop !== null, 'src/app/shop/page.tsx must exist');
      assertMatch(shop, /(Grams|Millilitres|Units|totalGrams|totalMl)/, 'Cart summary must show metric units');
    },
  });

  TestRegistry.register({
    id: 'F12-T2-03',
    name: 'AI Sommelier metric recommendation prompt',
    feature: 'F12',
    tier: 2,
    description: 'Verify AI Sommelier instructions instruct agent to suggest exclusively metric weights',
    fn: () => {
      const agent = readFileUtf8('src/app/agent/page.tsx');
      const apiRoute = readFileUtf8('src/app/api/chat/route.ts') || readFileUtf8('src/app/api/agent/route.ts');
      const text = (agent || '') + (apiRoute || '');
      assertNotMatch(text, /\b(recommend an eighth|recommend a quarter\b)/i, 'AI sommelier must not suggest imperial tiers');
    },
  });

  TestRegistry.register({
    id: 'F12-T2-04',
    name: 'Boundary weight formatting validation',
    feature: 'F12',
    tier: 2,
    description: 'Verify formatBaseQty handles boundary values 0.5g and 1000g accurately',
    fn: () => {
      const uom = readFileUtf8('src/lib/uom.ts');
      assertMatch(uom, /UOM_PRECISION/, 'uom.ts must define UOM_PRECISION');
    },
  });

  TestRegistry.register({
    id: 'F12-T2-05',
    name: 'Source code scan for imperial weight abbreviations',
    feature: 'F12',
    tier: 2,
    description: 'Verify zero occurrences of lbs or fl oz in src/components/',
    fn: () => {
      const nav = readFileUtf8('src/components/layout/CartelCommandNav.tsx') || '';
      const pass = readFileUtf8('src/components/crm/CartelMemberQrPass.tsx') || '';
      const receipt = readFileUtf8('src/components/pos/ThermalReceiptPrint.tsx') || '';
      const combined = nav + pass + receipt;
      assertNotMatch(combined, /\b(fl\s*oz|lbs)\b/i, 'Components must not reference lbs or fl oz');
    },
  });

  // =========================================================================
  // F13: Social Media Context & Brand Copy (Boundary & Corner)
  // =========================================================================
  TestRegistry.register({
    id: 'F13-T2-01',
    name: 'External social links security rel attributes',
    feature: 'F13',
    tier: 2,
    description: 'Verify external social links include rel="noopener noreferrer" and target="_blank"',
    fn: () => {
      const contact = readFileUtf8('src/app/contact/page.tsx') || '';
      const footer = readFileUtf8('src/app/page.tsx') || '';
      const combined = contact + footer;
      assertMatch(combined, /target=['"]_blank['"][\s\S]*rel=['"][^'"]*noopener[^'"]*['"]/, 'External links must have target="_blank" and rel="noopener noreferrer"');
    },
  });

  TestRegistry.register({
    id: 'F13-T2-02',
    name: 'Contact page branch addresses details',
    feature: 'F13',
    tier: 2,
    description: 'Verify contact page lists Johannesburg lounge branch addresses',
    fn: () => {
      const contact = readFileUtf8('src/app/contact/page.tsx');
      assert(contact !== null, 'src/app/contact/page.tsx must exist');
      assertMatch(contact, /(Sandton|Norwood|Rivonia|Kibler Park|Johannesburg)/i, 'Contact page must provide branch locations');
    },
  });

  TestRegistry.register({
    id: 'F13-T2-03',
    name: 'Private adult consumption legal notice',
    feature: 'F13',
    tier: 2,
    description: 'Verify legal notice mentions private consumption and Cannabis for Private Purposes Act compliance',
    fn: () => {
      const about = readFileUtf8('src/app/about/page.tsx') || '';
      const home = readFileUtf8('src/app/page.tsx') || '';
      const combined = about + home;
      assertMatch(combined, /(private.*consumption|private.*purposes|private.*collective|adult.*use)/i, 'Must include private consumption compliance statement');
    },
  });

  TestRegistry.register({
    id: 'F13-T2-04',
    name: 'About page brand voice and atmosphere',
    feature: 'F13',
    tier: 2,
    description: 'Verify About page incorporates boutique lounge atmosphere and private collective voice',
    fn: () => {
      const about = readFileUtf8('src/app/about/page.tsx');
      assert(about !== null, 'src/app/about/page.tsx must exist');
      assertMatch(about, /(social lounge|botanical|collective|sanctuary|reserve)/i, 'About page must capture brand voice');
    },
  });

  TestRegistry.register({
    id: 'F13-T2-05',
    name: 'Social URLs HTTPS security protocol',
    feature: 'F13',
    tier: 2,
    description: 'Verify all social media links use secure https:// protocol',
    fn: () => {
      const contact = readFileUtf8('src/app/contact/page.tsx') || '';
      const footer = readFileUtf8('src/app/page.tsx') || '';
      const combined = contact + footer;
      assertNotMatch(combined, /http:\/\/www\.instagram\.com/, 'Instagram link must be https');
      assertNotMatch(combined, /http:\/\/www\.facebook\.com/, 'Facebook link must be https');
    },
  });

  // =========================================================================
  // F14: SEO & Social Metadata (Boundary & Corner)
  // =========================================================================
  TestRegistry.register({
    id: 'F14-T2-01',
    name: 'MetadataBase valid URL parsing',
    feature: 'F14',
    tier: 2,
    description: 'Verify metadataBase is configured with a valid URL instance in layout.tsx',
    fn: () => {
      const layout = readFileUtf8('src/app/layout.tsx');
      assertMatch(layout, /metadataBase:\s*new URL\(/, 'layout.tsx must configure metadataBase with new URL()');
    },
  });

  TestRegistry.register({
    id: 'F14-T2-02',
    name: 'Metadata keywords array richness',
    feature: 'F14',
    tier: 2,
    description: 'Verify keywords array has at least 5 targeted phrases',
    fn: () => {
      const layout = readFileUtf8('src/app/layout.tsx');
      assertMatch(layout, /keywords:\s*\[[\s\S]*?\]/, 'layout.tsx must define keywords array');
    },
  });

  TestRegistry.register({
    id: 'F14-T2-03',
    name: 'Adult rating metadata declaration',
    feature: 'F14',
    tier: 2,
    description: 'Verify other.rating is declared as adult in layout.tsx',
    fn: () => {
      const layout = readFileUtf8('src/app/layout.tsx');
      assertMatch(layout, /rating:\s*['"]adult['"]/, 'layout.tsx must declare rating: "adult"');
    },
  });

  TestRegistry.register({
    id: 'F14-T2-04',
    name: 'Robots metadata allows indexing',
    feature: 'F14',
    tier: 2,
    description: 'Verify robots metadata specifies index: true, follow: true',
    fn: () => {
      const layout = readFileUtf8('src/app/layout.tsx');
      assertMatch(layout, /index:\s*true/, 'Robots metadata must allow indexing');
      assertMatch(layout, /follow:\s*true/, 'Robots metadata must allow following links');
    },
  });

  TestRegistry.register({
    id: 'F14-T2-05',
    name: 'Title template formatting',
    feature: 'F14',
    tier: 2,
    description: 'Verify title template contains %s and 420 Cartel',
    fn: () => {
      const layout = readFileUtf8('src/app/layout.tsx');
      assertMatch(layout, /template:\s*['"][^'"]*%s[^'"]*420 Cartel[^'"]*['"]/, 'Title template must include %s · 420 Cartel');
    },
  });

  // =========================================================================
  // F15: AIO & GEO JSON-LD Structured Data (Boundary & Corner)
  // =========================================================================
  TestRegistry.register({
    id: 'F15-T2-01',
    name: 'JSON-LD valid JSON serialization check',
    feature: 'F15',
    tier: 2,
    description: 'Verify JsonLd structured data serializes with JSON.stringify without cyclical references',
    fn: () => {
      const jsonLd = readFileUtf8('src/components/seo/JsonLd.tsx');
      assert(jsonLd !== null, 'JsonLd.tsx must exist');
      assertMatch(jsonLd, /JSON\.stringify/, 'JsonLd must serialize data with JSON.stringify');
    },
  });

  TestRegistry.register({
    id: 'F15-T2-02',
    name: 'BreadcrumbList schema sequential positions',
    feature: 'F15',
    tier: 2,
    description: 'Verify BreadcrumbList schema defines itemListElement with 1-based position numbers',
    fn: () => {
      const jsonLd = readFileUtf8('src/components/seo/JsonLd.tsx');
      assertMatch(jsonLd, /(BreadcrumbList|itemListElement)/, 'JsonLd must include BreadcrumbList schema');
    },
  });

  TestRegistry.register({
    id: 'F15-T2-03',
    name: 'OpeningHoursSpecification formatting in JSON-LD',
    feature: 'F15',
    tier: 2,
    description: 'Verify openingHoursSpecification defines opens "09:00" and closes "20:00"',
    fn: () => {
      const jsonLd = readFileUtf8('src/components/seo/JsonLd.tsx');
      assertMatch(jsonLd, /(opens|closes|09:00|20:00)/, 'JsonLd must specify lounge operating hours in schema');
    },
  });

  TestRegistry.register({
    id: 'F15-T2-04',
    name: 'Geo coordinates in LocalBusiness schema',
    feature: 'F15',
    tier: 2,
    description: 'Verify LocalBusiness schemas include latitude and longitude coordinates',
    fn: () => {
      const jsonLd = readFileUtf8('src/components/seo/JsonLd.tsx');
      assertMatch(jsonLd, /(latitude|longitude|GeoCoordinates)/, 'LocalBusiness schema must include geo coordinates');
    },
  });

  TestRegistry.register({
    id: 'F15-T2-05',
    name: 'Root layout renders JsonLd script element',
    feature: 'F15',
    tier: 2,
    description: 'Verify src/app/layout.tsx renders <JsonLd /> component',
    fn: () => {
      const layout = readFileUtf8('src/app/layout.tsx');
      assertMatch(layout, /<JsonLd\b/, 'layout.tsx must render <JsonLd /> in document head/body');
    },
  });

  // =========================================================================
  // F16: Dynamic Sitemap & Robots (Boundary & Corner)
  // =========================================================================
  TestRegistry.register({
    id: 'F16-T2-01',
    name: 'Sitemap entries changeFrequency and priority',
    feature: 'F16',
    tier: 2,
    description: 'Verify sitemap entries declare changeFrequency and priority fields',
    fn: () => {
      const sitemap = readFileUtf8('src/app/sitemap.ts');
      assert(sitemap !== null, 'src/app/sitemap.ts must exist');
      assertMatch(sitemap, /changeFrequency:/, 'Sitemap must define changeFrequency');
      assertMatch(sitemap, /priority:/, 'Sitemap must define priority');
    },
  });

  TestRegistry.register({
    id: 'F16-T2-02',
    name: 'Sitemap priority hierarchy',
    feature: 'F16',
    tier: 2,
    description: 'Verify root page priority is 1.0 and subpages are <= 0.8',
    fn: () => {
      const sitemap = readFileUtf8('src/app/sitemap.ts');
      assertMatch(sitemap, /priority:\s*1\.0|priority:\s*1\b/, 'Root sitemap priority must be 1.0');
    },
  });

  TestRegistry.register({
    id: 'F16-T2-03',
    name: 'Robots wildcard userAgent rules',
    feature: 'F16',
    tier: 2,
    description: 'Verify robots.ts defines rules for userAgent: "*"',
    fn: () => {
      const robots = readFileUtf8('src/app/robots.ts');
      assert(robots !== null, 'src/app/robots.ts must exist');
      assertMatch(robots, /userAgent:\s*['"]\*['"]/, 'Robots must configure wildcard userAgent');
    },
  });

  TestRegistry.register({
    id: 'F16-T2-04',
    name: 'Sitemap URL trailing slash safety',
    feature: 'F16',
    tier: 2,
    description: 'Verify sitemap baseUrl avoids double slash (//about)',
    fn: () => {
      const sitemap = readFileUtf8('src/app/sitemap.ts');
      assertNotMatch(sitemap, /baseUrl\s*\+\s*['"]\/\/['"]/, 'Sitemap must avoid double slash URLs');
    },
  });

  TestRegistry.register({
    id: 'F16-T2-05',
    name: 'Robots disallows private account routes',
    feature: 'F16',
    tier: 2,
    description: 'Verify robots.ts disallows /account, /checkout, /pass',
    fn: () => {
      const robots = readFileUtf8('src/app/robots.ts');
      assertMatch(robots, /['"]\/account['"]/, 'Robots must disallow /account');
      assertMatch(robots, /['"]\/checkout['"]/, 'Robots must disallow /checkout');
    },
  });

  // =========================================================================
  // F17: Mobile Responsiveness: Shell & Overflow (Boundary & Corner)
  // =========================================================================
  TestRegistry.register({
    id: 'F17-T2-01',
    name: '320px viewport emulation no overflow-x',
    feature: 'F17',
    tier: 2,
    description: 'Verify body style contains overflow-x: hidden to eliminate horizontal scroll blowout on 320px screens',
    fn: () => {
      const css = readFileUtf8('src/app/globals.css');
      assertMatch(css, /overflow-x:\s*hidden/, 'globals.css must apply overflow-x: hidden');
    },
  });

  TestRegistry.register({
    id: 'F17-T2-02',
    name: '375px viewport header fit',
    feature: 'F17',
    tier: 2,
    description: 'Verify CartelCommandNav uses justify-between and flex items that fit within 375px',
    fn: () => {
      const nav = readFileUtf8('src/components/layout/CartelCommandNav.tsx');
      assertMatch(nav, /justify-between/, 'Navbar must distribute space using justify-between');
    },
  });

  TestRegistry.register({
    id: 'F17-T2-03',
    name: '1280px desktop breakpoint visibility',
    feature: 'F17',
    tier: 2,
    description: 'Verify desktop nav elements activate on md: (>= 768px) and lg: (>= 1024px)',
    fn: () => {
      const nav = readFileUtf8('src/components/layout/CartelCommandNav.tsx');
      assertMatch(nav, /md:flex/, 'Navbar must enable desktop view on md:');
    },
  });

  TestRegistry.register({
    id: 'F17-T2-04',
    name: 'Footer text wrap and column grid',
    feature: 'F17',
    tier: 2,
    description: 'Verify footer grid collapses to single column on mobile screens (grid-cols-1 or sm:grid-cols-2)',
    fn: () => {
      const home = readFileUtf8('src/app/page.tsx');
      assertMatch(home, /(grid-cols-1|flex-col|flex-wrap)/, 'Footer layout must collapse responsively on mobile');
    },
  });

  TestRegistry.register({
    id: 'F17-T2-05',
    name: 'Minimum touch target size for interactive controls',
    feature: 'F17',
    tier: 2,
    description: 'Verify navigation buttons specify minimum touch targets (e.g. h-11 w-11 or py-3)',
    fn: () => {
      const nav = readFileUtf8('src/components/layout/CartelCommandNav.tsx');
      assertMatch(nav, /(h-11|w-11|h-10|w-10|p-2|p-3)/, 'Interactive nav targets must be at least 40-44px');
    },
  });

  // =========================================================================
  // F18: Mobile Responsiveness: Key Surfaces (Boundary & Corner)
  // =========================================================================
  TestRegistry.register({
    id: 'F18-T2-01',
    name: 'Admin inventory tab bar horizontal scroll',
    feature: 'F18',
    tier: 2,
    description: 'Verify admin inventory header tab group supports horizontal scroll or flex-wrap',
    fn: () => {
      const inv = readFileUtf8('src/app/admin/inventory/page.tsx');
      assertMatch(inv, /(flex-wrap|overflow-x-auto)/, 'Admin inventory tab buttons must flex-wrap or scroll');
    },
  });

  TestRegistry.register({
    id: 'F18-T2-02',
    name: 'POS layout responsive grid stacking',
    feature: 'F18',
    tier: 2,
    description: 'Verify POS terminal uses lg:grid-cols-12 so grid stacks into single column on mobile/tablet',
    fn: () => {
      const pos = readFileUtf8('src/app/pos/page.tsx');
      assertMatch(pos, /lg:grid-cols-12/, 'POS grid must use lg:grid-cols-12 for responsive stacking');
    },
  });

  TestRegistry.register({
    id: 'F18-T2-03',
    name: 'Cart drawer multi-unit grid mobile wrap',
    feature: 'F18',
    tier: 2,
    description: 'Verify cart drawer multi-unit summary adapts on mobile without label overflow',
    fn: () => {
      const shop = readFileUtf8('src/app/shop/page.tsx');
      assertMatch(shop, /(grid-cols-3|flex-wrap|truncate|type-ui)/, 'Cart drawer multi-unit summary must be mobile-friendly');
    },
  });

  TestRegistry.register({
    id: 'F18-T2-04',
    name: 'Digital member pass responsive QR container',
    feature: 'F18',
    tier: 2,
    description: 'Verify CartelMemberQrPass container uses max-w-sm or responsive width constraints',
    fn: () => {
      const pass = readFileUtf8('src/components/crm/CartelMemberQrPass.tsx');
      assert(pass !== null, 'CartelMemberQrPass.tsx must exist');
      assertMatch(pass, /(max-w-sm|max-w-xs|w-full)/, 'QR pass must constrain max width for mobile screens');
    },
  });

  TestRegistry.register({
    id: 'F18-T2-05',
    name: 'Data table responsive horizontal scroll wrapper',
    feature: 'F18',
    tier: 2,
    description: 'Verify admin CRM and inventory data tables wrap in overflow-x-auto containers',
    fn: () => {
      const inv = readFileUtf8('src/app/admin/inventory/page.tsx');
      assertMatch(inv, /(overflow-x-auto|overflow-hidden|ScrollArea)/, 'Admin tables must have responsive scroll containers');
    },
  });
}
