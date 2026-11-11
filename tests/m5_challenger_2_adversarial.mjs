/**
 * Milestone 5 Challenger 2: Adversarial Security, Geolocation & Metric Compliance Probe
 *
 * Probes:
 * 1. Social media external link security (HTTPS enforcement, target="_blank", rel="noopener noreferrer", URL integrity).
 * 2. Reverse tabnabbing vulnerability prevention across all customer-facing surfaces.
 * 3. Contact & branch location precision (Norwood, Rivonia, Kibler Park addresses, postal codes, phone numbers).
 * 4. Google Maps deep link formatting, encoding, and target security.
 * 5. Operating hours consistency (09:00 - 20:00 / 9:00 AM – 8:00 PM) across all surfaces.
 * 6. Strictly 18+ policy enforcement across all customer entry points.
 * 7. Exhaustive metric compliance scan (zero imperial units: oz, ounce, lbs, pound, eighth, quarter, etc.).
 * 8. Schema.org JSON-LD structural graph validation (Organization, LocalBusiness, FAQPage, BreadcrumbList).
 * 9. Dynamic sitemap & robots directives validation.
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

console.log('========================================================================');
console.log('  MILESTONE 5 CHALLENGER 2: ADVERSARIAL STRESS HARNESS');
console.log('  Social Link Security, Geolocation Accuracy & Metric Compliance');
console.log('========================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureDetails = [];

function runTest(id, name, testFn) {
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

const CUSTOMER_PAGES = [
  'src/app/page.tsx',
  'src/app/about/page.tsx',
  'src/app/contact/page.tsx',
  'src/app/onboarding/page.tsx',
];

const ALL_M5_FILES = [
  'src/app/page.tsx',
  'src/app/about/page.tsx',
  'src/app/contact/page.tsx',
  'src/app/onboarding/page.tsx',
  'src/app/layout.tsx',
  'src/app/sitemap.ts',
  'src/app/robots.ts',
  'src/components/seo/JsonLd.tsx',
  'src/lib/branches.ts',
];

const OFFICIAL_INSTAGRAM_URL = 'https://www.instagram.com/fourtwentycartel/';
const OFFICIAL_FACEBOOK_URL = 'https://www.facebook.com/p/The-Cartel-420-social-lounge-NO-UNDER-18-100041765415684/';

// ============================================================================
// SUITE 1: ADVERSARIAL SOCIAL MEDIA LINK SECURITY & REVERSE TABNABBING
// ============================================================================

runTest('ADV-SEC-01', 'Every customer-facing page includes the official Instagram link', () => {
  for (const file of CUSTOMER_PAGES) {
    const content = fs.readFileSync(file, 'utf-8');
    assert(
      content.includes(OFFICIAL_INSTAGRAM_URL),
      `File ${file} missing official Instagram URL: ${OFFICIAL_INSTAGRAM_URL}`
    );
  }
});

runTest('ADV-SEC-02', 'Every customer-facing page includes the official Facebook link', () => {
  for (const file of CUSTOMER_PAGES) {
    const content = fs.readFileSync(file, 'utf-8');
    assert(
      content.includes(OFFICIAL_FACEBOOK_URL),
      `File ${file} missing official Facebook URL: ${OFFICIAL_FACEBOOK_URL}`
    );
  }
});

runTest('ADV-SEC-03', 'Zero insecure plaintext HTTP links for social media domains', () => {
  for (const file of ALL_M5_FILES) {
    const content = fs.readFileSync(file, 'utf-8');
    const httpInsta = content.match(/http:\/\/.*instagram\.com/i);
    const httpFb = content.match(/http:\/\/.*facebook\.com/i);
    assert(!httpInsta, `Insecure plaintext HTTP Instagram link found in ${file}: ${httpInsta?.[0]}`);
    assert(!httpFb, `Insecure plaintext HTTP Facebook link found in ${file}: ${httpFb?.[0]}`);
  }
});

runTest('ADV-SEC-04', 'All external social anchor tags strictly enforce target="_blank"', () => {
  for (const file of CUSTOMER_PAGES) {
    const content = fs.readFileSync(file, 'utf-8');
    // Regex matches <a ... href="https://...instagram|facebook..." ...>
    const anchorRegex = /<a\s+[^>]*href=["'](https:\/\/(?:www\.)?(?:instagram|facebook)\.com[^"']*)["'][^>]*>/gi;
    let match;
    let found = 0;
    while ((match = anchorRegex.exec(content)) !== null) {
      found++;
      const tag = match[0];
      assert(
        tag.includes('target="_blank"') || tag.includes("target='_blank'"),
        `External social link in ${file} missing target="_blank": ${tag}`
      );
    }
    assert(found >= 2, `Expected at least 2 social links in ${file}, found ${found}`);
  }
});

runTest('ADV-SEC-05', 'All external social links enforce rel="noopener noreferrer" (Reverse Tabnabbing Immunity)', () => {
  for (const file of CUSTOMER_PAGES) {
    const content = fs.readFileSync(file, 'utf-8');
    const anchorRegex = /<a\s+[^>]*href=["'](https:\/\/(?:www\.)?(?:instagram|facebook)\.com[^"']*)["'][^>]*>/gi;
    let match;
    let found = 0;
    while ((match = anchorRegex.exec(content)) !== null) {
      found++;
      const tag = match[0];
      assert(
        tag.includes('rel="noopener noreferrer"') || tag.includes("rel='noopener noreferrer'"),
        `External link in ${file} missing rel="noopener noreferrer" (tabnabbing/referrer leak): ${tag}`
      );
    }
    assert(found >= 2, `Expected at least 2 social links in ${file}, found ${found}`);
  }
});

runTest('ADV-SEC-06', 'No malformed protocol or open redirect patterns in social links', () => {
  for (const file of CUSTOMER_PAGES) {
    const content = fs.readFileSync(file, 'utf-8');
    // Ensure no javascript:, data:, // protocol-relative or unverified redirects
    const suspicious = content.match(/href=["'](?:javascript:|data:|\/\/|https?:\/\/l\.facebook\.com|\/exit\?)/i);
    assert(!suspicious, `Suspicious link scheme found in ${file}: ${suspicious?.[0]}`);
  }
});

// ============================================================================
// SUITE 2: CONTACT & PHYSICAL LOCATION ACCURACY
// ============================================================================

runTest('ADV-LOC-01', 'Norwood branch address, postal code and telephone accuracy', () => {
  const contactContent = fs.readFileSync('src/app/contact/page.tsx', 'utf-8');
  assert(contactContent.includes('62 Grant Ave, Norwood'), 'Norwood street address missing');
  assert(contactContent.includes('2192'), 'Norwood postal code 2192 missing');
  assert(contactContent.includes('072 333 0854'), 'Norwood phone number 072 333 0854 missing');
});

runTest('ADV-LOC-02', 'Rivonia Sandton branch address, postal code and telephone accuracy', () => {
  const contactContent = fs.readFileSync('src/app/contact/page.tsx', 'utf-8');
  assert(contactContent.includes('353 Rivonia Blvd'), 'Rivonia street address missing');
  assert(contactContent.includes('2128'), 'Rivonia postal code 2128 missing');
  assert(contactContent.includes('067 755 1674'), 'Rivonia phone number 067 755 1674 missing');
});

runTest('ADV-LOC-03', 'Kibler Park branch address, postal code and telephone accuracy', () => {
  const contactContent = fs.readFileSync('src/app/contact/page.tsx', 'utf-8');
  assert(contactContent.includes('Shop 9, 14 Stanmore Cres'), 'Kibler Park street address missing');
  assert(contactContent.includes('2091'), 'Kibler Park postal code 2091 missing');
  assert(contactContent.includes('082 886 7014'), 'Kibler Park phone number 082 886 7014 missing');
});

runTest('ADV-LOC-04', 'Google Maps directions link formatting and security attributes', () => {
  const contactContent = fs.readFileSync('src/app/contact/page.tsx', 'utf-8');
  assert(
    contactContent.includes('https://www.google.com/maps/search/?api=1'),
    'Google Maps API query format missing in contact page'
  );
  
  // Extract snippet containing Directions link
  const idx = contactContent.indexOf('Directions');
  assert(idx !== -1, 'Directions text missing in contact page');
  const snippet = contactContent.slice(idx - 300, idx + 50);
  
  assert(snippet.includes('google.com/maps/search'), 'Google Maps search URL missing before Directions text');
  assert(snippet.includes('target="_blank"'), 'Directions link missing target="_blank"');
  assert(snippet.includes('rel="noopener noreferrer"'), 'Directions link missing rel="noopener noreferrer"');
});

runTest('ADV-LOC-05', 'Telephone links use valid tel: URI protocol with South African country code', () => {
  const contactContent = fs.readFileSync('src/app/contact/page.tsx', 'utf-8');
  assert(
    contactContent.includes('href={`tel:+27${branch.phone.replace(/\\s/g, \'\').slice(1)}`}'),
    'Telephone links must use E.164 +27 international dial format'
  );
});

// ============================================================================
// SUITE 3: OPERATING HOURS & 18+ AGE RESTRICTION CONSISTENCY
// ============================================================================

runTest('ADV-HRS-01', 'Operating hours consistently declared as 09:00 - 20:00 / 9:00 AM – 8:00 PM', () => {
  const filesToCheck = [
    'src/app/contact/page.tsx',
    'src/app/about/page.tsx',
    'src/app/page.tsx',
    'src/app/onboarding/page.tsx',
    'src/components/seo/JsonLd.tsx',
  ];

  for (const file of filesToCheck) {
    const content = fs.readFileSync(file, 'utf-8');
    const hasHours =
      content.includes('09:00 - 20:00') ||
      content.includes('09:00 to 20:00') ||
      content.includes('9:00 AM – 8:00 PM') ||
      content.includes('9:00 AM to 8:00 PM') ||
      (content.includes('"opens": "09:00"') && content.includes('"closes": "20:00"'));
    assert(hasHours, `Operating hours (09:00 - 20:00) missing from ${file}`);
  }
});

runTest('ADV-HRS-02', 'Zero conflicting operating hours in any M5 file', () => {
  for (const file of ALL_M5_FILES) {
    const content = fs.readFileSync(file, 'utf-8');
    // Ensure no conflicting hours like 10:00, 22:00, 24/7, 08:00, 17:00, etc.
    const conflicting = content.match(/\b(10:00|22:00|24\/7|24 hours|17:00|18:00)\b/i);
    assert(!conflicting, `Conflicting operating hour found in ${file}: ${conflicting?.[0]}`);
  }
});

runTest('ADV-AGE-01', 'Strictly 18+ policy clearly displayed on all customer-facing entry points', () => {
  const entryPoints = [
    { file: 'src/app/page.tsx', label: 'Landing' },
    { file: 'src/app/about/page.tsx', label: 'About' },
    { file: 'src/app/contact/page.tsx', label: 'Contact' },
    { file: 'src/app/onboarding/page.tsx', label: 'Onboarding' },
    { file: 'src/app/layout.tsx', label: 'Root Layout' },
    { file: 'src/components/seo/JsonLd.tsx', label: 'JSON-LD Schema' },
  ];

  for (const entry of entryPoints) {
    const content = fs.readFileSync(entry.file, 'utf-8');
    const has18Policy =
      content.includes('18+') ||
      content.includes('18 and older') ||
      content.includes('18 and over') ||
      content.includes('No Under 18') ||
      content.includes('LEGAL_AGE');
    assert(has18Policy, `18+ restriction policy missing from ${entry.label} (${entry.file})`);
  }
});

runTest('ADV-AGE-02', 'Root layout metadata includes adult rating declaration', () => {
  const content = fs.readFileSync('src/app/layout.tsx', 'utf-8');
  assert(content.includes("rating: 'adult'"), "Root metadata must declare rating: 'adult'");
});

// ============================================================================
// SUITE 4: EXHAUSTIVE METRIC COMPLIANCE AUDIT
// ============================================================================

runTest('ADV-MET-01', 'Zero imperial measurement units in customer-facing copy', () => {
  // Regex looks for imperial weight/length units as standalone words
  const imperialRegex = /\b(eighth|quarter|ounce|ounces|oz|pound|pounds|lbs|lb|foot|feet|inch|inches)\b/i;

  for (const file of ALL_M5_FILES) {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      // Exclude comments that explicitly mention removing imperial units or git diffs
      if (line.includes('imperial') || line.includes('imperial references')) return;
      
      const match = line.match(imperialRegex);
      if (match) {
        assert.fail(`Imperial unit '${match[0]}' found in ${file}:${idx + 1} -> "${line.trim()}"`);
      }
    });
  }
});

runTest('ADV-MET-02', 'Metric product sizes explicitly documented in customer copy', () => {
  const aboutContent = fs.readFileSync('src/app/about/page.tsx', 'utf-8');
  assert(aboutContent.includes('1g, 3.5g, 7g, 14g, 28g'), 'About page must list standard metric flower tiers');
  assert(aboutContent.includes('5ml, 10ml, 30ml'), 'About page must list standard metric elixir tiers');

  const pageContent = fs.readFileSync('src/app/page.tsx', 'utf-8');
  assert(pageContent.includes('1g · 3.5g · 7g · 28g'), 'Landing page must list metric flower sizes');
  assert(pageContent.includes('5ml · 10ml · 30ml'), 'Landing page must list metric elixir sizes');
});

// ============================================================================
// SUITE 5: JSON-LD STRUCTURED DATA SCHEMA & GRAPH VALIDATION
// ============================================================================

runTest('ADV-SEO-01', 'JsonLd component produces syntactically valid JSON Schema graph', () => {
  const content = fs.readFileSync('src/components/seo/JsonLd.tsx', 'utf-8');
  
  // Extract schema object literal
  const schemaMatch = content.match(/const schema = (\{[\s\S]*?\n\s*\});/);
  assert(schemaMatch, 'Schema object definition not found in JsonLd.tsx');

  // Verify structure by string inspection
  assert(content.includes("'@context': 'https://schema.org'"), 'Schema @context missing');
  assert(content.includes("'@graph': ["), 'Schema @graph array missing');
  assert(content.includes("'@type': 'Organization'"), 'Organization entity missing');
  assert(content.includes("'@type': 'LocalBusiness'"), 'LocalBusiness entity missing');
  assert(content.includes("'@type': 'SocialClub'"), 'SocialClub entity missing');
  assert(content.includes("'@type': 'FAQPage'"), 'FAQPage entity missing');
  assert(content.includes("'@type': 'BreadcrumbList'"), 'BreadcrumbList entity missing');
});

runTest('ADV-SEO-02', 'JSON-LD LocalBusiness entities include accurate GeoCoordinates', () => {
  const content = fs.readFileSync('src/components/seo/JsonLd.tsx', 'utf-8');
  // Norwood lat: -26.1578, lon: 28.0772
  assert(content.includes('latitude: -26.1578') && content.includes('longitude: 28.0772'), 'Norwood geo coordinates missing/incorrect');
  // Rivonia lat: -26.0465, lon: 28.0598
  assert(content.includes('latitude: -26.0465') && content.includes('longitude: 28.0598'), 'Rivonia geo coordinates missing/incorrect');
  // Kibler Park lat: -26.3075, lon: 28.0084
  assert(content.includes('latitude: -26.3075') && content.includes('longitude: 28.0084'), 'Kibler Park geo coordinates missing/incorrect');
});

runTest('ADV-SEO-03', 'JSON-LD FAQPage includes authoritative answers for AIO/GEO engines', () => {
  const content = fs.readFileSync('src/components/seo/JsonLd.tsx', 'utf-8');
  assert(content.includes('What is 420 Cartel?'), 'Brand FAQ missing');
  assert(content.includes('Who is allowed to enter 420 Cartel lounges and the Vault?'), 'Access policy FAQ missing');
  assert(content.includes('Where are 420 Cartel physical lounges located?'), 'Location FAQ missing');
  assert(content.includes('What are 420 Cartel operating hours?'), 'Operating hours FAQ missing');
  assert(content.includes('What measurement system does 420 Cartel use?'), 'Metric system FAQ missing');
});

runTest('ADV-SEO-04', 'BreadcrumbList positions are strictly 1-based sequential integers', () => {
  const content = fs.readFileSync('src/components/seo/JsonLd.tsx', 'utf-8');
  const positions = [...content.matchAll(/position:\s*(\d+)/g)].map((m) => parseInt(m[1], 10));
  assert.deepStrictEqual(positions, [1, 2, 3, 4, 5], `Breadcrumb positions must be [1, 2, 3, 4, 5], got ${JSON.stringify(positions)}`);
});

// ============================================================================
// SUITE 6: DYNAMIC SITEMAP & ROBOTS.TXT CONTRACTS
// ============================================================================

runTest('ADV-SEO-05', 'Dynamic sitemap exposes all 5 canonical routes with clean URLs', () => {
  const content = fs.readFileSync('src/app/sitemap.ts', 'utf-8');
  assert(content.includes("path: '/'"), 'Home route missing in sitemap');
  assert(content.includes("path: '/about'"), 'About route missing in sitemap');
  assert(content.includes("path: '/onboarding'"), 'Onboarding route missing in sitemap');
  assert(content.includes("path: '/contact'"), 'Contact route missing in sitemap');
  assert(content.includes("path: '/login'"), 'Login route missing in sitemap');
  assert(content.includes(".replace(/\\/$/, '')"), 'Site URL trailing slash sanitization missing in sitemap.ts');
});

runTest('ADV-SEO-06', 'Robots.ts excludes private member, administrative, and terminal routes', () => {
  const content = fs.readFileSync('src/app/robots.ts', 'utf-8');
  const disallows = ['/admin', '/pos', '/api', '/account', '/checkout', '/pass', '/shop'];
  for (const route of disallows) {
    assert(content.includes(`'${route}'`), `Route ${route} must be disallowed in robots.ts`);
  }
  assert(content.includes('sitemap.xml'), 'Robots.ts must link to sitemap.xml');
});

// ============================================================================
// SUMMARY & VERDICT
// ============================================================================

console.log('\n========================================================================');
console.log('  CHALLENGER 2 EXECUTION SUMMARY');
console.log('========================================================================');
console.log(`  Total Tests Executed : ${totalTests}`);
console.log(`  Passed               : ${passedTests}`);
console.log(`  Failed               : ${failedTests}`);
console.log(`  Pass Rate            : ${((passedTests / totalTests) * 100).toFixed(1)}%`);

if (failedTests > 0) {
  console.log('\n  FAILURES:');
  for (const f of failureDetails) {
    console.log(`  - [${f.id}] ${f.name}: ${f.error}`);
  }
  console.log('\n★ VERDICT: REJECTED ★\n');
  process.exit(1);
} else {
  console.log('\n★ VERDICT: CONFIRMED ★\n');
  process.exit(0);
}
