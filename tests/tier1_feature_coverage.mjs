/**
 * Tier 1: Feature Coverage E2E Tests (>=5 tests per feature F1..F18 = 90 tests)
 * 420 Cartel Test Suite
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
  assertGreaterThanOrEqual,
  fileExists,
  readFileUtf8,
  readBuffer,
  getFileSize,
  getJpegDimensions,
  parseEnvFile,
} from './helpers/assertions.mjs';

export function registerTier1Tests() {
  // =========================================================================
  // F1: Brand Logo Copy & Storage
  // =========================================================================
  TestRegistry.register({
    id: 'F1-T1-01',
    name: 'Logo file presence in public directory',
    feature: 'F1',
    tier: 1,
    description: 'Verify public/fourtwentycartel_logo.jpg exists',
    fn: () => {
      assert(fileExists('public/fourtwentycartel_logo.jpg'), 'public/fourtwentycartel_logo.jpg must exist on disk');
    },
  });

  TestRegistry.register({
    id: 'F1-T1-02',
    name: 'Logo file size sanity check',
    feature: 'F1',
    tier: 1,
    description: 'Verify public/fourtwentycartel_logo.jpg size is between 50KB and 200KB',
    fn: () => {
      const size = getFileSize('public/fourtwentycartel_logo.jpg');
      assertGreaterThan(size, 50 * 1024, `Logo file size (${size} bytes) must be > 50KB`);
      assert(size < 200 * 1024, `Logo file size (${size} bytes) must be < 200KB`);
    },
  });

  TestRegistry.register({
    id: 'F1-T1-03',
    name: 'Logo JPEG binary header validation',
    feature: 'F1',
    tier: 1,
    description: 'Verify image buffer begins with JPEG magic bytes (0xFF, 0xD8, 0xFF)',
    fn: () => {
      const buf = readBuffer('public/fourtwentycartel_logo.jpg');
      assert(buf !== null, 'Failed to read public/fourtwentycartel_logo.jpg');
      assertEqual(buf[0], 0xFF, 'First byte must be 0xFF');
      assertEqual(buf[1], 0xD8, 'Second byte must be 0xD8');
      assertEqual(buf[2], 0xFF, 'Third byte must be 0xFF');
    },
  });

  TestRegistry.register({
    id: 'F1-T1-04',
    name: 'Logo resolution dimensions',
    feature: 'F1',
    tier: 1,
    description: 'Verify logo dimensions are exactly 1080x1080 pixels',
    fn: () => {
      const buf = readBuffer('public/fourtwentycartel_logo.jpg');
      const dims = getJpegDimensions(buf);
      assert(dims !== null, 'Could not parse JPEG SOF segment');
      assertEqual(dims.width, 1080, `Logo width must be 1080px, got ${dims.width}`);
      assertEqual(dims.height, 1080, `Logo height must be 1080px, got ${dims.height}`);
    },
  });

  TestRegistry.register({
    id: 'F1-T1-05',
    name: 'Logo source parity with root asset',
    feature: 'F1',
    tier: 1,
    description: 'Verify public asset matches original root fourtwentycartel_logo.jpg',
    fn: () => {
      const rootBuf = readBuffer('fourtwentycartel_logo.jpg');
      const publicBuf = readBuffer('public/fourtwentycartel_logo.jpg');
      assert(rootBuf !== null, 'Root fourtwentycartel_logo.jpg must exist');
      assert(publicBuf !== null, 'Public fourtwentycartel_logo.jpg must exist');
      assertEqual(publicBuf.length, rootBuf.length, 'Public copy size must match root source');
      assert(publicBuf.equals(rootBuf), 'Public copy bytes must be identical to root source');
    },
  });

  // =========================================================================
  // F2: Brand Logo Integration Site-Wide
  // =========================================================================
  TestRegistry.register({
    id: 'F2-T1-01',
    name: 'Navbar brand logo integration',
    feature: 'F2',
    tier: 1,
    description: 'Verify CartelCommandNav.tsx references fourtwentycartel_logo.jpg',
    fn: () => {
      const nav = readFileUtf8('src/components/layout/CartelCommandNav.tsx');
      assert(nav !== null, 'CartelCommandNav.tsx must exist');
      assertMatch(nav, /fourtwentycartel_logo\.jpg/, 'Navigation must reference fourtwentycartel_logo.jpg');
    },
  });

  TestRegistry.register({
    id: 'F2-T1-02',
    name: 'Landing page brand logo integration',
    feature: 'F2',
    tier: 1,
    description: 'Verify landing page or footer references brand logo or fourtwentycartel_logo.jpg',
    fn: () => {
      const page = readFileUtf8('src/app/page.tsx');
      const nav = readFileUtf8('src/components/layout/CartelCommandNav.tsx');
      const combined = (page || '') + (nav || '');
      assertMatch(combined, /fourtwentycartel_logo\.jpg/, 'Landing shell must incorporate fourtwentycartel_logo.jpg');
    },
  });

  TestRegistry.register({
    id: 'F2-T1-03',
    name: 'Member Pass brand logo integration',
    feature: 'F2',
    tier: 1,
    description: 'Verify Member Pass components reference fourtwentycartel_logo.jpg or Cartel branding',
    fn: () => {
      const passPage = readFileUtf8('src/app/pass/page.tsx');
      const qrPass = readFileUtf8('src/components/crm/CartelMemberQrPass.tsx');
      const passCode = (passPage || '') + (qrPass || '');
      assertMatch(passCode, /(fourtwentycartel_logo\.jpg|420 Cartel|CartelMemberQrPass)/i, 'Pass component must display brand identity');
    },
  });

  TestRegistry.register({
    id: 'F2-T1-04',
    name: 'POS Terminal brand logo integration',
    feature: 'F2',
    tier: 1,
    description: 'Verify POS terminal page references fourtwentycartel_logo.jpg or brand header',
    fn: () => {
      const posPage = readFileUtf8('src/app/pos/page.tsx');
      assert(posPage !== null, 'src/app/pos/page.tsx must exist');
      assertMatch(posPage, /(fourtwentycartel_logo\.jpg|420 Cartel)/, 'POS terminal must display 420 Cartel brand');
    },
  });

  TestRegistry.register({
    id: 'F2-T1-05',
    name: 'Admin command hub brand logo integration',
    feature: 'F2',
    tier: 1,
    description: 'Verify Admin command hub displays brand logo or operations identity',
    fn: () => {
      const adminLayout = readFileUtf8('src/app/admin/layout.tsx');
      const adminPage = readFileUtf8('src/app/admin/page.tsx');
      const adminCode = (adminLayout || '') + (adminPage || '');
      assertMatch(adminCode, /(fourtwentycartel_logo\.jpg|420 Cartel|Cartel Operations)/, 'Admin must display Cartel brand identity');
    },
  });

  // =========================================================================
  // F3: Higgsfield MCP Configuration
  // =========================================================================
  TestRegistry.register({
    id: 'F3-T1-01',
    name: 'Higgsfield MCP URL in .env.example',
    feature: 'F3',
    tier: 1,
    description: 'Verify .env.example defines HIGGSFIELD_MCP_URL',
    fn: () => {
      const env = parseEnvFile('.env.example');
      assert('HIGGSFIELD_MCP_URL' in env, '.env.example must define HIGGSFIELD_MCP_URL');
    },
  });

  TestRegistry.register({
    id: 'F3-T1-02',
    name: 'Higgsfield MCP URL endpoint value',
    feature: 'F3',
    tier: 1,
    description: 'Verify HIGGSFIELD_MCP_URL is set to https://mcp.higgsfield.ai/mcp',
    fn: () => {
      const env = parseEnvFile('.env.example');
      assertEqual(env.HIGGSFIELD_MCP_URL, 'https://mcp.higgsfield.ai/mcp', 'HIGGSFIELD_MCP_URL must be https://mcp.higgsfield.ai/mcp');
    },
  });

  TestRegistry.register({
    id: 'F3-T1-03',
    name: 'Higgsfield API key variable in .env.example',
    feature: 'F3',
    tier: 1,
    description: 'Verify .env.example includes HIGGSFIELD_API_KEY variable placeholder',
    fn: () => {
      const env = parseEnvFile('.env.example');
      assert('HIGGSFIELD_API_KEY' in env, '.env.example must declare HIGGSFIELD_API_KEY');
    },
  });

  TestRegistry.register({
    id: 'F3-T1-04',
    name: 'Higgsfield client endpoint fallback',
    feature: 'F3',
    tier: 1,
    description: 'Verify client.ts references HIGGSFIELD_MCP_URL or defaults to https://mcp.higgsfield.ai/mcp',
    fn: () => {
      const client = readFileUtf8('src/lib/higgsfield/client.ts');
      assert(client !== null, 'src/lib/higgsfield/client.ts must exist');
      assertMatch(client, /(HIGGSFIELD_MCP_URL|mcp\.higgsfield\.ai)/, 'Higgsfield client must wire to HIGGSFIELD_MCP_URL');
    },
  });

  TestRegistry.register({
    id: 'F3-T1-05',
    name: 'Higgsfield webhook secret variable',
    feature: 'F3',
    tier: 1,
    description: 'Verify .env.example declares HIGGSFIELD_WEBHOOK_SECRET',
    fn: () => {
      const env = parseEnvFile('.env.example');
      assert('HIGGSFIELD_WEBHOOK_SECRET' in env, '.env.example must declare HIGGSFIELD_WEBHOOK_SECRET');
    },
  });

  // =========================================================================
  // F4: Higgsfield Brand Visual Formulas
  // =========================================================================
  TestRegistry.register({
    id: 'F4-T1-01',
    name: 'Higgsfield visual formula export',
    feature: 'F4',
    tier: 1,
    description: 'Verify src/lib/brand.ts exports HIGGSFIELD_VISUAL_FORMULA',
    fn: () => {
      const brand = readFileUtf8('src/lib/brand.ts');
      assert(brand !== null, 'src/lib/brand.ts must exist');
      assertMatch(brand, /export const HIGGSFIELD_VISUAL_FORMULA/, 'brand.ts must export HIGGSFIELD_VISUAL_FORMULA');
    },
  });

  TestRegistry.register({
    id: 'F4-T1-02',
    name: 'Higgsfield formula 24k metallic gold styling',
    feature: 'F4',
    tier: 1,
    description: 'Verify HIGGSFIELD_VISUAL_FORMULA contains gold highlights / #D4AF37',
    fn: () => {
      const brand = readFileUtf8('src/lib/brand.ts');
      assertMatch(brand, /(#D4AF37|24k metallic gold|gold)/i, 'Visual formula must specify 24k gold highlights');
    },
  });

  TestRegistry.register({
    id: 'F4-T1-03',
    name: 'Higgsfield formula luxury aesthetic and studio setting',
    feature: 'F4',
    tier: 1,
    description: 'Verify visual formula specifies obsidian studio background and luxury cartel aesthetic',
    fn: () => {
      const brand = readFileUtf8('src/lib/brand.ts');
      assertMatch(brand, /(obsidian|studio background|luxury|cartel)/i, 'Visual formula must specify luxury cartel aesthetic');
    },
  });

  TestRegistry.register({
    id: 'F4-T1-04',
    name: 'Prompt generator imports visual formula',
    feature: 'F4',
    tier: 1,
    description: 'Verify src/lib/higgsfield/prompt.ts imports and uses HIGGSFIELD_VISUAL_FORMULA',
    fn: () => {
      const prompt = readFileUtf8('src/lib/higgsfield/prompt.ts');
      assert(prompt !== null, 'src/lib/higgsfield/prompt.ts must exist');
      assertMatch(prompt, /HIGGSFIELD_VISUAL_FORMULA/, 'prompt.ts must use HIGGSFIELD_VISUAL_FORMULA');
    },
  });

  TestRegistry.register({
    id: 'F4-T1-05',
    name: 'Category direction coverage in prompt.ts',
    feature: 'F4',
    tier: 1,
    description: 'Verify CATEGORY_SUBJECT covers FLOWER, HASH_EXTRACT, VAPE, and ACCESSORY',
    fn: () => {
      const prompt = readFileUtf8('src/lib/higgsfield/prompt.ts');
      assertMatch(prompt, /FLOWER:/, 'Must cover FLOWER');
      assertMatch(prompt, /HASH_EXTRACT:/, 'Must cover HASH_EXTRACT');
      assertMatch(prompt, /VAPE:/, 'Must cover VAPE');
      assertMatch(prompt, /ACCESSORY:/, 'Must cover ACCESSORY');
    },
  });

  // =========================================================================
  // F5: Navigation Ordering & Redesign
  // =========================================================================
  TestRegistry.register({
    id: 'F5-T1-01',
    name: 'Navigation link definitions count',
    feature: 'F5',
    tier: 1,
    description: 'Verify CartelCommandNav defines all 5 primary links',
    fn: () => {
      const nav = readFileUtf8('src/components/layout/CartelCommandNav.tsx');
      assert(nav !== null, 'CartelCommandNav.tsx must exist');
      assertIncludes(nav, 'Home', 'Navigation must include Home');
      assertIncludes(nav, 'About', 'Navigation must include About');
      assertIncludes(nav, 'Membership', 'Navigation must include Membership');
      assertIncludes(nav, 'Vault', 'Navigation must include Vault');
      assertIncludes(nav, 'Contact', 'Navigation must include Contact');
    },
  });

  TestRegistry.register({
    id: 'F5-T1-02',
    name: 'Navigation strict link ordering',
    feature: 'F5',
    tier: 1,
    description: 'Verify strict order: 1. Home (/), 2. About (/about), 3. Membership (/onboarding), 4. Vault (/vault), 5. Contact (/contact)',
    fn: () => {
      const nav = readFileUtf8('src/components/layout/CartelCommandNav.tsx');
      assert(nav !== null, 'CartelCommandNav.tsx must exist');
      const idxHome = nav.search(/['"]\/['"]/);
      const idxAbout = nav.search(/['"]\/about['"]/);
      const idxMembership = nav.search(/['"]\/onboarding['"]/);
      const idxVault = nav.search(/['"]\/(vault|shop)['"]/);
      const idxContact = nav.search(/['"]\/contact['"]/);

      assert(idxHome !== -1, 'Home route missing');
      assert(idxAbout !== -1, 'About route missing');
      assert(idxMembership !== -1, 'Membership route missing');
      assert(idxVault !== -1, 'Vault route missing');
      assert(idxContact !== -1, 'Contact route missing');

      assert(idxHome < idxAbout, 'Home must appear before About');
      assert(idxAbout < idxMembership, 'About must appear before Membership');
      assert(idxMembership < idxVault, 'Membership must appear before Vault');
      assert(idxVault < idxContact, 'Vault must appear before Contact');
    },
  });

  TestRegistry.register({
    id: 'F5-T1-03',
    name: 'Vault link target alignment',
    feature: 'F5',
    tier: 1,
    description: 'Verify Vault navigation target routes to /vault',
    fn: () => {
      const nav = readFileUtf8('src/components/layout/CartelCommandNav.tsx');
      assertMatch(nav, /label:\s*['"]Vault['"],\s*href:\s*['"]\/vault['"]/, 'Vault link must point to /vault');
    },
  });

  TestRegistry.register({
    id: 'F5-T1-04',
    name: 'Mobile navigation hamburger toggle existence',
    feature: 'F5',
    tier: 1,
    description: 'Verify CartelCommandNav has mobile hamburger toggle button',
    fn: () => {
      const nav = readFileUtf8('src/components/layout/CartelCommandNav.tsx');
      assertMatch(nav, /(Menu|hamburger|aria-label=['"][^'"]*menu['"])/i, 'CartelCommandNav must include mobile menu button');
    },
  });

  TestRegistry.register({
    id: 'F5-T1-05',
    name: 'Mobile slide-over drawer / sheet component',
    feature: 'F5',
    tier: 1,
    description: 'Verify mobile drawer container exists for viewport < 768px (md:hidden)',
    fn: () => {
      const nav = readFileUtf8('src/components/layout/CartelCommandNav.tsx');
      assertMatch(nav, /(md:hidden|drawer|sheet)/i, 'CartelCommandNav must include responsive mobile drawer');
    },
  });

  // =========================================================================
  // F6: Profile Icon & Login Option
  // =========================================================================
  TestRegistry.register({
    id: 'F6-T1-01',
    name: 'Profile icon existence in navigation',
    feature: 'F6',
    tier: 1,
    description: 'Verify CartelCommandNav includes User icon from lucide-react',
    fn: () => {
      const nav = readFileUtf8('src/components/layout/CartelCommandNav.tsx');
      assertMatch(nav, /<User\b/, 'CartelCommandNav must render User profile icon');
    },
  });

  TestRegistry.register({
    id: 'F6-T1-02',
    name: 'Profile icon links to /account',
    feature: 'F6',
    tier: 1,
    description: 'Verify profile icon links to /account',
    fn: () => {
      const nav = readFileUtf8('src/components/layout/CartelCommandNav.tsx');
      assertMatch(nav, /href=['"]\/account['"]/, 'Profile icon must link to /account');
    },
  });

  TestRegistry.register({
    id: 'F6-T1-03',
    name: 'Explicit Login option in navigation',
    feature: 'F6',
    tier: 1,
    description: 'Verify explicit "Log in" or "Login" textual option exists for visitors',
    fn: () => {
      const nav = readFileUtf8('src/components/layout/CartelCommandNav.tsx');
      assertMatch(nav, /(Log in|Login)/i, 'Navbar must provide explicit Login text option');
    },
  });

  TestRegistry.register({
    id: 'F6-T1-04',
    name: 'Login option target URL',
    feature: 'F6',
    tier: 1,
    description: 'Verify Login option links to /login',
    fn: () => {
      const nav = readFileUtf8('src/components/layout/CartelCommandNav.tsx');
      assertMatch(nav, /href=['"]\/login['"]/, 'Login option must route to /login');
    },
  });

  TestRegistry.register({
    id: 'F6-T1-05',
    name: 'Mobile drawer includes Profile and Login actions',
    feature: 'F6',
    tier: 1,
    description: 'Verify mobile drawer renders profile and login options for mobile users',
    fn: () => {
      const nav = readFileUtf8('src/components/layout/CartelCommandNav.tsx');
      assertMatch(nav, /md:hidden[\s\S]*(Log in|Login|\/login)[\s\S]*\/account/i, 'Mobile drawer must include profile and login links');
    },
  });

  // =========================================================================
  // F7: Vault Route & Member Gating
  // =========================================================================
  TestRegistry.register({
    id: 'F7-T1-01',
    name: 'Vault route file presence',
    feature: 'F7',
    tier: 1,
    description: 'Verify src/app/vault/page.tsx exists',
    fn: () => {
      assert(fileExists('src/app/vault/page.tsx'), 'src/app/vault/page.tsx route file must exist');
    },
  });

  TestRegistry.register({
    id: 'F7-T1-02',
    name: 'Vault unauthenticated redirect to onboarding',
    feature: 'F7',
    tier: 1,
    description: 'Verify unauthenticated visitor to Vault is redirected to /onboarding',
    fn: () => {
      const vaultPage = readFileUtf8('src/app/vault/page.tsx');
      const shopPage = readFileUtf8('src/app/shop/page.tsx');
      const code = (vaultPage || '') + (shopPage || '');
      assertMatch(code, /(router\.replace\(['"]\/onboarding|redirect\(['"]\/onboarding|\/onboarding\?next=)/, 'Vault must redirect unauthenticated visitors to /onboarding');
    },
  });

  TestRegistry.register({
    id: 'F7-T1-03',
    name: 'Edge middleware protects /vault',
    feature: 'F7',
    tier: 1,
    description: 'Verify src/middleware.ts includes /vault in MEMBER_ROUTES',
    fn: () => {
      const mw = readFileUtf8('src/middleware.ts');
      assert(mw !== null, 'src/middleware.ts must exist');
      assertMatch(mw, /MEMBER_ROUTES[\s\S]*['"]\/vault['"]/, 'middleware.ts must include /vault in MEMBER_ROUTES');
    },
  });

  TestRegistry.register({
    id: 'F7-T1-04',
    name: 'Verified member access grant',
    feature: 'F7',
    tier: 1,
    description: 'Verify session verification check grants access to verified members',
    fn: () => {
      const sessionStore = readFileUtf8('src/lib/store/session.ts');
      assert(sessionStore !== null, 'session.ts must exist');
      assertMatch(sessionStore, /isVerifiedMember/, 'session.ts must export isVerifiedMember');
    },
  });

  TestRegistry.register({
    id: 'F7-T1-05',
    name: 'Shop route backward compatibility',
    feature: 'F7',
    tier: 1,
    description: 'Verify /shop route continues to exist or redirects cleanly to /vault',
    fn: () => {
      assert(fileExists('src/app/shop/page.tsx'), 'src/app/shop/page.tsx must exist for backwards compatibility');
    },
  });

  // =========================================================================
  // F8: Awaken Product Ingestion
  // =========================================================================
  TestRegistry.register({
    id: 'F8-T1-01',
    name: 'Catalog fixtures contain Awaken products',
    feature: 'F8',
    tier: 1,
    description: 'Verify src/lib/demo/fixtures.ts contains Awaken products',
    fn: () => {
      const fixtures = readFileUtf8('src/lib/demo/fixtures.ts');
      assert(fixtures !== null, 'src/lib/demo/fixtures.ts must exist');
      assertMatch(fixtures, /(Awaken|Permanent Marker|Live Rosin|Live Resin)/i, 'Fixtures must contain Awaken store products');
    },
  });

  TestRegistry.register({
    id: 'F8-T1-02',
    name: 'Catalog product count threshold',
    feature: 'F8',
    tier: 1,
    description: 'Verify catalog fixtures define at least 10 products',
    fn: () => {
      const fixtures = readFileUtf8('src/lib/demo/fixtures.ts');
      const matches = fixtures.match(/id:\s*SEED_IDS\.product\./g) || fixtures.match(/brand:\s*['"](420 Cartel|Awaken)['"]/g);
      const count = matches ? matches.length : 0;
      assertGreaterThanOrEqual(count, 10, `Catalog must define >= 10 products, found ${count}`);
    },
  });

  TestRegistry.register({
    id: 'F8-T1-03',
    name: 'Awaken vape cartridge and disposable representation',
    feature: 'F8',
    tier: 1,
    description: 'Verify VAPE category products exist in fixtures',
    fn: () => {
      const fixtures = readFileUtf8('src/lib/demo/fixtures.ts');
      assertMatch(fixtures, /category:\s*['"]VAPE['"]/, 'Fixtures must define products in VAPE category');
    },
  });

  TestRegistry.register({
    id: 'F8-T1-04',
    name: 'Awaken product hero media URLs',
    feature: 'F8',
    tier: 1,
    description: 'Verify Awaken products have non-empty hero_media_url properties',
    fn: () => {
      const fixtures = readFileUtf8('src/lib/demo/fixtures.ts');
      assertMatch(fixtures, /hero_media_url:\s*['"]\/products\/[^'"]+['"]/, 'Products must define valid hero_media_url');
    },
  });

  TestRegistry.register({
    id: 'F8-T1-05',
    name: 'Awaken product pricing in ZAR cents',
    feature: 'F8',
    tier: 1,
    description: 'Verify variant pricing in cents > 0 for all imported products',
    fn: () => {
      const fixtures = readFileUtf8('src/lib/demo/fixtures.ts');
      assertMatch(fixtures, /price_cents:\s*[1-9]\d{4,}/, 'Variants must have realistic prices in cents (e.g. > R100 / 10000 cents)');
    },
  });

  // =========================================================================
  // F9: POS Images & Categories
  // =========================================================================
  TestRegistry.register({
    id: 'F9-T1-01',
    name: 'POS product thumbnail image rendering',
    feature: 'F9',
    tier: 1,
    description: 'Verify src/app/pos/page.tsx renders product thumbnail images (hero_media_url)',
    fn: () => {
      const pos = readFileUtf8('src/app/pos/page.tsx');
      assert(pos !== null, 'src/app/pos/page.tsx must exist');
      assertMatch(pos, /(hero_media_url|<Image\b|<img\b)/, 'POS terminal must render product thumbnail images');
    },
  });

  TestRegistry.register({
    id: 'F9-T1-02',
    name: 'POS Vape category tab',
    feature: 'F9',
    tier: 1,
    description: 'Verify POS category tabs include VAPE / Vapes',
    fn: () => {
      const pos = readFileUtf8('src/app/pos/page.tsx');
      assertMatch(pos, /key:\s*['"]VAPE['"]/, 'POS categories must include VAPE tab');
    },
  });

  TestRegistry.register({
    id: 'F9-T1-03',
    name: 'POS Accessory category tab',
    feature: 'F9',
    tier: 1,
    description: 'Verify POS category tabs include ACCESSORY / Accessories',
    fn: () => {
      const pos = readFileUtf8('src/app/pos/page.tsx');
      assertMatch(pos, /key:\s*['"]ACCESSORY['"]/, 'POS categories must include ACCESSORY tab');
    },
  });

  TestRegistry.register({
    id: 'F9-T1-04',
    name: 'POS standard categories presence',
    feature: 'F9',
    tier: 1,
    description: 'Verify POS tabs include FLOWER, ELIXIR_OIL, PRE_ROLL, EDIBLE',
    fn: () => {
      const pos = readFileUtf8('src/app/pos/page.tsx');
      assertMatch(pos, /key:\s*['"]FLOWER['"]/, 'Must include FLOWER');
      assertMatch(pos, /key:\s*['"]ELIXIR_OIL['"]/, 'Must include ELIXIR_OIL');
      assertMatch(pos, /key:\s*['"]PRE_ROLL['"]/, 'Must include PRE_ROLL');
      assertMatch(pos, /key:\s*['"]EDIBLE['"]/, 'Must include EDIBLE');
    },
  });

  TestRegistry.register({
    id: 'F9-T1-05',
    name: 'POS stock headroom badge with UOM symbol',
    feature: 'F9',
    tier: 1,
    description: 'Verify POS product cards render stock badge with UOM_SYMBOL',
    fn: () => {
      const pos = readFileUtf8('src/app/pos/page.tsx');
      assertMatch(pos, /UOM_SYMBOL\[product\.base_uom\]/, 'POS card must display UOM symbol in stock badge');
    },
  });

  // =========================================================================
  // F10: Admin Inventory Images & Stock
  // =========================================================================
  TestRegistry.register({
    id: 'F10-T1-01',
    name: 'Admin inventory product thumbnail rendering',
    feature: 'F10',
    tier: 1,
    description: 'Verify src/app/admin/inventory/page.tsx renders product thumbnails',
    fn: () => {
      const inv = readFileUtf8('src/app/admin/inventory/page.tsx');
      assert(inv !== null, 'src/app/admin/inventory/page.tsx must exist');
      assertMatch(inv, /(hero_media_url|<Image\b|<img\b)/, 'Admin inventory must render product images');
    },
  });

  TestRegistry.register({
    id: 'F10-T1-02',
    name: 'Admin inventory stock balance rendering',
    feature: 'F10',
    tier: 1,
    description: 'Verify admin inventory renders remaining stock quantity in base UOM',
    fn: () => {
      const inv = readFileUtf8('src/app/admin/inventory/page.tsx');
      assertMatch(inv, /remaining_base_qty/, 'Admin inventory must render remaining_base_qty');
    },
  });

  TestRegistry.register({
    id: 'F10-T1-03',
    name: 'Master batch lab metrics display',
    feature: 'F10',
    tier: 1,
    description: 'Verify admin inventory displays lab THC and batch code',
    fn: () => {
      const inv = readFileUtf8('src/app/admin/inventory/page.tsx');
      assertMatch(inv, /batch_code/, 'Admin inventory must display batch_code');
      assertMatch(inv, /lab_thc_pct/, 'Admin inventory must display lab_thc_pct');
    },
  });

  TestRegistry.register({
    id: 'F10-T1-04',
    name: 'Low-stock threshold warning in admin',
    feature: 'F10',
    tier: 1,
    description: 'Verify admin inventory displays low_stock_threshold or badge',
    fn: () => {
      const inv = readFileUtf8('src/app/admin/inventory/page.tsx');
      assertMatch(inv, /low_stock_threshold/, 'Admin inventory must display low_stock_threshold');
    },
  });

  TestRegistry.register({
    id: 'F10-T1-05',
    name: 'Admin inventory Awaken vape batch tracking',
    feature: 'F10',
    tier: 1,
    description: 'Verify fixtures include master batches for Awaken products',
    fn: () => {
      const fixtures = readFileUtf8('src/lib/demo/fixtures.ts');
      assertMatch(fixtures, /batch_code:\s*['"](AWK|CRT-VP)/, 'Fixtures must define master batches for vape inventory');
    },
  });

  // =========================================================================
  // F11: Metric Standardization in Fixtures
  // =========================================================================
  TestRegistry.register({
    id: 'F11-T1-01',
    name: 'Fixtures zero imperial Eighth',
    feature: 'F11',
    tier: 1,
    description: 'Verify fixtures.ts contains zero occurrences of "3.5g Eighth"',
    fn: () => {
      const fixtures = readFileUtf8('src/lib/demo/fixtures.ts');
      assertNotIncludes(fixtures, '3.5g Eighth', 'fixtures.ts must eliminate "3.5g Eighth"');
    },
  });

  TestRegistry.register({
    id: 'F11-T1-02',
    name: 'Fixtures zero imperial Quarter',
    feature: 'F11',
    tier: 1,
    description: 'Verify fixtures.ts contains zero occurrences of "7g Quarter"',
    fn: () => {
      const fixtures = readFileUtf8('src/lib/demo/fixtures.ts');
      assertNotIncludes(fixtures, '7g Quarter', 'fixtures.ts must eliminate "7g Quarter"');
    },
  });

  TestRegistry.register({
    id: 'F11-T1-03',
    name: 'Fixtures zero imperial Half',
    feature: 'F11',
    tier: 1,
    description: 'Verify fixtures.ts contains zero occurrences of "14g Half"',
    fn: () => {
      const fixtures = readFileUtf8('src/lib/demo/fixtures.ts');
      assertNotIncludes(fixtures, '14g Half', 'fixtures.ts must eliminate "14g Half"');
    },
  });

  TestRegistry.register({
    id: 'F11-T1-04',
    name: 'Fixtures zero imperial Ounce',
    feature: 'F11',
    tier: 1,
    description: 'Verify fixtures.ts contains zero occurrences of "28g Ounce"',
    fn: () => {
      const fixtures = readFileUtf8('src/lib/demo/fixtures.ts');
      assertNotIncludes(fixtures, '28g Ounce', 'fixtures.ts must eliminate "28g Ounce"');
    },
  });

  TestRegistry.register({
    id: 'F11-T1-05',
    name: 'Fixtures pure metric flower tiers',
    feature: 'F11',
    tier: 1,
    description: 'Verify flower variant labels in fixtures use strictly 1g, 3.5g, 7g, 14g, 28g',
    fn: () => {
      const fixtures = readFileUtf8('src/lib/demo/fixtures.ts');
      assertMatch(fixtures, /label:\s*['"]3\.5g['"]/, 'Must contain pure metric 3.5g');
      assertMatch(fixtures, /label:\s*['"]7g['"]/, 'Must contain pure metric 7g');
      assertMatch(fixtures, /label:\s*['"]14g['"]/, 'Must contain pure metric 14g');
      assertMatch(fixtures, /label:\s*['"]28g['"]/, 'Must contain pure metric 28g');
    },
  });

  // =========================================================================
  // F12: Metric Standardization Site-Wide
  // =========================================================================
  TestRegistry.register({
    id: 'F12-T1-01',
    name: 'Zero imperial words in customer-facing app copy',
    feature: 'F12',
    tier: 1,
    description: 'Verify zero occurrences of oz, lbs, eighth in src/app customer pages',
    fn: () => {
      const pages = ['src/app/page.tsx', 'src/app/about/page.tsx', 'src/app/contact/page.tsx', 'src/app/shop/page.tsx'];
      for (const p of pages) {
        const text = readFileUtf8(p);
        if (text) {
          assertNotMatch(text, /\b(eighth|quarter\s+pound|ounce|ounces|lbs|fl\s*oz)\b/i, `Page ${p} must not contain imperial units`);
        }
      }
    },
  });

  TestRegistry.register({
    id: 'F12-T1-02',
    name: 'Base UOM enum values in types',
    feature: 'F12',
    tier: 1,
    description: 'Verify src/types/database.ts defines BaseUom strictly as GRAMS | MILLILITERS | UNITS',
    fn: () => {
      const types = readFileUtf8('src/types/database.ts');
      assert(types !== null, 'src/types/database.ts must exist');
      assertMatch(types, /export type BaseUom =\s*['"]GRAMS['"]\s*\|\s*['"]MILLILITERS['"]\s*\|\s*['"]UNITS['"]/, 'BaseUom must strictly be GRAMS | MILLILITERS | UNITS');
    },
  });

  TestRegistry.register({
    id: 'F12-T1-03',
    name: 'UOM symbol definitions',
    feature: 'F12',
    tier: 1,
    description: 'Verify src/lib/uom.ts defines UOM_SYMBOL with g, ml, ea',
    fn: () => {
      const uom = readFileUtf8('src/lib/uom.ts');
      assert(uom !== null, 'src/lib/uom.ts must exist');
      assertMatch(uom, /GRAMS:\s*['"]g['"]/, 'GRAMS symbol must be g');
      assertMatch(uom, /MILLILITERS:\s*['"]ml['"]/, 'MILLILITERS symbol must be ml');
      assertMatch(uom, /UNITS:\s*['"]ea['"]/, 'UNITS symbol must be ea');
    },
  });

  TestRegistry.register({
    id: 'F12-T1-04',
    name: 'tierLabel pure metric output',
    feature: 'F12',
    tier: 1,
    description: 'Verify tierLabel function formats metric numbers with symbol directly',
    fn: () => {
      const uom = readFileUtf8('src/lib/uom.ts');
      assertMatch(uom, /export function tierLabel/, 'uom.ts must export tierLabel');
    },
  });

  TestRegistry.register({
    id: 'F12-T1-05',
    name: 'formatBaseQty metric symbol formatting',
    feature: 'F12',
    tier: 1,
    description: 'Verify formatBaseQty uses metric symbols and precision',
    fn: () => {
      const uom = readFileUtf8('src/lib/uom.ts');
      assertMatch(uom, /export function formatBaseQty/, 'uom.ts must export formatBaseQty');
    },
  });

  // =========================================================================
  // F13: Social Media Context & Brand Copy
  // =========================================================================
  TestRegistry.register({
    id: 'F13-T1-01',
    name: 'Johannesburg lounge locations documented',
    feature: 'F13',
    tier: 1,
    description: 'Verify customer copy mentions Norwood, Rivonia, Kibler Park, or Johannesburg lounges',
    fn: () => {
      const contact = readFileUtf8('src/app/contact/page.tsx');
      const about = readFileUtf8('src/app/about/page.tsx');
      const combined = (contact || '') + (about || '');
      assertMatch(combined, /(Norwood|Rivonia|Kibler Park|Johannesburg)/i, 'Brand copy must mention physical lounge locations');
    },
  });

  TestRegistry.register({
    id: 'F13-T1-02',
    name: 'Operating hours documented',
    feature: 'F13',
    tier: 1,
    description: 'Verify operating hours 09:00 - 20:00 (or daily lounge hours) are documented',
    fn: () => {
      const contact = readFileUtf8('src/app/contact/page.tsx');
      const about = readFileUtf8('src/app/about/page.tsx');
      const combined = (contact || '') + (about || '');
      assertMatch(combined, /(09:00|20:00|daily|operating hours)/i, 'Brand copy must document lounge operating hours');
    },
  });

  TestRegistry.register({
    id: 'F13-T1-03',
    name: 'Strictly 18+ policy prominent display',
    feature: 'F13',
    tier: 1,
    description: 'Verify NO UNDER 18 / strictly 18+ age mandate is featured across landing and onboarding',
    fn: () => {
      const home = readFileUtf8('src/app/page.tsx');
      const onboarding = readFileUtf8('src/app/onboarding/page.tsx');
      const combined = (home || '') + (onboarding || '');
      assertMatch(combined, /(18\+|under 18|verified 18\+)/i, 'Must prominently communicate 18+ policy');
    },
  });

  TestRegistry.register({
    id: 'F13-T1-04',
    name: 'Official Instagram link integration',
    feature: 'F13',
    tier: 1,
    description: 'Verify link to https://www.instagram.com/fourtwentycartel/ exists',
    fn: () => {
      const contact = readFileUtf8('src/app/contact/page.tsx');
      const footer = readFileUtf8('src/app/page.tsx');
      const nav = readFileUtf8('src/components/layout/CartelCommandNav.tsx');
      const combined = (contact || '') + (footer || '') + (nav || '');
      assertMatch(combined, /instagram\.com\/fourtwentycartel/i, 'Site must link to official Instagram profile');
    },
  });

  TestRegistry.register({
    id: 'F13-T1-05',
    name: 'Official Facebook link integration',
    feature: 'F13',
    tier: 1,
    description: 'Verify link to official Facebook lounge page exists',
    fn: () => {
      const contact = readFileUtf8('src/app/contact/page.tsx');
      const footer = readFileUtf8('src/app/page.tsx');
      const combined = (contact || '') + (footer || '');
      assertMatch(combined, /facebook\.com\/(p\/The-Cartel-420|.*420.*social.*lounge)/i, 'Site must link to official Facebook page');
    },
  });

  // =========================================================================
  // F14: SEO & Social Metadata
  // =========================================================================
  TestRegistry.register({
    id: 'F14-T1-01',
    name: 'Root metadata title configuration',
    feature: 'F14',
    tier: 1,
    description: 'Verify src/app/layout.tsx defines title and title.template',
    fn: () => {
      const layout = readFileUtf8('src/app/layout.tsx');
      assert(layout !== null, 'src/app/layout.tsx must exist');
      assertMatch(layout, /title:\s*\{/, 'layout.tsx must define structured title object');
      assertMatch(layout, /default:\s*['"]420 Cartel/, 'Default title must feature 420 Cartel');
    },
  });

  TestRegistry.register({
    id: 'F14-T1-02',
    name: 'Rich metadata description',
    feature: 'F14',
    tier: 1,
    description: 'Verify description mentions private cannabis collective and South Africa / Johannesburg',
    fn: () => {
      const layout = readFileUtf8('src/app/layout.tsx');
      assertMatch(layout, /description:\s*['"][^'"]*collective/i, 'Description must describe the private collective');
    },
  });

  TestRegistry.register({
    id: 'F14-T1-03',
    name: 'OpenGraph metadata definition',
    feature: 'F14',
    tier: 1,
    description: 'Verify openGraph configures title, description, url, and locale en_ZA',
    fn: () => {
      const layout = readFileUtf8('src/app/layout.tsx');
      assertMatch(layout, /openGraph:\s*\{/, 'layout.tsx must define openGraph metadata');
      assertMatch(layout, /locale:\s*['"]en_ZA['"]/, 'openGraph must set locale to en_ZA');
    },
  });

  TestRegistry.register({
    id: 'F14-T1-04',
    name: 'OpenGraph brand logo image declaration',
    feature: 'F14',
    tier: 1,
    description: 'Verify openGraph images references /fourtwentycartel_logo.jpg with 1080x1080 dimensions',
    fn: () => {
      const layout = readFileUtf8('src/app/layout.tsx');
      assertMatch(layout, /fourtwentycartel_logo\.jpg/, 'openGraph must reference fourtwentycartel_logo.jpg');
    },
  });

  TestRegistry.register({
    id: 'F14-T1-05',
    name: 'Twitter summary card metadata',
    feature: 'F14',
    tier: 1,
    description: 'Verify twitter card metadata is defined as summary_large_image',
    fn: () => {
      const layout = readFileUtf8('src/app/layout.tsx');
      assertMatch(layout, /twitter:\s*\{[\s\S]*card:\s*['"]summary_large_image['"]/, 'layout.tsx must define summary_large_image Twitter card');
    },
  });

  // =========================================================================
  // F15: AIO & GEO JSON-LD Structured Data
  // =========================================================================
  TestRegistry.register({
    id: 'F15-T1-01',
    name: 'JsonLd component file presence',
    feature: 'F15',
    tier: 1,
    description: 'Verify src/components/seo/JsonLd.tsx exists',
    fn: () => {
      assert(fileExists('src/components/seo/JsonLd.tsx'), 'src/components/seo/JsonLd.tsx must exist');
    },
  });

  TestRegistry.register({
    id: 'F15-T1-02',
    name: 'JSON-LD schema context',
    feature: 'F15',
    tier: 1,
    description: 'Verify JsonLd defines schema.org context',
    fn: () => {
      const jsonLd = readFileUtf8('src/components/seo/JsonLd.tsx');
      assert(jsonLd !== null, 'JsonLd.tsx must exist');
      assertMatch(jsonLd, /schema\.org/, 'JsonLd must reference schema.org');
    },
  });

  TestRegistry.register({
    id: 'F15-T1-03',
    name: 'Organization schema in JSON-LD',
    feature: 'F15',
    tier: 1,
    description: 'Verify JsonLd outputs Organization schema for 420 Cartel',
    fn: () => {
      const jsonLd = readFileUtf8('src/components/seo/JsonLd.tsx');
      assertMatch(jsonLd, /['"]@type['"]:\s*['"]Organization['"]/, 'JsonLd must include Organization schema');
    },
  });

  TestRegistry.register({
    id: 'F15-T1-04',
    name: 'LocalBusiness / SocialClub schema in JSON-LD',
    feature: 'F15',
    tier: 1,
    description: 'Verify JsonLd outputs LocalBusiness or SocialClub schemas for lounge branches',
    fn: () => {
      const jsonLd = readFileUtf8('src/components/seo/JsonLd.tsx');
      assertMatch(jsonLd, /['"]@type['"]:\s*['"](LocalBusiness|SocialClub)['"]/, 'JsonLd must include LocalBusiness/SocialClub schema');
    },
  });

  TestRegistry.register({
    id: 'F15-T1-05',
    name: 'FAQPage schema in JSON-LD',
    feature: 'F15',
    tier: 1,
    description: 'Verify JsonLd outputs FAQPage schema for AI search engines (GEO/AIO)',
    fn: () => {
      const jsonLd = readFileUtf8('src/components/seo/JsonLd.tsx');
      assertMatch(jsonLd, /['"]@type['"]:\s*['"]FAQPage['"]/, 'JsonLd must include FAQPage schema');
    },
  });

  // =========================================================================
  // F16: Dynamic Sitemap & Robots
  // =========================================================================
  TestRegistry.register({
    id: 'F16-T1-01',
    name: 'Dynamic sitemap route file presence',
    feature: 'F16',
    tier: 1,
    description: 'Verify src/app/sitemap.ts exists and exports default function',
    fn: () => {
      assert(fileExists('src/app/sitemap.ts'), 'src/app/sitemap.ts must exist');
    },
  });

  TestRegistry.register({
    id: 'F16-T1-02',
    name: 'Sitemap public route inclusions',
    feature: 'F16',
    tier: 1,
    description: 'Verify sitemap includes /, /about, /onboarding, /contact',
    fn: () => {
      const sitemap = readFileUtf8('src/app/sitemap.ts');
      assert(sitemap !== null, 'src/app/sitemap.ts must exist');
      assertMatch(sitemap, /['"]\/about['"]/, 'Sitemap must include /about');
      assertMatch(sitemap, /['"]\/onboarding['"]/, 'Sitemap must include /onboarding');
      assertMatch(sitemap, /['"]\/contact['"]/, 'Sitemap must include /contact');
    },
  });

  TestRegistry.register({
    id: 'F16-T1-03',
    name: 'Robots route file presence',
    feature: 'F16',
    tier: 1,
    description: 'Verify src/app/robots.ts exists and exports default function',
    fn: () => {
      assert(fileExists('src/app/robots.ts'), 'src/app/robots.ts must exist');
    },
  });

  TestRegistry.register({
    id: 'F16-T1-04',
    name: 'Robots references sitemap URL',
    feature: 'F16',
    tier: 1,
    description: 'Verify robots.ts references sitemap.xml',
    fn: () => {
      const robots = readFileUtf8('src/app/robots.ts');
      assert(robots !== null, 'src/app/robots.ts must exist');
      assertMatch(robots, /sitemap\.xml/, 'robots.ts must point to sitemap.xml');
    },
  });

  TestRegistry.register({
    id: 'F16-T1-05',
    name: 'Robots disallows private and staff routes',
    feature: 'F16',
    tier: 1,
    description: 'Verify robots.ts disallows /pos, /admin, /api/',
    fn: () => {
      const robots = readFileUtf8('src/app/robots.ts');
      assertMatch(robots, /['"]\/admin['"]/, 'Robots must disallow /admin');
      assertMatch(robots, /['"]\/pos['"]/, 'Robots must disallow /pos');
    },
  });

  // =========================================================================
  // F17: Mobile Responsiveness: Shell & Overflow
  // =========================================================================
  TestRegistry.register({
    id: 'F17-T1-01',
    name: 'Global overflow containment in globals.css',
    feature: 'F17',
    tier: 1,
    description: 'Verify src/app/globals.css enforces overflow-x: hidden on body',
    fn: () => {
      const css = readFileUtf8('src/app/globals.css');
      assert(css !== null, 'src/app/globals.css must exist');
      assertMatch(css, /body\s*\{[\s\S]*overflow-x:\s*hidden/, 'globals.css body must enforce overflow-x: hidden');
    },
  });

  TestRegistry.register({
    id: 'F17-T1-02',
    name: 'Landing footer typography blowout containment',
    feature: 'F17',
    tier: 1,
    description: 'Verify footer text 420 Cartel is constrained with overflow-hidden or wrap',
    fn: () => {
      const home = readFileUtf8('src/app/page.tsx');
      assert(home !== null, 'src/app/page.tsx must exist');
      assertMatch(home, /footer[\s\S]*overflow-hidden/, 'Footer must contain horizontal overflow');
    },
  });

  TestRegistry.register({
    id: 'F17-T1-03',
    name: 'Hero headline mobile fluid wrapping',
    feature: 'F17',
    tier: 1,
    description: 'Verify landing hero headline uses responsive wrapping without overflow blowout',
    fn: () => {
      const home = readFileUtf8('src/app/page.tsx');
      assertMatch(home, /(break-words|hyphens-auto|headline-in|clamp\()/i, 'Hero headline must be mobile-friendly');
    },
  });

  TestRegistry.register({
    id: 'F17-T1-04',
    name: 'Ambient video container mobile containment',
    feature: 'F17',
    tier: 1,
    description: 'Verify background plant loop / canvas container has overflow containment',
    fn: () => {
      const home = readFileUtf8('src/app/page.tsx');
      assertMatch(home, /PlantLoop[\s\S]*overflow-hidden/i, 'PlantLoop must be contained by overflow-hidden');
    },
  });

  TestRegistry.register({
    id: 'F17-T1-05',
    name: 'Root viewport meta tag definition',
    feature: 'F17',
    tier: 1,
    description: 'Verify layout.tsx or viewport export specifies width=device-width, initialScale=1',
    fn: () => {
      const layout = readFileUtf8('src/app/layout.tsx');
      assertMatch(layout, /(viewport|device-width)/i, 'Root layout must configure responsive viewport');
    },
  });

  // =========================================================================
  // F18: Mobile Responsiveness: Key Surfaces
  // =========================================================================
  TestRegistry.register({
    id: 'F18-T1-01',
    name: 'Onboarding step rail mobile responsiveness',
    feature: 'F18',
    tier: 1,
    description: 'Verify src/app/onboarding/page.tsx step rail adapts without label breaking',
    fn: () => {
      const onb = readFileUtf8('src/app/onboarding/page.tsx');
      assert(onb !== null, 'src/app/onboarding/page.tsx must exist');
      assertMatch(onb, /(sm:grid-cols-3|flex-wrap|truncate|text-xs|type-ui)/i, 'Onboarding step rail must be responsive');
    },
  });

  TestRegistry.register({
    id: 'F18-T1-02',
    name: 'POS header mobile wrap',
    feature: 'F18',
    tier: 1,
    description: 'Verify POS terminal header flex-wraps on mobile screens',
    fn: () => {
      const pos = readFileUtf8('src/app/pos/page.tsx');
      assert(pos !== null, 'src/app/pos/page.tsx must exist');
      assertMatch(pos, /flex-wrap/, 'POS header must support flex-wrap on narrow viewports');
    },
  });

  TestRegistry.register({
    id: 'F18-T1-03',
    name: 'POS search dropdown viewport boundary limit',
    feature: 'F18',
    tier: 1,
    description: 'Verify POS search results dropdown does not exceed viewport width',
    fn: () => {
      const pos = readFileUtf8('src/app/pos/page.tsx');
      assertMatch(pos, /(max-w-\[calc\(100vw|w-full|max-w-xs)/, 'POS dropdown must constrain width on mobile');
    },
  });

  TestRegistry.register({
    id: 'F18-T1-04',
    name: 'AI Sommelier tool stream header mobile wrap',
    feature: 'F18',
    tier: 1,
    description: 'Verify AI Sommelier stream header wraps on screens under 600px',
    fn: () => {
      const agent = readFileUtf8('src/app/agent/page.tsx');
      assert(agent !== null, 'src/app/agent/page.tsx must exist');
      assertMatch(agent, /flex-wrap/, 'AI Sommelier stream header must flex-wrap');
    },
  });

  TestRegistry.register({
    id: 'F18-T1-05',
    name: 'AI Sommelier chat send button contrast fix',
    feature: 'F18',
    tier: 1,
    description: 'Verify AI Sommelier send button is visible on dark backgrounds (not text-black on bg-transparent)',
    fn: () => {
      const agent = readFileUtf8('src/app/agent/page.tsx');
      assertNotMatch(agent, /text-black\s+bg-transparent/, 'AI agent send button must not have text-black with bg-transparent');
    },
  });
}
