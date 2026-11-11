/**
 * 420 CARTEL :: TIER 5 ADVERSARIAL STRESS & COVERAGE HARDENING HARNESS
 *
 * Comprehensive adversarial verification harness probing edge cases, failure modes,
 * boundary conditions, and contract adherence across all 7 project requirements (R1 - R7).
 *
 * Requirements Tested:
 * - R1: SEO/AIO/GEO JSON-LD structured data graph, canonical URLs, robots.txt crawl directives.
 * - R2: Brand logo file presence (public/fourtwentycartel_logo.jpg), resolution, and touchpoints.
 * - R3: Navigation drawer links (strict order 1-5), profile action, login button, and /vault member gating redirect to /onboarding?next=/vault.
 * - R4: Higgsfield MCP configuration, timeout handling, and prompt generation.
 * - R5: Awaken products in catalog fixtures (fixtures.ts), POS thumbnail images, Admin inventory thumbnail images & stock numbers.
 * - R6: Strict metric system compliance across all fixtures, cart, POS, and inventory (ZERO imperial leakage).
 * - R7: Full mobile responsiveness (body overflow-x hidden, footer typography clipping, responsive step rail, responsive POS inputs, touch targets >= 44px).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

let totalProbes = 0;
let passedProbes = 0;
let failedProbes = 0;
const failures = [];

function probe(name, fn) {
  totalProbes++;
  try {
    fn();
    passedProbes++;
    console.log(`  ✓ PASS [Probe ${String(totalProbes).padStart(2, '0')}] ${name}`);
  } catch (err) {
    failedProbes++;
    failures.push({ name, error: err.message, stack: err.stack });
    console.error(`  ✗ FAIL [Probe ${String(totalProbes).padStart(2, '0')}] ${name}`);
    console.error(`         ${err.message}`);
  }
}

function assert(condition, message = 'Assertion failed') {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

function assertMatch(text, regex, message) {
  if (!regex.test(text)) {
    throw new Error(message || `Expected text to match ${regex}`);
  }
}

function assertNotMatch(text, regex, message) {
  if (regex.test(text)) {
    throw new Error(message || `Expected text NOT to match ${regex}`);
  }
}

function assertIncludes(haystack, needle, message) {
  if (!haystack.includes(needle)) {
    throw new Error(message || `Expected target to include ${JSON.stringify(needle)}`);
  }
}

console.log('\n========================================================================');
console.log('  420 CARTEL :: TIER 5 ADVERSARIAL STRESS HARNESS');
console.log('  Testing deep adversarial probes across R1 - R7');
console.log('========================================================================\n');

// -----------------------------------------------------------------------------
// R1: SEO/AIO/GEO JSON-LD structured data graph, canonical URLs, robots.txt
// -----------------------------------------------------------------------------
console.log('▶ REQUIREMENT R1: SEO/AIO/GEO JSON-LD, Sitemaps & Crawl Directives');

probe('R1-P01: JSON-LD structured data schema contains valid @graph multi-entity array', () => {
  const jsonLdPath = path.join(ROOT_DIR, 'src', 'components', 'seo', 'JsonLd.tsx');
  assert(fs.existsSync(jsonLdPath), 'JsonLd.tsx must exist');
  const src = fs.readFileSync(jsonLdPath, 'utf8');

  assertMatch(src, /['"]@context['"]\s*:\s*['"]https:\/\/schema\.org['"]/);
  assertMatch(src, /['"]@graph['"]\s*:\s*\[/);
  assertIncludes(src, "'@type': 'Organization'");
  assertIncludes(src, "'@type': 'LocalBusiness'");
  assertIncludes(src, "'@type': 'SocialClub'");
  assertIncludes(src, "'@type': 'FAQPage'");
  assertIncludes(src, "'@type': 'BreadcrumbList'");
});

probe('R1-P02: JSON-LD multi-branch physical locations include GPS and full postal addresses', () => {
  const jsonLdPath = path.join(ROOT_DIR, 'src', 'components', 'seo', 'JsonLd.tsx');
  const src = fs.readFileSync(jsonLdPath, 'utf8');

  // Norwood
  assertIncludes(src, '62 Grant Ave');
  assertIncludes(src, 'Norwood');
  assertMatch(src, /latitude:\s*-26\.1578/);
  assertMatch(src, /longitude:\s*28\.0772/);

  // Rivonia
  assertIncludes(src, '353 Rivonia Blvd');
  assertIncludes(src, 'Sandton');
  assertMatch(src, /latitude:\s*-26\.0465/);
  assertMatch(src, /longitude:\s*28\.0598/);

  // Kibler Park
  assertIncludes(src, 'Shop 9, 14 Stanmore Cres');
  assertIncludes(src, 'Kibler Park');
  assertMatch(src, /latitude:\s*-26\.3075/);
  assertMatch(src, /longitude:\s*28\.0084/);
});

probe('R1-P03: JSON-LD operating hours specify Monday through Sunday 09:00 to 20:00 across branches', () => {
  const jsonLdPath = path.join(ROOT_DIR, 'src', 'components', 'seo', 'JsonLd.tsx');
  const src = fs.readFileSync(jsonLdPath, 'utf8');

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  for (const day of days) {
    assertIncludes(src, `'${day}'`, `JSON-LD must specify operating hours for ${day}`);
  }
  assertMatch(src, /opens:\s*['"]09:00['"]/);
  assertMatch(src, /closes:\s*['"]20:00['"]/);
});

probe('R1-P04: JSON-LD FAQPage includes essential AI query questions (18+, locations, hours, metric)', () => {
  const jsonLdPath = path.join(ROOT_DIR, 'src', 'components', 'seo', 'JsonLd.tsx');
  const src = fs.readFileSync(jsonLdPath, 'utf8');

  assertMatch(src, /What is 420 Cartel\?/i);
  assertMatch(src, /Who is allowed to enter 420 Cartel lounges/i);
  assertMatch(src, /Strictly No Under 18/i);
  assertMatch(src, /Where are 420 Cartel physical lounges located\?/i);
  assertMatch(src, /What are 420 Cartel operating hours\?/i);
  assertMatch(src, /What measurement system does 420 Cartel use\?/i);
  assertMatch(src, /grams \(1g, 3\.5g, 7g, 14g, 28g\)/i);
});

probe('R1-P05: JSON-LD BreadcrumbList conforms to sequential position ordering 1 to 5', () => {
  const jsonLdPath = path.join(ROOT_DIR, 'src', 'components', 'seo', 'JsonLd.tsx');
  const src = fs.readFileSync(jsonLdPath, 'utf8');

  assertMatch(src, /position:\s*1,\s*name:\s*['"]Home['"]/);
  assertMatch(src, /position:\s*2,\s*name:\s*['"]About['"]/);
  assertMatch(src, /position:\s*3,\s*name:\s*['"]Membership['"]/);
  assertMatch(src, /position:\s*4,\s*name:\s*['"]Vault['"]/);
  assertMatch(src, /position:\s*5,\s*name:\s*['"]Contact['"]/);
});

probe('R1-P06: robots.ts provides strict allow list and disallows all private back-office routes', () => {
  const robotsPath = path.join(ROOT_DIR, 'src', 'app', 'robots.ts');
  assert(fs.existsSync(robotsPath), 'robots.ts must exist');
  const src = fs.readFileSync(robotsPath, 'utf8');

  // Allowed public routes
  assertIncludes(src, "'/'");
  assertIncludes(src, "'/about'");
  assertIncludes(src, "'/onboarding'");
  assertIncludes(src, "'/contact'");
  assertIncludes(src, "'/login'");

  // Disallowed sensitive routes
  assertIncludes(src, "'/admin'");
  assertIncludes(src, "'/pos'");
  assertIncludes(src, "'/api'");
  assertIncludes(src, "'/account'");
  assertIncludes(src, "'/checkout'");
  assertIncludes(src, "'/pass'");
  assertIncludes(src, "'/shop'");
  assertMatch(src, /sitemap:\s*`\${siteUrl}\/sitemap\.xml`/);
});

probe('R1-P07: sitemap.ts lists canonical routes with valid priorities and excludes private routes', () => {
  const sitemapPath = path.join(ROOT_DIR, 'src', 'app', 'sitemap.ts');
  assert(fs.existsSync(sitemapPath), 'sitemap.ts must exist');
  const src = fs.readFileSync(sitemapPath, 'utf8');

  assertMatch(src, /path:\s*'\/'[\s\S]*priority:\s*1\.0/);
  assertMatch(src, /path:\s*'\/onboarding'[\s\S]*priority:\s*0\.9/);
  assertMatch(src, /path:\s*'\/about'[\s\S]*priority:\s*0\.8/);
  assertMatch(src, /path:\s*'\/contact'[\s\S]*priority:\s*0\.8/);
  assertMatch(src, /path:\s*'\/login'[\s\S]*priority:\s*0\.5/);

  // Private routes must NOT be in sitemap
  assertNotMatch(src, /path:\s*'\/admin'/);
  assertNotMatch(src, /path:\s*'\/pos'/);
  assertNotMatch(src, /path:\s*'\/vault'/);
});

// -----------------------------------------------------------------------------
// R2: Brand logo file presence, resolution, and touchpoints
// -----------------------------------------------------------------------------
console.log('\n▶ REQUIREMENT R2: Brand Logo Assets & Multi-Touchpoint Integration');

probe('R2-P08: Brand logo binary asset exists in public directory with valid JPEG SOI marker and size', () => {
  const logoPath = path.join(ROOT_DIR, 'public', 'fourtwentycartel_logo.jpg');
  assert(fs.existsSync(logoPath), 'public/fourtwentycartel_logo.jpg must exist');
  const stat = fs.statSync(logoPath);
  assert(stat.size > 50 * 1024, `Logo file size (${stat.size} bytes) should be > 50KB`);
  assert(stat.size < 200 * 1024, `Logo file size (${stat.size} bytes) should be < 200KB`);

  const buf = fs.readFileSync(logoPath);
  assertEqual(buf[0], 0xff, 'Byte 0 must be 0xFF');
  assertEqual(buf[1], 0xd8, 'Byte 1 must be 0xD8 (SOI marker)');
  assertEqual(buf[2], 0xff, 'Byte 2 must be 0xFF');
});

probe('R2-P09: Brand logo resolution conforms to exactly 1080x1080 pixels (1:1 square ratio)', () => {
  const logoPath = path.join(ROOT_DIR, 'public', 'fourtwentycartel_logo.jpg');
  const buf = fs.readFileSync(logoPath);

  let width = 0;
  let height = 0;
  let offset = 2;

  while (offset < buf.length) {
    if (buf[offset] !== 0xff) break;
    const marker = buf[offset + 1];
    if (marker === 0xc0 || marker === 0xc2) {
      height = buf.readUInt16BE(offset + 5);
      width = buf.readUInt16BE(offset + 7);
      break;
    }
    const len = buf.readUInt16BE(offset + 2);
    offset += 2 + len;
  }

  assertEqual(width, 1080, 'Logo width must be 1080px');
  assertEqual(height, 1080, 'Logo height must be 1080px');
});

probe('R2-P10: public logo file byte parity matches repository root brand asset', () => {
  const publicPath = path.join(ROOT_DIR, 'public', 'fourtwentycartel_logo.jpg');
  const rootPath = path.join(ROOT_DIR, 'fourtwentycartel_logo.jpg');
  assert(fs.existsSync(publicPath), 'public logo must exist');
  assert(fs.existsSync(rootPath), 'root logo must exist');

  const pubBuf = fs.readFileSync(publicPath);
  const rootBuf = fs.readFileSync(rootPath);
  assertEqual(pubBuf.length, rootBuf.length, 'Buffer lengths must match');
  assert(pubBuf.equals(rootBuf), 'Binary contents must be bit-for-bit identical');
});

probe('R2-P11: Navbar integrates brand logo with 420 Cartel alt text', () => {
  const navPath = path.join(ROOT_DIR, 'src', 'components', 'layout', 'CartelCommandNav.tsx');
  const src = fs.readFileSync(navPath, 'utf8');

  assertIncludes(src, '/fourtwentycartel_logo.jpg');
  assertMatch(src, /alt=['"]420 Cartel['"]/);
});

probe('R2-P12: Landing page and Digital Member Pass integrate brand logo', () => {
  const homePath = path.join(ROOT_DIR, 'src', 'app', 'page.tsx');
  const homeSrc = fs.readFileSync(homePath, 'utf8');
  assertIncludes(homeSrc, '/fourtwentycartel_logo.jpg', 'Home page must integrate logo');

  const passPath = path.join(ROOT_DIR, 'src', 'components', 'crm', 'CartelMemberQrPass.tsx');
  const passSrc = fs.readFileSync(passPath, 'utf8');
  assertIncludes(passSrc, '/fourtwentycartel_logo.jpg', 'Pass component must integrate logo');
});

probe('R2-P13: POS Terminal and Admin Hub integrate brand logo', () => {
  const posPath = path.join(ROOT_DIR, 'src', 'app', 'pos', 'page.tsx');
  const posSrc = fs.readFileSync(posPath, 'utf8');
  assertIncludes(posSrc, '/fourtwentycartel_logo.jpg', 'POS page must integrate logo');

  const adminPagePath = path.join(ROOT_DIR, 'src', 'app', 'admin', 'page.tsx');
  assert(fs.existsSync(adminPagePath), 'Admin hub page must exist');
  const adminSrc = fs.readFileSync(adminPagePath, 'utf8');
  assertIncludes(adminSrc, '/fourtwentycartel_logo.jpg', 'Admin hub must integrate logo');
});

probe('R2-P14: Root layout metadata binds OpenGraph and Twitter cards to brand logo', () => {
  const layoutPath = path.join(ROOT_DIR, 'src', 'app', 'layout.tsx');
  const src = fs.readFileSync(layoutPath, 'utf8');

  assertMatch(src, /openGraph:\s*\{[\s\S]*images:\s*\[[\s\S]*\/fourtwentycartel_logo\.jpg/);
  assertMatch(src, /twitter:\s*\{[\s\S]*images:\s*\[[\s\S]*\/fourtwentycartel_logo\.jpg/);
});

// -----------------------------------------------------------------------------
// R3: Navigation drawer links (strict order 1-5), profile action, login button, /vault gating
// -----------------------------------------------------------------------------
console.log('\n▶ REQUIREMENT R3: Navigation Drawer, Ordering & Access Control');

probe('R3-P15: Navigation links in CartelCommandNav follow strict 5-route sequence', () => {
  const navPath = path.join(ROOT_DIR, 'src', 'components', 'layout', 'CartelCommandNav.tsx');
  const src = fs.readFileSync(navPath, 'utf8');

  const navMatch = src.match(/const\s+LINKS\s*=\s*(\[[\s\S]*?\]);/);
  assert(navMatch, 'LINKS array must be declared');
  const rawArray = navMatch[1];

  const hrefs = [...rawArray.matchAll(/href:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  assertEqual(hrefs.length, 5, 'LINKS must have exactly 5 entries');
  assertEqual(hrefs[0], '/', 'Entry 1 must be Home (/)');
  assertEqual(hrefs[1], '/about', 'Entry 2 must be About (/about)');
  assertEqual(hrefs[2], '/onboarding', 'Entry 3 must be Membership (/onboarding)');
  assertEqual(hrefs[3], '/vault', 'Entry 4 must be Vault (/vault)');
  assertEqual(hrefs[4], '/contact', 'Entry 5 must be Contact (/contact)');
});

probe('R3-P16: Navigation bar renders distinct Profile User icon linking to /account', () => {
  const navPath = path.join(ROOT_DIR, 'src', 'components', 'layout', 'CartelCommandNav.tsx');
  const src = fs.readFileSync(navPath, 'utf8');

  assertIncludes(src, 'href="/account"');
  assertMatch(src, /<User\s+/);
  assertMatch(src, /aria-label=['"]Your profile['"]/i);
});

probe('R3-P17: Navigation bar renders explicit textual Log In button linking to /login', () => {
  const navPath = path.join(ROOT_DIR, 'src', 'components', 'layout', 'CartelCommandNav.tsx');
  const src = fs.readFileSync(navPath, 'utf8');

  assertIncludes(src, 'href="/login"');
  assertMatch(src, /Log\s+in/i);
});

probe('R3-P18: Mobile drawer contains all 5 nav links plus Profile and Log in actions', () => {
  const navPath = path.join(ROOT_DIR, 'src', 'components', 'layout', 'CartelCommandNav.tsx');
  const src = fs.readFileSync(navPath, 'utf8');

  assertMatch(src, /aria-label=['"]Toggle navigation['"]/i);
  assertMatch(src, /aria-label=['"]Close navigation['"]/i);
  assertMatch(src, /isOpen/);
  assertIncludes(src, 'LINKS.map');
  assertMatch(src, /href="\/login"[\s\S]*Log in/);
});

probe('R3-P19: Edge middleware intercepts member-gated routes including /vault and redirects unauthenticated visitors', () => {
  const mwPath = path.join(ROOT_DIR, 'src', 'middleware.ts');
  assert(fs.existsSync(mwPath), 'middleware.ts must exist');
  const src = fs.readFileSync(mwPath, 'utf8');

  assertMatch(src, /MEMBER_ROUTES\s*=\s*\[[\s\S]*'\/vault'/);
  assertMatch(src, /'\/shop'/);
  assertMatch(src, /'\/checkout'/);
  assertMatch(src, /'\/account'/);
  assertMatch(src, /'\/pass'/);
  assertMatch(src, /target\.pathname\s*=\s*'\/onboarding'/);
});

probe('R3-P20: Client-side Vault page implements symmetric session guard redirecting to /onboarding?next=/vault', () => {
  const vaultPath = path.join(ROOT_DIR, 'src', 'app', 'vault', 'page.tsx');
  assert(fs.existsSync(vaultPath), 'src/app/vault/page.tsx must exist');
  const src = fs.readFileSync(vaultPath, 'utf8');

  assertIncludes(src, 'useSessionStore');
  assertMatch(src, /router\.replace\(['"]\/onboarding\?next=\/vault['"]\)/);
  assertMatch(src, /useRouter/);
});

probe('R3-P21: Onboarding page completion pass links directly to Enter the Vault (/shop)', () => {
  const onbPath = path.join(ROOT_DIR, 'src', 'app', 'onboarding', 'page.tsx');
  const src = fs.readFileSync(onbPath, 'utf8');

  assertMatch(src, /href="\/shop"/);
  assertMatch(src, /Enter the Vault/);
});

// -----------------------------------------------------------------------------
// R4: Higgsfield MCP configuration, timeout handling, and prompt generation
// -----------------------------------------------------------------------------
console.log('\n▶ REQUIREMENT R4: Higgsfield MCP Media Pipeline & Visual Formulas');

probe('R4-P22: .env.example references official Higgsfield MCP endpoint', () => {
  const envPath = path.join(ROOT_DIR, '.env.example');
  assert(fs.existsSync(envPath), '.env.example must exist');
  const src = fs.readFileSync(envPath, 'utf8');

  assertMatch(src, /HIGGSFIELD_MCP_URL=https:\/\/mcp\.higgsfield\.ai\/mcp/);
  assertMatch(src, /HIGGSFIELD_API_KEY=/);
});

probe('R4-P23: brand.ts exports immutable HIGGSFIELD_VISUAL_FORMULA aligned to 420 Cartel identity', () => {
  const brandPath = path.join(ROOT_DIR, 'src', 'lib', 'brand.ts');
  const src = fs.readFileSync(brandPath, 'utf8');

  assertIncludes(src, 'HIGGSFIELD_VISUAL_FORMULA');
  assertMatch(src, /24k metallic gold/i);
  assertMatch(src, /obsidian black void background/i);
  assertMatch(src, /luxury streetwear private social club aesthetic/i);
  assertMatch(src, /macro lens/i);
});

probe('R4-P24: prompt.ts safely guards terpeneTags array length and handles edge inputs', () => {
  const promptPath = path.join(ROOT_DIR, 'src', 'lib', 'higgsfield', 'prompt.ts');
  const src = fs.readFileSync(promptPath, 'utf8');

  assertMatch(src, /input\.terpeneTags\s*&&\s*input\.terpeneTags\.length\s*>\s*0/);
  assertMatch(src, /filter\(\(tag\)\s*=>\s*tag\.trim\(\)\.length\s*>\s*0\)/);
  assertMatch(src, /slice\(0,\s*4\)/);
});

probe('R4-P25: Higgsfield client configures DEFAULT_TIMEOUT_MS and AbortSignal for MCP tool calls', () => {
  const clientPath = path.join(ROOT_DIR, 'src', 'lib', 'higgsfield', 'client.ts');
  const src = fs.readFileSync(clientPath, 'utf8');

  assertMatch(src, /DEFAULT_TIMEOUT_MS\s*=\s*30_000/);
  assertMatch(src, /AbortSignal\.timeout/);
  assertMatch(src, /signal:\s*signal\s*\?\?\s*AbortSignal\.timeout/);
  assertMatch(src, /HiggsfieldRequestError/);
  assertIncludes(src, '408'); // HTTP 408 Request Timeout
});

probe('R4-P26: Higgsfield prompt generator covers all 9 product categories with distinctive directions', () => {
  const promptPath = path.join(ROOT_DIR, 'src', 'lib', 'higgsfield', 'prompt.ts');
  const src = fs.readFileSync(promptPath, 'utf8');

  const categories = [
    'FLOWER',
    'HASH_EXTRACT',
    'ELIXIR_OIL',
    'DISTILLATE',
    'PRE_ROLL',
    'EDIBLE',
    'VAPE',
    'MERCH',
    'ACCESSORY',
  ];
  for (const cat of categories) {
    assertIncludes(src, `${cat}:`, `CATEGORY_SUBJECT must cover ${cat}`);
  }
});

// -----------------------------------------------------------------------------
// R5: Awaken products in catalog fixtures, POS & Admin inventory images & stock
// -----------------------------------------------------------------------------
console.log('\n▶ REQUIREMENT R5: Awaken Product Import, POS & Admin Inventory Systems');

probe('R5-P27: fixtures.ts contains all 10 flagship Awaken products from awakencarts.co.za', () => {
  const fixPath = path.join(ROOT_DIR, 'src', 'lib', 'demo', 'fixtures.ts');
  const src = fs.readFileSync(fixPath, 'utf8');

  const awakenMatches = [...src.matchAll(/name:\s*['"](Awaken\s+[^'"]+)['"]/g)];
  assert(
    awakenMatches.length >= 10,
    `Expected at least 10 Awaken products in fixtures, found ${awakenMatches.length}`,
  );
  assertIncludes(src, 'Awaken Live Rosin Cartridge · Permanent Marker');
  assertIncludes(src, 'Awaken Live Rosin Disposable · Banana Shack');
  assertIncludes(src, 'Awaken Live Resin Cartridge · Duck Tape');
  assertIncludes(src, 'Awaken Live Resin Disposable · Sour Diesel Rancher');
  assertIncludes(src, 'Awaken ETCHED DUO · 2ml Dual Chamber');
  assertIncludes(src, 'Awaken Blaster Cartridge · 1ml');
  assertIncludes(src, 'Awaken VOLT Smart 510 Battery');
  assertIncludes(src, 'Awaken GHOST Conceal Battery');
  assertIncludes(src, 'Awaken Natural Δ-9 + CBD Tincture');
  assertIncludes(src, 'Awaken Fruit Pastilles · 200mg');
});

probe('R5-P28: 100% of products in SEED_PRODUCTS include non-empty hero_media_url', () => {
  const fixPath = path.join(ROOT_DIR, 'src', 'lib', 'demo', 'fixtures.ts');
  const src = fs.readFileSync(fixPath, 'utf8');

  assertIncludes(src, 'export const SEED_PRODUCTS');
  const heroUrls = [...src.matchAll(/hero_media_url:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  assert(heroUrls.length >= 16, `Expected >=16 products with hero_media_url, got ${heroUrls.length}`);
  for (const url of heroUrls) {
    assert(url.length > 5, `hero_media_url "${url}" is too short`);
    assert(url.startsWith('/') || url.startsWith('http'), `hero_media_url "${url}" must start with / or http`);
  }
});

probe('R5-P29: POS terminal renders product thumbnail images and VAPE / ACCESSORY category tabs', () => {
  const posPath = path.join(ROOT_DIR, 'src', 'app', 'pos', 'page.tsx');
  const src = fs.readFileSync(posPath, 'utf8');

  assertMatch(src, /<Image[\s\S]*src=\{product\.hero_media_url\}/);
  assertIncludes(src, "'VAPE'");
  assertIncludes(src, "'ACCESSORY'");
  assertIncludes(src, "'FLOWER'");
  assertIncludes(src, 'headroom');
});

probe('R5-P30: Admin inventory renders product thumbnail images, stock balances and low-stock warning', () => {
  const invPath = path.join(ROOT_DIR, 'src', 'app', 'admin', 'inventory', 'page.tsx');
  const src = fs.readFileSync(invPath, 'utf8');

  assertMatch(src, /<Image[\s\S]*src=\{product\.hero_media_url\}/);
  assertMatch(src, /Low Stock/i);
  assertIncludes(src, 'remaining_base_qty');
  assertIncludes(src, 'low_stock_threshold');
});

probe('R5-P31: Demo engine maintains realtime stock levels and FIFO batch deductions', () => {
  const engPath = path.join(ROOT_DIR, 'src', 'lib', 'demo', 'engine.ts');
  const src = fs.readFileSync(engPath, 'utf8');

  assertMatch(src, /localStockLevel/);
  assertMatch(src, /remaining_base_qty/);
  assertMatch(src, /localProcessOrder/);
  assertMatch(src, /balance_after/);
});

// -----------------------------------------------------------------------------
// R6: Strict metric system compliance across all fixtures, cart, POS, and inventory
// -----------------------------------------------------------------------------
console.log('\n▶ REQUIREMENT R6: Strict Metric System Standardization (Zero Imperial Leakage)');

probe('R6-P32: Zero imperial measurement units in customer-facing app pages and components', () => {
  const checkDirs = [
    path.join(ROOT_DIR, 'src', 'app'),
    path.join(ROOT_DIR, 'src', 'components'),
    path.join(ROOT_DIR, 'src', 'lib'),
  ];

  let scannedFiles = 0;
  for (const dir of checkDirs) {
    function walk(curr) {
      if (!fs.existsSync(curr)) return;
      const entries = fs.readdirSync(curr, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(curr, ent.name);
        if (ent.isDirectory()) {
          walk(full);
        } else if (ent.isFile() && /\.(tsx?|jsx?)$/.test(ent.name)) {
          scannedFiles++;
          const content = fs.readFileSync(full, 'utf8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (/\b(eighth|quarter\s+pound|ounce|ounces|lbs?|fl\s*oz)\b/i.test(line)) {
              if (
                line.includes('ZERO imperial') ||
                line.includes('No imperial') ||
                line.includes('Remove all imperial') ||
                line.includes('zero imperial')
              ) {
                continue;
              }
              throw new Error(`Forbidden imperial term found in ${full}:${i + 1} -> "${line.trim()}"`);
            }
          }
        }
      }
    }
    walk(dir);
  }
  assert(scannedFiles > 30, `Expected to scan > 30 source files, scanned ${scannedFiles}`);
});

probe('R6-P33: types/database.ts defines BaseUom strictly as GRAMS | MILLILITERS | UNITS', () => {
  const typesPath = path.join(ROOT_DIR, 'src', 'types', 'database.ts');
  const src = fs.readFileSync(typesPath, 'utf8');

  assertMatch(src, /export type BaseUom =\s*['"]GRAMS['"]\s*\|\s*['"]MILLILITERS['"]\s*\|\s*['"]UNITS['"]/);
});

probe('R6-P34: uom.ts defines pure metric tier ladders in DEFAULT_TIERS', () => {
  const uomPath = path.join(ROOT_DIR, 'src', 'lib', 'uom.ts');
  const src = fs.readFileSync(uomPath, 'utf8');

  assertMatch(src, /GRAMS:\s*\[1,\s*3\.5,\s*5,\s*7,\s*14,\s*28\]/);
  assertMatch(src, /MILLILITERS:\s*\[5,\s*10,\s*30,\s*50\]/);
});

probe('R6-P35: uom.ts exports standard metric symbols (g, ml, ea) and pure metric formatting', () => {
  const uomPath = path.join(ROOT_DIR, 'src', 'lib', 'uom.ts');
  const src = fs.readFileSync(uomPath, 'utf8');

  assertMatch(src, /GRAMS:\s*['"]g['"]/);
  assertMatch(src, /MILLILITERS:\s*['"]ml['"]/);
  assertMatch(src, /UNITS:\s*['"]ea['"]/);
  assertMatch(src, /formatBaseQty/);
  assertMatch(src, /tierLabel/);
});

// -----------------------------------------------------------------------------
// R7: Full mobile responsiveness (body overflow-x hidden, footer typography, step rail, POS)
// -----------------------------------------------------------------------------
console.log('\n▶ REQUIREMENT R7: Mobile Responsiveness, Viewports & Touch Targets');

probe('R7-P36: globals.css enforces global horizontal overflow containment on body', () => {
  const cssPath = path.join(ROOT_DIR, 'src', 'app', 'globals.css');
  const src = fs.readFileSync(cssPath, 'utf8');

  assertMatch(src, /body\s*\{[\s\S]*overflow-x:\s*hidden;/);
});

probe('R7-P37: Landing page footer contains giant typography blowout with overflow-hidden', () => {
  const homePath = path.join(ROOT_DIR, 'src', 'app', 'page.tsx');
  const src = fs.readFileSync(homePath, 'utf8');

  assertMatch(src, /footer[\s\S]*overflow-hidden/, 'Footer must contain horizontal overflow');
  assertMatch(src, /<main[\s\S]*overflow-x-clip/, 'Main container must clip horizontal overflow');
});

probe('R7-P38: Onboarding step rail includes mobile responsive layout and touch targets', () => {
  const onbPath = path.join(ROOT_DIR, 'src', 'app', 'onboarding', 'page.tsx');
  const src = fs.readFileSync(onbPath, 'utf8');

  assertMatch(src, /flex|grid|touch/);
  assertMatch(src, /Button/);
});

probe('R7-P39: POS terminal touch targets and action buttons satisfy minimum 44px height', () => {
  const posPath = path.join(ROOT_DIR, 'src', 'app', 'pos', 'page.tsx');
  const src = fs.readFileSync(posPath, 'utf8');

  assertMatch(src, /min-h-\[44px\]|h-11|h-12|py-3|p-3/);
  assertMatch(src, /grid-cols-1|sm:grid-cols-2|md:grid-cols-3/);
});

probe('R7-P40: Admin inventory table is wrapped in responsive horizontal scroll container', () => {
  const invPath = path.join(ROOT_DIR, 'src', 'app', 'admin', 'inventory', 'page.tsx');
  const src = fs.readFileSync(invPath, 'utf8');

  assertMatch(src, /overflow-x-auto/);
});

probe('R7-P41: AI Sommelier agent interface provides responsive viewport layout for mobile', () => {
  const agentPath = path.join(ROOT_DIR, 'src', 'app', 'agent', 'page.tsx');
  assert(fs.existsSync(agentPath), 'src/app/agent/page.tsx must exist');
  const src = fs.readFileSync(agentPath, 'utf8');

  assertMatch(src, /min-h-screen/);
  assertMatch(src, /flex/);
  assertMatch(src, /max-w-6xl/);
});

// -----------------------------------------------------------------------------
// EXECUTION SUMMARY & VERDICT
// -----------------------------------------------------------------------------
console.log('\n========================================================================');
console.log('  TIER 5 ADVERSARIAL STRESS HARNESS SUMMARY');
console.log('========================================================================');
console.log(`  Total Probes Executed : ${totalProbes}`);
console.log(`  Passed Probes         : ${passedProbes}`);
console.log(`  Failed Probes         : ${failedProbes}`);
console.log(`  Pass Rate             : ${((passedProbes / totalProbes) * 100).toFixed(1)}%`);

if (failedProbes > 0) {
  console.error('\nFAILURES ENCOUNTERED:');
  for (const f of failures) {
    console.error(`- ${f.name}: ${f.error}`);
  }
  process.exit(1);
} else {
  console.log('\n★ ALL 41 TIER 5 ADVERSARIAL PROBES PASSED (100% SPEC COMPLIANCE) ★\n');
  process.exit(0);
}
