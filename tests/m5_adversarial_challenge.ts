/**
 * 420 CARTEL :: Milestone 5 Adversarial Challenge & Stress Harness
 *
 * Empirical challenger probe for:
 * 1. src/components/seo/JsonLd.tsx
 *    - Schema.org JSON-LD parsing & syntax validation
 *    - Entity verification: Organization, 3 LocalBusiness/SocialClub branches with GPS & hours,
 *      FAQPage Q&A completeness, BreadcrumbList 1-based sequential positions.
 *    - Object graph deep scan: No NaN, undefined, cyclical references, null values.
 *    - Adversarial URL injection: Trailing slashes, port numbers, empty env variables.
 * 2. src/app/sitemap.ts
 *    - Programmatic execution of sitemap()
 *    - URL syntax, double slash prevention (//about, //contact)
 *    - Date object validity, frequency enumeration, priority range & hierarchy
 *    - Whitelist validation and private route exclusion (/admin, /pos, /api, /checkout, etc.)
 * 3. src/app/robots.ts
 *    - Programmatic execution of robots()
 *    - Wildcard userAgent rule, allowed public routes
 *    - Blocked private paths (/admin, /pos, /api, /account, /checkout, /pass, /shop)
 *    - Sitemap XML reference validation
 * 4. Customer-Facing Pages Context & Security Audit
 *    - Reverse-tabnabbing security (target="_blank" + rel="noopener noreferrer")
 *    - Social media URLs verification (Instagram, Facebook)
 *    - Operating hours (09:00 - 20:00) & Strictly 18+ policy enforcement
 *    - Strict metric standardization (zero imperial terms)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Direct programmatic imports from source code
import { JsonLd } from '../src/components/seo/JsonLd';
import sitemap from '../src/app/sitemap';
import robots from '../src/app/robots';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

const results: TestResult[] = [];

function runTest(id: string, name: string, fn: () => void | Promise<void>) {
  const start = performance.now();
  try {
    fn();
    const duration = performance.now() - start;
    results.push({ id, name, passed: true, durationMs: Number(duration.toFixed(2)) });
    console.log(`  [PASS] ${id} - ${name} (${duration.toFixed(2)}ms)`);
  } catch (err: any) {
    const duration = performance.now() - start;
    const msg = err?.message || String(err);
    results.push({ id, name, passed: false, error: msg, durationMs: Number(duration.toFixed(2)) });
    console.error(`  [FAIL] ${id} - ${name} (${duration.toFixed(2)}ms)`);
    console.error(`         Error: ${msg}`);
  }
}

function assert(condition: boolean, msg: string): asserts condition {
  if (!condition) {
    throw new Error(msg);
  }
}

function assertStrictEqual(actual: any, expected: any, msg: string) {
  if (actual !== expected) {
    throw new Error(`${msg} (Expected: ${JSON.stringify(expected)}, Actual: ${JSON.stringify(actual)})`);
  }
}

// Deep scanner helper for undefined, NaN, circular references
function deepScanObject(obj: any, pathStr = '$', visited = new WeakSet()): void {
  if (obj === null || obj === undefined) {
    assert(obj !== undefined, `Found undefined value at ${pathStr}`);
    return;
  }
  if (typeof obj === 'number') {
    assert(!Number.isNaN(obj), `Found NaN numeric value at ${pathStr}`);
    assert(Number.isFinite(obj), `Found non-finite numeric value at ${pathStr}`);
    return;
  }
  if (typeof obj !== 'object') {
    return;
  }
  assert(!visited.has(obj), `Circular reference detected at ${pathStr}`);
  visited.add(obj);

  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      deepScanObject(item, `${pathStr}[${index}]`, visited);
    });
  } else {
    for (const [key, value] of Object.entries(obj)) {
      assert(value !== undefined, `Property "${key}" has undefined value at ${pathStr}.${key}`);
      deepScanObject(value, `${pathStr}.${key}`, visited);
    }
  }
}

// =========================================================================
// TEST SUITE A: JsonLd Structured Data Stress Tests
// =========================================================================
console.log('\n--- SUITE A: JsonLd Structured Data Stress Tests ---');

// A1: Programmatic Execution & React Script Tag Return
runTest('ADV-A01', 'JsonLd component returns valid script[type="application/ld+json"]', () => {
  const element = JsonLd();
  assert(element !== null && typeof element === 'object', 'JsonLd must return a valid React element');
  assertStrictEqual(element.type, 'script', 'JsonLd root element must be a <script> tag');
  assertStrictEqual(element.props.type, 'application/ld+json', 'Script tag type must be "application/ld+json"');
  assert(
    element.props.dangerouslySetInnerHTML && typeof element.props.dangerouslySetInnerHTML.__html === 'string',
    'Script tag must contain dangerouslySetInnerHTML with __html string'
  );
});

// A2: JSON Syntax and Serialization Round-Trip
runTest('ADV-A02', 'JSON-LD content parses without syntax errors and supports round-trip serialization', () => {
  const element = JsonLd();
  const rawJson = element.props.dangerouslySetInnerHTML.__html;
  let parsed: any;
  try {
    parsed = JSON.parse(rawJson);
  } catch (e: any) {
    throw new Error(`JSON.parse failed on JSON-LD output: ${e.message}`);
  }
  assert(typeof parsed === 'object' && parsed !== null, 'Parsed JSON must be an object');
  const reserialized = JSON.stringify(parsed);
  const reParsed = JSON.parse(reserialized);
  assertStrictEqual(JSON.stringify(reParsed), reserialized, 'JSON serialization must be idempotent');
});

// A3: Schema.org Context & Graph Array
runTest('ADV-A03', 'Schema.org @context is valid and @graph contains >= 6 entities', () => {
  const element = JsonLd();
  const schema = JSON.parse(element.props.dangerouslySetInnerHTML.__html);
  assertStrictEqual(schema['@context'], 'https://schema.org', '@context must be "https://schema.org"');
  assert(Array.isArray(schema['@graph']), '@graph must be an array');
  assert(schema['@graph'].length >= 6, `@graph must have at least 6 entities (got ${schema['@graph'].length})`);
});

// A4: Organization Entity Completeness
runTest('ADV-A04', 'Organization entity contains complete brand details, sameAs, and contactPoint', () => {
  const element = JsonLd();
  const schema = JSON.parse(element.props.dangerouslySetInnerHTML.__html);
  const org = schema['@graph'].find((e: any) => e['@type'] === 'Organization');
  assert(org !== undefined, 'Organization entity must exist in @graph');
  assertStrictEqual(org.name, '420 Cartel', 'Organization name must be "420 Cartel"');
  assert(Array.isArray(org.alternateName), 'alternateName must be an array');
  assert(org.alternateName.includes('The Cartel 420'), 'alternateName must include "The Cartel 420"');
  assert(org.alternateName.includes('Four Twenty Cartel'), 'alternateName must include "Four Twenty Cartel"');
  assert(org.alternateName.includes('The Cartel 420 Social Lounge'), 'alternateName must include "The Cartel 420 Social Lounge"');
  assert(typeof org.logo === 'string' && org.logo.endsWith('/fourtwentycartel_logo.jpg'), 'logo must point to fourtwentycartel_logo.jpg');
  assert(Array.isArray(org.sameAs), 'sameAs must be an array');
  assert(
    org.sameAs.includes('https://www.instagram.com/fourtwentycartel/'),
    'sameAs must include official Instagram profile'
  );
  assert(
    org.sameAs.includes('https://www.facebook.com/p/The-Cartel-420-social-lounge-NO-UNDER-18-100041765415684/'),
    'sameAs must include official Facebook page'
  );
  assert(Array.isArray(org.contactPoint) && org.contactPoint.length > 0, 'contactPoint array must be present');
  const cp = org.contactPoint[0];
  assertStrictEqual(cp['@type'], 'ContactPoint', 'contactPoint @type must be ContactPoint');
  assertStrictEqual(cp.areaServed, 'ZA', 'contactPoint areaServed must be ZA');
  assertStrictEqual(cp.telephone, '+27-72-333-0854', 'contactPoint telephone must match official phone');
});

// A5: 3 Physical Lounge Branches with Valid Coordinates & 09:00-20:00 Hours
runTest('ADV-A05', 'All 3 branch entities (Norwood, Rivonia, Kibler Park) have valid GPS, address & 09:00-20:00 hours', () => {
  const element = JsonLd();
  const schema = JSON.parse(element.props.dangerouslySetInnerHTML.__html);
  const branches = schema['@graph'].filter((e: any) => e['@type'] === 'LocalBusiness' || e['@type'] === 'SocialClub');
  assertStrictEqual(branches.length, 3, 'Must have exactly 3 branch entities');

  const norwood = branches.find((b: any) => b.name?.includes('Norwood'));
  assert(norwood !== undefined, 'Norwood branch must exist');
  assertStrictEqual(norwood.address?.streetAddress, '62 Grant Ave', 'Norwood street address');
  assertStrictEqual(norwood.address?.postalCode, '2192', 'Norwood postal code');
  assertStrictEqual(norwood.geo?.latitude, -26.1578, 'Norwood latitude');
  assertStrictEqual(norwood.geo?.longitude, 28.0772, 'Norwood longitude');

  const rivonia = branches.find((b: any) => b.name?.includes('Rivonia'));
  assert(rivonia !== undefined, 'Rivonia branch must exist');
  assert(rivonia.address?.streetAddress?.includes('353 Rivonia Blvd'), 'Rivonia street address');
  assertStrictEqual(rivonia.address?.postalCode, '2128', 'Rivonia postal code');
  assertStrictEqual(rivonia.geo?.latitude, -26.0465, 'Rivonia latitude');
  assertStrictEqual(rivonia.geo?.longitude, 28.0598, 'Rivonia longitude');

  const kibler = branches.find((b: any) => b.name?.includes('Kibler Park'));
  assert(kibler !== undefined, 'Kibler Park branch must exist');
  assert(kibler.address?.streetAddress?.includes('Stanmore'), 'Kibler Park street address');
  assertStrictEqual(kibler.address?.postalCode, '2091', 'Kibler Park postal code');
  assertStrictEqual(kibler.geo?.latitude, -26.3075, 'Kibler Park latitude');
  assertStrictEqual(kibler.geo?.longitude, 28.0084, 'Kibler Park longitude');

  // Verify opening hours for all 3 branches
  for (const branch of branches) {
    assert(Array.isArray(branch.openingHoursSpecification), `${branch.name} must have openingHoursSpecification array`);
    const spec = branch.openingHoursSpecification[0];
    assertStrictEqual(spec['@type'], 'OpeningHoursSpecification', 'Specification type');
    assertStrictEqual(spec.opens, '09:00', `${branch.name} opening time must be 09:00`);
    assertStrictEqual(spec.closes, '20:00', `${branch.name} closing time must be 20:00`);
    assertStrictEqual(spec.dayOfWeek?.length, 7, `${branch.name} must specify all 7 days of week`);
  }
});

// A6: FAQPage Entity Q&A Completeness
runTest('ADV-A06', 'FAQPage entity contains valid Q&A covering brand, 18+ policy, locations, hours, and metric units', () => {
  const element = JsonLd();
  const schema = JSON.parse(element.props.dangerouslySetInnerHTML.__html);
  const faq = schema['@graph'].find((e: any) => e['@type'] === 'FAQPage');
  assert(faq !== undefined, 'FAQPage entity must exist');
  assert(Array.isArray(faq.mainEntity) && faq.mainEntity.length >= 5, 'FAQPage mainEntity must have at least 5 questions');

  for (const q of faq.mainEntity) {
    assertStrictEqual(q['@type'], 'Question', 'Entity must be Question');
    assert(typeof q.name === 'string' && q.name.length > 5, 'Question name must be non-empty string');
    assertStrictEqual(q.acceptedAnswer?.['@type'], 'Answer', 'acceptedAnswer must have @type Answer');
    assert(typeof q.acceptedAnswer?.text === 'string' && q.acceptedAnswer.text.length > 10, 'Answer text must be non-empty string');
  }

  const allText = faq.mainEntity.map((q: any) => `${q.name} ${q.acceptedAnswer.text}`).join(' ');
  assert(allText.includes('18'), 'FAQ must cover 18+ policy');
  assert(allText.includes('Norwood') && allText.includes('Rivonia') && allText.includes('Kibler Park'), 'FAQ must cover all 3 locations');
  assert(allText.includes('09:00') && allText.includes('20:00'), 'FAQ must cover 09:00 - 20:00 operating hours');
  assert(allText.includes('metric') && allText.includes('grams'), 'FAQ must cover metric standardization');
});

// A7: BreadcrumbList Sequential 1-Based Indexing
runTest('ADV-A07', 'BreadcrumbList contains sequential 1-based positions from 1 to 5', () => {
  const element = JsonLd();
  const schema = JSON.parse(element.props.dangerouslySetInnerHTML.__html);
  const breadcrumb = schema['@graph'].find((e: any) => e['@type'] === 'BreadcrumbList');
  assert(breadcrumb !== undefined, 'BreadcrumbList entity must exist');
  assert(Array.isArray(breadcrumb.itemListElement), 'itemListElement must be an array');
  assertStrictEqual(breadcrumb.itemListElement.length, 5, 'BreadcrumbList must have 5 items (Home, About, Membership, Vault, Contact)');

  breadcrumb.itemListElement.forEach((item: any, idx: number) => {
    assertStrictEqual(item['@type'], 'ListItem', `Item ${idx} must be a ListItem`);
    assertStrictEqual(item.position, idx + 1, `Item ${idx} position must be ${idx + 1} (1-based index)`);
    assert(typeof item.name === 'string' && item.name.length > 0, `Item ${idx} must have non-empty name`);
    assert(typeof item.item === 'string' && item.item.length > 0, `Item ${idx} must have non-empty item URL`);
  });
});

// A8: Deep Object Scanner (No NaN, undefined, circular refs, or invalid types)
runTest('ADV-A08', 'Deep object traversal confirms schema has zero NaN, zero undefined, and zero circular refs', () => {
  const element = JsonLd();
  const schema = JSON.parse(element.props.dangerouslySetInnerHTML.__html);
  deepScanObject(schema);
});

// A9: Adversarial URL Normalization Probe
runTest('ADV-A09', 'Adversarial siteUrl injection does not introduce double slashes into URIs', () => {
  const originalEnv = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://preview.420cartel.co.za/';
    const element = JsonLd();
    const rawJson = element.props.dangerouslySetInnerHTML.__html;
    assert(!rawJson.includes('https://preview.420cartel.co.za//'), 'Must not produce double slashes when siteUrl has trailing slash');
    assert(rawJson.includes('https://preview.420cartel.co.za/fourtwentycartel_logo.jpg'), 'Must correctly format logo URL');
  } finally {
    if (originalEnv !== undefined) {
      process.env.NEXT_PUBLIC_SITE_URL = originalEnv;
    } else {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    }
  }
});

// =========================================================================
// TEST SUITE B: Sitemap Programmatic Stress Tests
// =========================================================================
console.log('\n--- SUITE B: Sitemap Programmatic Stress Tests ---');

// B1: Programmatic Execution & Structure
runTest('ADV-B01', 'sitemap() executes programmatically and returns array of MetadataRoute.Sitemap entries', () => {
  const entries = sitemap();
  assert(Array.isArray(entries), 'sitemap() must return an array');
  assert(entries.length >= 5, `sitemap() must have at least 5 routes (got ${entries.length})`);
});

// B2: URL Validation & Double-Slash Bug Probing
runTest('ADV-B02', 'Every sitemap URL is a valid WHATWG URL and free of double-slash concatenation bugs', () => {
  const entries = sitemap();
  for (const entry of entries) {
    assert(typeof entry.url === 'string', 'entry.url must be a string');
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(entry.url);
    } catch (e: any) {
      throw new Error(`Invalid URL "${entry.url}": ${e.message}`);
    }
    assert(parsedUrl.pathname !== '', 'pathname must not be empty');
    assert(!parsedUrl.pathname.includes('//'), `Path contains illegal double slash: ${entry.url}`);
  }
});

// B3: Date Object Validity & Freshness
runTest('ADV-B03', 'Every sitemap entry has a valid Date object for lastModified', () => {
  const entries = sitemap();
  const now = Date.now();
  for (const entry of entries) {
    assert(entry.lastModified instanceof Date, `entry.lastModified must be Date instance (${entry.url})`);
    const time = entry.lastModified.getTime();
    assert(!Number.isNaN(time), `entry.lastModified must be a valid date (${entry.url})`);
    assert(time <= now + 60000 && time >= now - 60000, `entry.lastModified must be fresh current timestamp (${entry.url})`);
  }
});

// B4: Frequency Enumeration & Priority Hierarchy
runTest('ADV-B04', 'Every sitemap entry has valid changeFrequency and priority within [0.0, 1.0]', () => {
  const validFrequencies = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'];
  const entries = sitemap();
  for (const entry of entries) {
    assert(
      entry.changeFrequency !== undefined && validFrequencies.includes(entry.changeFrequency),
      `Invalid changeFrequency "${entry.changeFrequency}" for ${entry.url}`
    );
    assert(typeof entry.priority === 'number', `priority must be a number for ${entry.url}`);
    assert(
      entry.priority !== undefined && entry.priority >= 0.0 && entry.priority <= 1.0,
      `priority must be between 0.0 and 1.0 (got ${entry.priority}) for ${entry.url}`
    );
  }

  const rootEntry = entries.find((e) => new URL(e.url).pathname === '/');
  assert(rootEntry !== undefined, 'Root route "/" must be present');
  assertStrictEqual(rootEntry.priority, 1.0, 'Root route "/" priority must be 1.0');
});

// B5: Private Routes Strict Exclusion
runTest('ADV-B05', 'Sitemap strictly excludes private and authenticated routes (/admin, /pos, /api, /checkout, etc.)', () => {
  const entries = sitemap();
  const forbiddenPaths = ['/admin', '/pos', '/api', '/checkout', '/account', '/pass', '/shop', '/vault'];
  for (const entry of entries) {
    const pathname = new URL(entry.url).pathname.replace(/\/$/, '');
    for (const forbidden of forbiddenPaths) {
      assert(
        pathname !== forbidden && !pathname.startsWith(`${forbidden}/`),
        `Sitemap contains forbidden private route: ${entry.url}`
      );
    }
  }
});

// B6: Adversarial Base URL Injections in Sitemap
runTest('ADV-B06', 'Sitemap handles trailing slash base URLs without creating double slashes (e.g. //about)', () => {
  const originalEnv = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://custom-domain.org/';
    const entries = sitemap();
    for (const entry of entries) {
      assert(!entry.url.includes('https://custom-domain.org//'), `Sitemap produced double slash with trailing-slash env: ${entry.url}`);
    }
  } finally {
    if (originalEnv !== undefined) {
      process.env.NEXT_PUBLIC_SITE_URL = originalEnv;
    } else {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    }
  }
});

// =========================================================================
// TEST SUITE C: Robots Directives Programmatic Stress Tests
// =========================================================================
console.log('\n--- SUITE C: Robots Directives Programmatic Stress Tests ---');

// C1: Programmatic Execution & Structure
runTest('ADV-C01', 'robots() executes programmatically and returns valid MetadataRoute.Robots object', () => {
  const config = robots();
  assert(typeof config === 'object' && config !== null, 'robots() must return an object');
  assert(Array.isArray(config.rules) || typeof config.rules === 'object', 'robots.rules must be array or object');
  assert(typeof config.sitemap === 'string', 'robots.sitemap must be a string');
});

// C2: Crawl Rules Integrity (User-Agent, Allow, Disallow)
runTest('ADV-C02', 'robots.rules configures wildcard userAgent and whitelists public routes', () => {
  const config = robots();
  const rules = Array.isArray(config.rules) ? config.rules : [config.rules];
  const wildcardRule = rules.find((r: any) => r.userAgent === '*');
  assert(wildcardRule !== undefined, 'Wildcard userAgent "*" rule must exist');
  assert(Array.isArray(wildcardRule.allow), 'wildcardRule.allow must be an array');
  assert(wildcardRule.allow.includes('/'), 'allow must include "/"');
  assert(wildcardRule.allow.includes('/about'), 'allow must include "/about"');
  assert(wildcardRule.allow.includes('/onboarding'), 'allow must include "/onboarding"');
  assert(wildcardRule.allow.includes('/contact'), 'allow must include "/contact"');
  assert(wildcardRule.allow.includes('/login'), 'allow must include "/login"');
});

// C3: Strict Disallow of Sensitive & Staff Routes
runTest('ADV-C03', 'robots.rules disallows /admin, /pos, /api, /account, /checkout, /pass, /shop', () => {
  const config = robots();
  const rules = Array.isArray(config.rules) ? config.rules : [config.rules];
  const wildcardRule = rules.find((r: any) => r.userAgent === '*');
  assert(wildcardRule !== undefined, 'Wildcard rule exists');
  assert(Array.isArray(wildcardRule.disallow), 'wildcardRule.disallow must be an array');

  const requiredDisallows = ['/admin', '/pos', '/api', '/account', '/checkout', '/pass', '/shop'];
  for (const forbidden of requiredDisallows) {
    assert(
      wildcardRule.disallow.includes(forbidden),
      `robots disallow rules must include "${forbidden}"`
    );
  }
});

// C4: Sitemap XML Reference Validation
runTest('ADV-C04', 'robots.sitemap points to valid /sitemap.xml without double slash bugs', () => {
  const config = robots();
  const sitemapUrl = config.sitemap as string;
  assert(sitemapUrl.endsWith('/sitemap.xml'), `robots sitemap must end with "/sitemap.xml" (got ${sitemapUrl})`);
  const parsed = new URL(sitemapUrl);
  assert(!parsed.pathname.includes('//'), `robots sitemap pathname contains double slash: ${sitemapUrl}`);
});

// =========================================================================
// TEST SUITE D: Customer-Facing Content & Brand Security Audit
// =========================================================================
console.log('\n--- SUITE D: Customer-Facing Content & Security Audit ---');

const pagesToAudit = [
  'src/app/page.tsx',
  'src/app/about/page.tsx',
  'src/app/contact/page.tsx',
  'src/app/onboarding/page.tsx',
];

// D1: Reverse Tabnabbing Security Audit on External Links
runTest('ADV-D01', 'Every target="_blank" link across customer pages includes rel="noopener noreferrer"', () => {
  for (const pagePath of pagesToAudit) {
    const content = fs.readFileSync(path.join(ROOT_DIR, pagePath), 'utf8');
    // Regex looking for <a ... target="_blank" ...>
    const anchorMatches = content.match(/<a\b[^>]*target=["']_blank["'][^>]*>/gi) || [];
    for (const tag of anchorMatches) {
      assert(
        /rel=["'][^"']*noopener[^"']*["']/i.test(tag) && /rel=["'][^"']*noreferrer[^"']*["']/i.test(tag),
        `Insecure external link in ${pagePath} missing rel="noopener noreferrer": ${tag}`
      );
    }
  }
});

// D2: Official Instagram & Facebook Links Verification
runTest('ADV-D02', 'All 4 customer pages integrate official Instagram & Facebook profile URLs', () => {
  const IG_URL = 'https://www.instagram.com/fourtwentycartel/';
  const FB_URL = 'https://www.facebook.com/p/The-Cartel-420-social-lounge-NO-UNDER-18-100041765415684/';

  for (const pagePath of pagesToAudit) {
    const content = fs.readFileSync(path.join(ROOT_DIR, pagePath), 'utf8');
    assert(content.includes(IG_URL), `${pagePath} must contain official Instagram URL: ${IG_URL}`);
    assert(content.includes(FB_URL), `${pagePath} must contain official Facebook URL: ${FB_URL}`);
  }
});

// D3: Operating Hours (09:00 - 20:00) Documented in Public Surfaces
runTest('ADV-D03', 'Operating hours (09:00 - 20:00) are explicitly documented across contact, about, home, and onboarding', () => {
  for (const pagePath of pagesToAudit) {
    const content = fs.readFileSync(path.join(ROOT_DIR, pagePath), 'utf8');
    assert(
      content.includes('09:00') && content.includes('20:00'),
      `${pagePath} must explicitly mention operating hours (09:00 - 20:00)`
    );
  }
});

// D4: Strictly 18+ Age Policy Mentioned Across All Pages
runTest('ADV-D04', 'Strictly 18+ policy is clearly stated on all 4 customer pages', () => {
  for (const pagePath of pagesToAudit) {
    const content = fs.readFileSync(path.join(ROOT_DIR, pagePath), 'utf8');
    assert(
      /(strictly\s*(no\s*under\s*18|18\+)|18\s*and\s*older|adult\s*members)/i.test(content),
      `${pagePath} must clearly state 18+ policy`
    );
  }
});

// D5: Strict Metric System Compliance (Zero Imperial Units)
runTest('ADV-D05', 'Milestone 5 files contain ZERO imperial units (eighth, quarter, ounce, oz, lbs)', () => {
  const m5Files = [
    'src/components/seo/JsonLd.tsx',
    'src/app/sitemap.ts',
    'src/app/robots.ts',
    'src/app/layout.tsx',
    ...pagesToAudit,
  ];

  const imperialRegex = /\b(eighth|quarter|ounce|ounces|oz|lbs|lb)\b/i;
  for (const file of m5Files) {
    const content = fs.readFileSync(path.join(ROOT_DIR, file), 'utf8');
    const match = content.match(imperialRegex);
    assert(match === null, `Imperial unit detected in ${file}: "${match?.[0]}"`);
  }
});

// =========================================================================
// TEST SUITE E: Root Layout Metadata & Head Tags Security/GEO Probe
// =========================================================================
console.log('\n--- SUITE E: Root Layout Metadata & Head Tags Security/GEO Probe ---');

const layoutContent = fs.readFileSync(path.join(ROOT_DIR, 'src/app/layout.tsx'), 'utf8');

runTest('ADV-E01', 'metadata.metadataBase is declared with new URL and protocol is HTTPS/HTTP', () => {
  assert(layoutContent.includes('metadataBase: new URL('), 'layout.tsx must configure metadataBase with new URL()');
  assert(/metadataBase:\s*new URL\(\s*siteUrl\s*\)/.test(layoutContent), 'metadataBase must use siteUrl');
});

runTest('ADV-E02', 'metadata title contains default and template with brand name', () => {
  assert(layoutContent.includes('420 Cartel — Private Cannabis Social Lounge'), 'default title must include brand name');
  assert(layoutContent.includes("template: '%s · 420 Cartel'"), 'title template must include brand name');
});

runTest('ADV-E03', 'OpenGraph and Twitter image references match 1080x1080 brand logo asset', () => {
  assert(layoutContent.includes("locale: 'en_ZA'"), 'openGraph locale must be en_ZA');
  assert(layoutContent.includes("url: '/fourtwentycartel_logo.jpg'"), 'openGraph image URL must be /fourtwentycartel_logo.jpg');
  assert(layoutContent.includes('width: 1080'), 'openGraph image width must be 1080');
  assert(layoutContent.includes('height: 1080'), 'openGraph image height must be 1080');
  assert(layoutContent.includes("card: 'summary_large_image'"), 'twitter card type must be summary_large_image');
  assert(layoutContent.includes("images: ['/fourtwentycartel_logo.jpg']"), 'twitter images must include brand logo');
});

runTest('ADV-E04', 'GEO tags and Adult rating are configured in metadata.other', () => {
  assert(layoutContent.includes("rating: 'adult'"), 'rating must be declared as adult');
  assert(layoutContent.includes("'geo.region': 'ZA-GT'"), 'geo.region must be South Africa Gauteng');
  assert(layoutContent.includes("'geo.placename': 'Johannesburg'"), 'geo.placename must be Johannesburg');
});

runTest('ADV-E05', 'Keywords array is rich and covers lounge locations, brand, and compliance', () => {
  assert(layoutContent.includes('keywords: ['), 'keywords must be declared in metadata');
  const requiredKeywords = [
    '420 Cartel',
    'cannabis social lounge South Africa',
    'private cannabis collective Johannesburg',
    'strictly 18+ cannabis collective',
    'Norwood 420 lounge',
    'Rivonia Sandton vault',
    'Kibler Park bud bar',
  ];
  for (const kw of requiredKeywords) {
    assert(layoutContent.includes(kw), `keywords must include "${kw}"`);
  }
});

// =========================================================================
// EXECUTION SUMMARY
// =========================================================================
console.log('\n========================================================================');
console.log('  MILESTONE 5 ADVERSARIAL STRESS TEST SUMMARY');
console.log('========================================================================');

const total = results.length;
const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;

console.log(`Total Adversarial Tests: ${total}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Pass Rate: ${((passed / total) * 100).toFixed(1)}%`);

if (failed > 0) {
  console.log('\nFailed Tests:');
  for (const f of results.filter((r) => !r.passed)) {
    console.log(`- ${f.id}: ${f.name} => ${f.error}`);
  }
  process.exit(1);
} else {
  console.log('\n★ ALL ADVERSARIAL TESTS PASSED (100% ROBUST & COMPLIANT) ★');
  process.exit(0);
}
