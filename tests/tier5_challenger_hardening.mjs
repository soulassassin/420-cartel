/**
 * Phase 2 :: Milestone Final Challenger 2: Adversarial Coverage Hardening (Tier 5)
 * 
 * Target: 420 Cartel Modernization (Feature F20)
 * 
 * Probes:
 * 1. Exhaustive Imperial Unit Elimination (Scan all 85+ source files in src/, verify pure metric tiers 1g, 3.5g, 7g, 14g, 28g).
 * 2. Brand Logo & Visual Integrity (public/fourtwentycartel_logo.jpg binary validation 1080x1080, presence in Nav, Pass, POS, Admin).
 * 3. Member Gating & Route Protection (/vault redirect to /onboarding?next=/vault, Edge middleware protection).
 * 4. Awaken Catalog Ingestion (10 Awaken products, Google Cloud Storage images, ZAR pricing, POS & Admin thumbnail rendering).
 * 5. Mobile Responsiveness (globals.css body overflow-x: hidden, footer overflow-hidden, touch targets >= 44px).
 * 6. Higgsfield AI Media Pipeline (timeout configuration, AbortSignal propagation, terpene array guard, visual formula).
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

console.log('========================================================================');
console.log('  CHALLENGER 2 :: TIER 5 ADVERSARIAL COVERAGE HARDENING HARNESS');
console.log('  420 Cartel Modernization (Feature F20 / Phase 2 Verification)');
console.log('========================================================================\n');

const ROOT_DIR = process.cwd();
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureDetails = [];

function runProbe(id, name, testFn) {
  totalTests++;
  try {
    testFn();
    passedTests++;
    console.log(`  ✓ PASS [${id}] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✗ FAIL [${id}] ${name}`);
    console.error(`    -> ${err.message}`);
    failureDetails.push({ id, name, error: err.message });
  }
}

function readProjectFile(relPath) {
  const fullPath = path.resolve(ROOT_DIR, relPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Required file does not exist: ${relPath}`);
  }
  return fs.readFileSync(fullPath, 'utf8');
}

function readProjectBuffer(relPath) {
  const fullPath = path.resolve(ROOT_DIR, relPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Required binary file does not exist: ${relPath}`);
  }
  return fs.readFileSync(fullPath);
}

function walkFiles(dir, extensions = ['.ts', '.tsx', '.css', '.js', '.jsx']) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walkFiles(full, extensions));
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

function parseJpegDimensions(buf) {
  if (!buf || buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) {
    return null;
  }
  let offset = 2;
  while (offset < buf.length) {
    if (buf[offset] !== 0xFF) break;
    const marker = buf[offset + 1];
    if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
      const height = buf.readUInt16BE(offset + 5);
      const width = buf.readUInt16BE(offset + 7);
      const components = buf[offset + 9];
      return { width, height, components };
    }
    const len = buf.readUInt16BE(offset + 2);
    offset += 2 + len;
  }
  return null;
}

// =============================================================================
// CATEGORY 1: Exhaustive Imperial Unit Elimination
// =============================================================================
console.log('--- CATEGORY 1: Exhaustive Imperial Unit Elimination ---');

const srcFiles = walkFiles(path.resolve(ROOT_DIR, 'src'));

runProbe('T5-CHAL-01', `Scan all ${srcFiles.length} source files in src/ for imperial unit occurrences`, () => {
  assert(srcFiles.length >= 85, `Expected >= 85 source files in src/, found ${srcFiles.length}`);
  
  const imperialPattern = /\b(eighth|quarter|ounce|ounces|half[\s_-]+ounce|oz|lbs?|pound|pounds)\b/i;
  const violations = [];

  for (const file of srcFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      if (imperialPattern.test(line)) {
        violations.push({
          file: path.relative(ROOT_DIR, file),
          line: idx + 1,
          snippet: line.trim(),
        });
      }
    });
  }

  assert.equal(
    violations.length,
    0,
    `Found ${violations.length} imperial unit occurrences in src/:\n` +
      violations.map((v) => `  ${v.file}:${v.line} -> "${v.snippet}"`).join('\n')
  );
});

runProbe('T5-CHAL-02', 'uom.ts strictly defines metric tier ladders and fixtures eliminate all imperial labels', () => {
  const uomContent = readProjectFile('src/lib/uom.ts');
  const fixturesContent = readProjectFile('src/lib/demo/fixtures.ts');

  // Verify DEFAULT_TIERS in uom.ts
  assert.match(uomContent, /GRAMS:\s*\[1,\s*3\.5,\s*5,\s*7,\s*14,\s*28\]/);

  // Verify flower variant labels in fixtures
  assert.match(fixturesContent, /label:\s*['"]1g['"]/);
  assert.match(fixturesContent, /label:\s*['"]3\.5g['"]/);
  assert.match(fixturesContent, /label:\s*['"]7g['"]/);
  assert.match(fixturesContent, /label:\s*['"]14g['"]/);
  assert.match(fixturesContent, /label:\s*['"]28g['"]/);

  // Verify zero imperial labels in uom.ts and fixtures.ts
  const forbiddenTiers = ['Eighth', 'Quarter', 'Half', 'Ounce'];
  for (const forbidden of forbiddenTiers) {
    assert(
      !uomContent.includes(`'${forbidden}'`) && !uomContent.includes(`"${forbidden}"`),
      `uom.ts must NOT contain imperial tier word "${forbidden}"`
    );
    assert(
      !fixturesContent.includes(`'${forbidden}'`) && !fixturesContent.includes(`"${forbidden}"`),
      `fixtures.ts must NOT contain imperial tier word "${forbidden}"`
    );
  }
});

runProbe('T5-CHAL-03', 'Catalog fixtures specify only metric units across all product variants', () => {
  const fixturesContent = readProjectFile('src/lib/demo/fixtures.ts');
  
  // Extract all variant labels
  const labelMatches = [...fixturesContent.matchAll(/label:\s*'([^']+)'/g)].map((m) => m[1]);
  assert(labelMatches.length >= 20, `Expected >= 20 variant labels, found ${labelMatches.length}`);
  
  const imperialRegex = /(eighth|quarter|ounce|oz|pound|lbs)/i;
  for (const label of labelMatches) {
    assert(
      !imperialRegex.test(label),
      `Variant label "${label}" contains forbidden imperial reference`
    );
  }

  // Ensure metric labels are explicitly defined
  assert(labelMatches.includes('1g'), "Missing '1g' variant label");
  assert(labelMatches.includes('3.5g'), "Missing '3.5g' variant label");
  assert(labelMatches.includes('7g'), "Missing '7g' variant label");
  assert(labelMatches.includes('14g'), "Missing '14g' variant label");
  assert(labelMatches.includes('28g'), "Missing '28g' variant label");
});

runProbe('T5-CHAL-04', 'uom.ts pricePerBaseUnitCents calculates pure metric price ratios', () => {
  const uomContent = readProjectFile('src/lib/uom.ts');
  assert.match(uomContent, /export function pricePerBaseUnitCents/);
  assert.match(
    uomContent,
    /if\s*\(baseQty\s*<=\s*0\)\s*return\s*0;\s*return\s*Math\.round\(priceCents\s*\/\s*baseQty\);/,
    'pricePerBaseUnitCents must calculate Math.round(priceCents / baseQty)'
  );
});

runProbe('T5-CHAL-05', 'uom.ts tierLabel and formatBaseQty strictly output metric labels', () => {
  const uomContent = readProjectFile('src/lib/uom.ts');
  assert.match(uomContent, /export const UOM_SYMBOL:\s*Record<BaseUom,\s*string>\s*=\s*\{[\s\S]*?GRAMS:\s*'g'[\s\S]*?MILLILITERS:\s*'ml'[\s\S]*?UNITS:\s*'ea'/);
  assert.match(uomContent, /export function tierLabel/);
  assert.match(uomContent, /export function formatBaseQty/);
  assert(uomContent.includes('UOM_SYMBOL[uom]'), 'formatBaseQty must format using UOM_SYMBOL');
});

runProbe('T5-CHAL-06', 'Shop and Vault components render metric tiers and contain zero imperial labels', () => {
  const shopContent = readProjectFile('src/app/shop/page.tsx');
  const vaultContent = readProjectFile('src/app/vault/page.tsx');
  
  const combined = shopContent + '\n' + vaultContent;
  const imperialRegex = /\b(eighth|quarter|ounce|ounces|oz|lbs|pound)\b/i;
  assert(!imperialRegex.test(combined), 'Found imperial measurement string in shop or vault components');
});

// =============================================================================
// CATEGORY 2: Brand Logo & Visual Integrity
// =============================================================================
console.log('\n--- CATEGORY 2: Brand Logo & Visual Integrity ---');

runProbe('T5-CHAL-07', 'Brand logo file public/fourtwentycartel_logo.jpg exists and is non-empty', () => {
  const buf = readProjectBuffer('public/fourtwentycartel_logo.jpg');
  assert(buf.length > 50000, `Expected logo file size > 50KB, got ${buf.length} bytes`);
});

runProbe('T5-CHAL-08', 'Brand logo is a valid 1080x1080 3-channel RGB JPEG image', () => {
  const buf = readProjectBuffer('public/fourtwentycartel_logo.jpg');
  const dims = parseJpegDimensions(buf);
  assert(dims, 'Failed to parse JPEG dimensions: invalid JPEG header');
  assert.equal(dims.width, 1080, `Expected width 1080, got ${dims.width}`);
  assert.equal(dims.height, 1080, `Expected height 1080, got ${dims.height}`);
  assert.equal(dims.components, 3, `Expected 3 components (RGB), got ${dims.components}`);
});

runProbe('T5-CHAL-09', 'CartelCommandNav references /fourtwentycartel_logo.jpg with Next.js Image', () => {
  const navContent = readProjectFile('src/components/layout/CartelCommandNav.tsx');
  assert(
    navContent.includes('/fourtwentycartel_logo.jpg'),
    'CartelCommandNav does not reference /fourtwentycartel_logo.jpg'
  );
  assert.match(
    navContent,
    /<Image[\s\S]*?src="\/fourtwentycartel_logo\.jpg"[\s\S]*?alt="420 Cartel"/,
    'CartelCommandNav must render <Image> with src="/fourtwentycartel_logo.jpg" and alt="420 Cartel"'
  );
});

runProbe('T5-CHAL-10', 'CartelMemberQrPass references /fourtwentycartel_logo.jpg for digital member card', () => {
  const passContent = readProjectFile('src/components/crm/CartelMemberQrPass.tsx');
  assert(
    passContent.includes('/fourtwentycartel_logo.jpg'),
    'CartelMemberQrPass does not reference /fourtwentycartel_logo.jpg'
  );
  assert.match(
    passContent,
    /<Image[\s\S]*?src="\/fourtwentycartel_logo\.jpg"/,
    'CartelMemberQrPass must render <Image> with src="/fourtwentycartel_logo.jpg"'
  );
});

runProbe('T5-CHAL-11', 'POS Terminal header displays /fourtwentycartel_logo.jpg', () => {
  const posContent = readProjectFile('src/app/pos/page.tsx');
  assert(
    posContent.includes('/fourtwentycartel_logo.jpg'),
    'POS Terminal does not reference /fourtwentycartel_logo.jpg'
  );
  assert.match(
    posContent,
    /<Image[\s\S]*?src="\/fourtwentycartel_logo\.jpg"/,
    'POS Terminal must render <Image> with src="/fourtwentycartel_logo.jpg"'
  );
});

runProbe('T5-CHAL-12', 'Admin Command Hub and Root Layout OpenGraph reference /fourtwentycartel_logo.jpg', () => {
  const adminContent = readProjectFile('src/app/admin/page.tsx');
  const layoutContent = readProjectFile('src/app/layout.tsx');
  
  assert(
    adminContent.includes('/fourtwentycartel_logo.jpg'),
    'Admin hub does not reference /fourtwentycartel_logo.jpg'
  );
  assert(
    layoutContent.includes('/fourtwentycartel_logo.jpg'),
    'Root layout metadata does not reference /fourtwentycartel_logo.jpg'
  );
  assert.match(
    layoutContent,
    /images:\s*\[['"]\/fourtwentycartel_logo\.jpg['"]\]/,
    'Root layout metadata must specify /fourtwentycartel_logo.jpg in openGraph images'
  );
});

// =============================================================================
// CATEGORY 3: Member Gating & Route Protection
// =============================================================================
console.log('\n--- CATEGORY 3: Member Gating & Route Protection ---');

runProbe('T5-CHAL-13', 'src/app/vault/page.tsx exists as client component with session store integration', () => {
  const vaultContent = readProjectFile('src/app/vault/page.tsx');
  assert(vaultContent.includes("'use client'"), 'Vault page must be client component');
  assert(vaultContent.includes('useSessionStore'), 'Vault page must use useSessionStore');
  assert(vaultContent.includes('isVerifiedMember'), 'Vault page must import isVerifiedMember');
});

runProbe('T5-CHAL-14', 'Client-side Vault gating redirects unauthenticated visitors to /onboarding?next=/vault', () => {
  const vaultContent = readProjectFile('src/app/vault/page.tsx');
  assert.match(
    vaultContent,
    /router\.replace\(['"]\/onboarding\?next=\/vault['"]\)/,
    'Vault page must execute router.replace("/onboarding?next=/vault") when visitor is unverified'
  );
});

runProbe('T5-CHAL-15', 'Edge middleware declares /vault and /shop in MEMBER_ROUTES', () => {
  const middlewareContent = readProjectFile('src/middleware.ts');
  assert.match(
    middlewareContent,
    /const MEMBER_ROUTES\s*=\s*\[[\s\S]*?'\/vault'[\s\S]*?'\/shop'[\s\S]*?\]/,
    'MEMBER_ROUTES must contain /vault and /shop'
  );
});

runProbe('T5-CHAL-16', 'Edge middleware redirects unauthenticated member routes to /onboarding?next=<path>', () => {
  const middlewareContent = readProjectFile('src/middleware.ts');
  assert.match(
    middlewareContent,
    /target\.pathname\s*=\s*needsStaff\s*\?\s*['"]\/staff-login['"]\s*:\s*profilePage\s*\?\s*['"]\/login['"]\s*:\s*['"]\/onboarding['"]/,
    'Middleware must redirect unauthenticated member routes to /onboarding'
  );
  assert.match(
    middlewareContent,
    /target\.searchParams\.set\(['"]next['"],\s*path\)/,
    'Middleware must preserve requested path in ?next= search param'
  );
});

runProbe('T5-CHAL-17', 'Session store isVerifiedMember enforces age verification and member status', () => {
  const sessionContent = readProjectFile('src/lib/store/session.ts');
  assert.match(sessionContent, /export function isVerifiedMember/);
  assert(sessionContent.includes('member.age_verified_at === null'));
  assert(sessionContent.includes("member.status === 'ACTIVE_MEMBER'"));
  assert(sessionContent.includes("member.status === 'VIP'"));
});

// =============================================================================
// CATEGORY 4: Awaken Catalog Ingestion & Systems Integration
// =============================================================================
console.log('\n--- CATEGORY 4: Awaken Catalog Ingestion & Systems Integration ---');

const fixturesContent = readProjectFile('src/lib/demo/fixtures.ts');

const EXPECTED_AWAKEN_KEYS = [
  'awkPermMarker',
  'awkBanshac',
  'awkDuckTape',
  'awkSourDiesel',
  'awkDuo',
  'awkBlaster',
  'awkVolt',
  'awkGhost',
  'awkTincture',
  'awkPastilles',
];

runProbe('T5-CHAL-18', 'fixtures.ts contains all 10 Awaken products with unique UUIDs in SEED_IDS', () => {
  for (const key of EXPECTED_AWAKEN_KEYS) {
    assert(
      fixturesContent.includes(`${key}: 'e1000000-0000-4000-8000-`),
      `Missing SEED_IDS.product.${key} with fixed UUID`
    );
  }
});

runProbe('T5-CHAL-19', 'All 10 Awaken products have authentic HTTPS Google Cloud Storage media URLs', () => {
  const matches = fixturesContent.match(/https:\/\/storage\.googleapis\.com\/takeapp\/media\/[a-zA-Z0-9_.-]+/g) || [];
  assert(
    matches.length >= 10,
    `Expected at least 10 takeapp Google Cloud Storage URLs, found ${matches.length}`
  );
  for (const url of matches) {
    assert(url.startsWith('https://storage.googleapis.com/takeapp/media/'));
  }
});

runProbe('T5-CHAL-20', 'next.config.ts configures remotePatterns for storage.googleapis.com', () => {
  const nextConfigContent = readProjectFile('next.config.ts');
  assert.match(
    nextConfigContent,
    /hostname:\s*['"]storage\.googleapis\.com['"]/,
    'storage.googleapis.com hostname missing in next.config.ts remotePatterns'
  );
  assert.match(
    nextConfigContent,
    /pathname:\s*['"]\/\*\*['"]/,
    'pathname wildcard /** missing for storage.googleapis.com'
  );
});

runProbe('T5-CHAL-21', 'Product variants have strictly positive integer ZAR pricing in cents', () => {
  const prices = [
    ...fixturesContent.matchAll(/price_cents:\s*([0-9]+)/g),
    ...fixturesContent.matchAll(/priceCents:\s*([0-9]+)/g),
  ].map((m) => parseInt(m[1], 10));

  assert(prices.length >= 30, `Expected >= 30 variant price entries, found ${prices.length}`);
  for (const price of prices) {
    assert(Number.isInteger(price) && price > 0, `Invalid price: ${price}`);
  }

  // Check Awaken specific pricing (R1400.00, R1500.00, R1200.00, R1650.00, R950.00, R650.00)
  assert(fixturesContent.includes('140000'), 'R1400.00 (140000 cents) missing');
  assert(fixturesContent.includes('150000'), 'R1500.00 (150000 cents) missing');
  assert(fixturesContent.includes('120000'), 'R1200.00 (120000 cents) missing');
  assert(fixturesContent.includes('165000'), 'R1650.00 (165000 cents) missing');
  assert(fixturesContent.includes('95000'), 'R950.00 (95000 cents) missing');
  assert(fixturesContent.includes('65000'), 'R650.00 (65000 cents) missing');
});

runProbe('T5-CHAL-22', 'POS terminal renders hero_media_url thumbnails and provides VAPE and ACCESSORY tabs', () => {
  const posContent = readProjectFile('src/app/pos/page.tsx');
  assert(posContent.includes("import Image from 'next/image'"), 'Image import missing in pos/page.tsx');
  assert(posContent.includes('product.hero_media_url'), 'product.hero_media_url missing in pos/page.tsx');
  assert.match(
    posContent,
    /<Image[\s\S]*?src=\{product\.hero_media_url\}[\s\S]*?alt=\{product\.name\}/,
    'POS must render <Image> with hero_media_url'
  );
  assert.match(posContent, /key:\s*'VAPE'/);
  assert.match(posContent, /key:\s*'ACCESSORY'/);
});

runProbe('T5-CHAL-23', 'Admin inventory renders hero_media_url and tracks physical batches with remaining stock', () => {
  const inventoryContent = readProjectFile('src/app/admin/inventory/page.tsx');
  assert.match(inventoryContent, /(hero_media_url|<Image\b|<img\b)/, 'Admin inventory must render product images');
  assert.match(inventoryContent, /remaining_base_qty/, 'Admin inventory must render remaining_base_qty');
  assert.match(inventoryContent, /batch_code/, 'Admin inventory must display batch_code');
  assert.match(inventoryContent, /lab_thc_pct/, 'Admin inventory must display lab_thc_pct');
});

// =============================================================================
// CATEGORY 5: Mobile Responsiveness & Layout Boundaries
// =============================================================================
console.log('\n--- CATEGORY 5: Mobile Responsiveness & Layout Boundaries ---');

runProbe('T5-CHAL-24', 'globals.css declares overflow-x: hidden on body to prevent horizontal viewport clipping', () => {
  const cssContent = readProjectFile('src/app/globals.css');
  assert.match(
    cssContent,
    /body\s*\{[\s\S]*?overflow-x:\s*hidden/m,
    'body must specify "overflow-x: hidden;" in globals.css'
  );
});

runProbe('T5-CHAL-25', 'Landing page giant footer typography is guarded with overflow-hidden', () => {
  const pageContent = readProjectFile('src/app/page.tsx');
  assert.match(
    pageContent,
    /<footer[\s\S]*?className="[^"]*overflow-hidden[^"]*"[\s\S]*?>/,
    'Landing page footer container must specify overflow-hidden'
  );
});

runProbe('T5-CHAL-26', 'CartelCommandNav mobile hamburger toggle enforces minimum 44x44px touch target', () => {
  const navContent = readProjectFile('src/components/layout/CartelCommandNav.tsx');
  const hamburgerMatch = navContent.match(/aria-label="Toggle navigation"[\s\S]*?className="([^"]*)"/);
  assert(hamburgerMatch, 'Hamburger toggle button with aria-label="Toggle navigation" missing');
  const classNames = hamburgerMatch[1];
  assert(
    classNames.includes('h-11') && classNames.includes('w-11'),
    `Hamburger button must enforce h-11 w-11 (44px touch target), got: "${classNames}"`
  );
});

runProbe('T5-CHAL-27', 'CartelCommandNav mobile drawer close button enforces minimum 44x44px touch target', () => {
  const navContent = readProjectFile('src/components/layout/CartelCommandNav.tsx');
  const closeBtnMatch = navContent.match(/<button[\s\S]*?aria-label="Close navigation"[\s\S]*?className="([^"]*)"/);
  assert(closeBtnMatch, 'Mobile drawer close button with aria-label="Close navigation" missing');
  const classNames = closeBtnMatch[1];
  assert(
    classNames.includes('h-11') && classNames.includes('w-11'),
    `Close button must enforce h-11 w-11 (44px touch target), got: "${classNames}"`
  );
});

runProbe('T5-CHAL-28', 'Interactive UI buttons and input fields enforce 44px minimum height touch ergonomics', () => {
  const buttonContent = readProjectFile('src/components/ui/button.tsx');
  const fieldContent = readProjectFile('src/components/ui/field.tsx');
  
  assert.match(
    buttonContent,
    /default:\s*['"]h-11/,
    'Default button size must enforce h-11 (44px)'
  );
  assert.match(
    fieldContent,
    /h-12/,
    'Form input/select fields must specify h-12 (48px >= 44px min)'
  );
});

// =============================================================================
// CATEGORY 6: Higgsfield AI Media Pipeline Hardening
// =============================================================================
console.log('\n--- CATEGORY 6: Higgsfield AI Media Pipeline Hardening ---');

runProbe('T5-CHAL-29', '.env.example specifies HIGGSFIELD_MCP_URL with official mcp.higgsfield.ai endpoint', () => {
  const envContent = readProjectFile('.env.example');
  assert.match(
    envContent,
    /^HIGGSFIELD_MCP_URL=https:\/\/mcp\.higgsfield\.ai\/mcp/m,
    'HIGGSFIELD_MCP_URL must be configured as https://mcp.higgsfield.ai/mcp in .env.example'
  );
});

runProbe('T5-CHAL-30', 'HiggsfieldClient configures DEFAULT_TIMEOUT_MS and uses AbortSignal.timeout on fetch', () => {
  const clientContent = readProjectFile('src/lib/higgsfield/client.ts');
  assert.match(
    clientContent,
    /const DEFAULT_TIMEOUT_MS\s*=\s*30_000;/,
    'client.ts must define DEFAULT_TIMEOUT_MS = 30_000'
  );
  assert.match(
    clientContent,
    /signal:\s*signal\s*\?\?\s*AbortSignal\.timeout\(DEFAULT_TIMEOUT_MS\)/,
    'client.ts callTool must pass signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS) to fetch'
  );
  assert.match(
    clientContent,
    /'AbortError'[\s\S]*?'TimeoutError'/,
    'client.ts must handle AbortError and TimeoutError gracefully'
  );
});

runProbe('T5-CHAL-31', 'HiggsfieldClient methods accept optional signal parameter for cooperative cancellation', () => {
  const clientContent = readProjectFile('src/lib/higgsfield/client.ts');
  assert.match(
    clientContent,
    /interface SubmitMediaJobInput\s*\{[\s\S]*?signal\?:\s*AbortSignal;/,
    'SubmitMediaJobInput interface must include optional signal'
  );
  assert.match(
    clientContent,
    /status\(providerJobId:\s*string,\s*signal\?:\s*AbortSignal\)/,
    'status method must accept optional signal parameter'
  );
});

runProbe('T5-CHAL-32', 'prompt.ts guards terpene array length before composing prompt segments', () => {
  const promptContent = readProjectFile('src/lib/higgsfield/prompt.ts');
  assert.match(
    promptContent,
    /if\s*\(input\.terpeneTags\s*&&\s*input\.terpeneTags\.length\s*>\s*0\)/,
    'prompt.ts must verify input.terpeneTags && input.terpeneTags.length > 0 before processing'
  );
});

runProbe('T5-CHAL-33', 'brand.ts exports HIGGSFIELD_VISUAL_FORMULA conforming to 420 Cartel luxury identity', () => {
  const brandContent = readProjectFile('src/lib/brand.ts');
  assert.match(
    brandContent,
    /export const HIGGSFIELD_VISUAL_FORMULA\s*=\s*/,
    'brand.ts must export HIGGSFIELD_VISUAL_FORMULA'
  );
  assert(brandContent.includes('24k metallic gold'), 'Formula must reference 24k metallic gold');
  assert(brandContent.includes('obsidian black void'), 'Formula must reference obsidian black void');
  assert(brandContent.includes('private social club'), 'Formula must reference private social club aesthetic');
});

// =============================================================================
// SUMMARY REPORT
// =============================================================================
console.log('\n========================================================================');
console.log('  CHALLENGER 2 TIER 5 HARNESS EXECUTION SUMMARY');
console.log('========================================================================');
console.log(`  Total Probes Executed : ${totalTests}`);
console.log(`  Passed Probes         : ${passedTests}`);
console.log(`  Failed Probes         : ${failedTests}`);
console.log(`  Pass Rate             : ${Math.round((passedTests / totalTests) * 100)}%`);

if (failedTests > 0) {
  console.log('\nFailed Probes:');
  for (const f of failureDetails) {
    console.log(`  - [${f.id}] ${f.name}: ${f.error}`);
  }
  process.exit(1);
} else {
  console.log('\n★ ALL 33 TIER 5 ADVERSARIAL PROBES PASSED (100% SPEC COMPLIANCE) ★\n');
  process.exit(0);
}
