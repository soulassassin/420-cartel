/**
 * Milestone 3 Adversarial Challenge Probe
 * Challenger 2: Thumbnail Rendering & Category Filtering Verification
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

console.log('========================================================================');
console.log('  MILESTONE 3 CHALLENGER 2: ADVERSARIAL STRESS PROBE');
console.log('========================================================================');

let passedTests = 0;
let totalTests = 0;

function runTest(id, name, testFn) {
  totalTests++;
  try {
    testFn();
    passedTests++;
    console.log(`  ✓ PASS [${id}] ${name}`);
  } catch (err) {
    console.error(`  ✗ FAIL [${id}] ${name}`);
    console.error(`    ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// 1. Image Thumbnail Rendering & Layout Bounding
// ---------------------------------------------------------------------------
console.log('\n▶ SUITE 1: Thumbnail Image Rendering & Layout Integrity');

runTest('IMG-01', 'Verify thumbnail layout bounding classes in POS (size-12 shrink-0 overflow-hidden relative)', () => {
  const posCode = fs.readFileSync('src/app/pos/page.tsx', 'utf8');
  assert(posCode.includes('relative size-12 shrink-0 overflow-hidden rounded border border-[color:var(--border-mono)] bg-void'),
    'POS must use size-12 shrink-0 overflow-hidden relative for product thumbnail container');
  assert(posCode.includes('sizes="48px"'), 'POS Image must specify sizes="48px" for optimal loading');
  assert(posCode.includes('className="object-cover"'), 'POS Image must use object-cover to preserve aspect ratio');
});

runTest('IMG-02', 'Verify thumbnail layout bounding classes in Admin Inventory (size-12 shrink-0 overflow-hidden relative)', () => {
  const invCode = fs.readFileSync('src/app/admin/inventory/page.tsx', 'utf8');
  assert(invCode.includes('relative size-12 shrink-0 overflow-hidden rounded border border-[color:var(--border-mono)] bg-void'),
    'Admin Inventory must use size-12 shrink-0 overflow-hidden relative for product thumbnail container');
  assert(invCode.includes('sizes="48px"'), 'Admin Inventory Image must specify sizes="48px"');
  assert(invCode.includes('className="object-cover"'), 'Admin Inventory Image must use object-cover');
});

runTest('IMG-03', 'Verify guard against null/undefined/missing hero_media_url in POS', () => {
  const posCode = fs.readFileSync('src/app/pos/page.tsx', 'utf8');
  // Check that Image is conditionally rendered only when hero_media_url is present
  const regex = /product\.hero_media_url\s*\?\s*\(\s*<div[^>]*>\s*<Image[^>]*src=\{product\.hero_media_url\}/;
  assert(regex.test(posCode), 'POS must check product.hero_media_url before rendering <Image>');
});

runTest('IMG-04', 'Verify guard against null/undefined/missing hero_media_url in Admin Inventory', () => {
  const invCode = fs.readFileSync('src/app/admin/inventory/page.tsx', 'utf8');
  const regex = /product\.hero_media_url\s*\?\s*\(\s*<div[^>]*>\s*<Image[^>]*src=\{product\.hero_media_url\}/;
  assert(regex.test(invCode), 'Admin Inventory must check product.hero_media_url before rendering <Image>');
});

runTest('IMG-05', 'Verify Next.js remotePatterns whitelist covers all remote product media domains', () => {
  const nextConfig = fs.readFileSync('next.config.ts', 'utf8');
  const fixtures = fs.readFileSync('src/lib/demo/fixtures.ts', 'utf8');
  
  // Extract all hero_media_url values from fixtures
  const urls = [];
  const urlRegex = /hero_media_url:\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = urlRegex.exec(fixtures)) !== null) {
    urls.push(match[1]);
  }
  
  assert(urls.length >= 16, `Expected at least 16 hero_media_url entries in fixtures, found ${urls.length}`);
  
  for (const url of urls) {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const parsed = new URL(url);
      const host = parsed.hostname;
      assert(
        nextConfig.includes(host),
        `next.config.ts must allow hostname "${host}" in remotePatterns. Found in URL: ${url}`
      );
    } else {
      // Local path, must start with /
      assert(url.startsWith('/'), `Relative media URL must start with '/': ${url}`);
    }
  }
});

// ---------------------------------------------------------------------------
// 2. Category Filtering Deep Dive
// ---------------------------------------------------------------------------
console.log('\n▶ SUITE 2: Category Filtering Logic & Product Counts');

// We can read fixtures and test the filtering logic directly
const fixturesContent = fs.readFileSync('src/lib/demo/fixtures.ts', 'utf8');

// Parse products from fixtures
const productBlocks = [];
const prodRegex = /sku:\s*['"](CRT-[^'"]+)['"][\s\S]*?name:\s*['"]([^'"]+)['"][\s\S]*?category:\s*['"]([^'"]+)['"][\s\S]*?strain:\s*['"]([^'"]+)['"][\s\S]*?hero_media_url:\s*['"]([^'"]+)['"]/g;
let pMatch;
while ((pMatch = prodRegex.exec(fixturesContent)) !== null) {
  productBlocks.push({
    sku: pMatch[1],
    name: pMatch[2],
    category: pMatch[3],
    strain: pMatch[4],
    hero_media_url: pMatch[5],
  });
}

runTest('CAT-01', 'Catalog fixtures contain exactly 16 products', () => {
  assert.strictEqual(productBlocks.length, 16, `Expected 16 products, parsed ${productBlocks.length}`);
});

runTest('CAT-02', 'VAPE category filtering returns exactly 6 Awaken vape products', () => {
  const vapeProducts = productBlocks.filter((p) => p.category === 'VAPE');
  assert.strictEqual(vapeProducts.length, 6, `Expected 6 VAPE products, found ${vapeProducts.length}`);
  
  // Verify all are Awaken vapes
  for (const vp of vapeProducts) {
    assert.strictEqual(vp.category, 'VAPE');
    assert(vp.name.toLowerCase().includes('awaken'), `Vape product "${vp.name}" should be Awaken brand`);
  }
  
  const expectedSkus = [
    'CRT-VP-PERMMARK',
    'CRT-VP-BANSHACK',
    'CRT-VP-DUCKTAPE',
    'CRT-VP-SOURDIESEL',
    'CRT-VP-ETCHEDDUO',
    'CRT-VP-BLASTER',
  ];
  for (const sku of expectedSkus) {
    assert(vapeProducts.some((p) => p.sku === sku), `Missing expected vape SKU: ${sku}`);
  }
});

runTest('CAT-03', 'ACCESSORY category filtering returns exactly 2 Awaken hardware products', () => {
  const accessoryProducts = productBlocks.filter((p) => p.category === 'ACCESSORY');
  assert.strictEqual(accessoryProducts.length, 2, `Expected 2 ACCESSORY products, found ${accessoryProducts.length}`);
  
  for (const ap of accessoryProducts) {
    assert.strictEqual(ap.category, 'ACCESSORY');
    assert(ap.name.toLowerCase().includes('battery') || ap.sku.includes('510'), `Accessory product "${ap.name}" should be hardware`);
  }
  
  const expectedSkus = ['CRT-AC-VOLT510', 'CRT-AC-GHOST510'];
  for (const sku of expectedSkus) {
    assert(accessoryProducts.some((p) => p.sku === sku), `Missing expected accessory SKU: ${sku}`);
  }
});

runTest('CAT-04', 'No category cross-contamination (disjoint categories)', () => {
  const categories = ['FLOWER', 'VAPE', 'ELIXIR_OIL', 'PRE_ROLL', 'EDIBLE', 'ACCESSORY'];
  const categoryCounts = {};
  for (const cat of categories) {
    const prods = productBlocks.filter((p) => p.category === cat);
    categoryCounts[cat] = prods.length;
    // Verify each product has only one category matching
    for (const p of prods) {
      assert.strictEqual(p.category, cat);
    }
  }
  
  assert.strictEqual(categoryCounts['FLOWER'], 2);
  assert.strictEqual(categoryCounts['VAPE'], 6);
  assert.strictEqual(categoryCounts['ELIXIR_OIL'], 3);
  assert.strictEqual(categoryCounts['PRE_ROLL'], 1);
  assert.strictEqual(categoryCounts['EDIBLE'], 2);
  assert.strictEqual(categoryCounts['ACCESSORY'], 2);
  
  const sum = Object.values(categoryCounts).reduce((a, b) => a + b, 0);
  assert.strictEqual(sum, 16, `Sum of categories must equal 16, got ${sum}`);
});

runTest('CAT-05', 'POS category tabs contain VAPE and ACCESSORY alongside standard categories', () => {
  const posCode = fs.readFileSync('src/app/pos/page.tsx', 'utf8');
  assert(posCode.includes("{ key: 'VAPE', label: 'Vapes & Carts' }"), 'POS missing VAPE category tab');
  assert(posCode.includes("{ key: 'ACCESSORY', label: 'Hardware & Gear' }"), 'POS missing ACCESSORY category tab');
  assert(posCode.includes("{ key: 'ALL', label: 'All Vault' }"), 'POS missing ALL tab');
  assert(posCode.includes("{ key: 'FLOWER', label: 'Flower (g)' }"), 'POS missing FLOWER tab');
  assert(posCode.includes("{ key: 'ELIXIR_OIL', label: 'Elixirs (ml)' }"), 'POS missing ELIXIR_OIL tab');
  assert(posCode.includes("{ key: 'PRE_ROLL', label: 'Pre-Rolls' }"), 'POS missing PRE_ROLL tab');
  assert(posCode.includes("{ key: 'EDIBLE', label: 'Edibles' }"), 'POS missing EDIBLE tab');
});

runTest('CAT-06', 'Shop page category tabs contain VAPE and ACCESSORY', () => {
  const shopCode = fs.readFileSync('src/app/shop/page.tsx', 'utf8');
  assert(shopCode.includes("{ key: 'VAPE', label: 'Vapes & Carts (ea)' }"), 'Shop missing VAPE tab');
  assert(shopCode.includes("{ key: 'ACCESSORY', label: 'Hardware & Gear (ea)' }"), 'Shop missing ACCESSORY tab');
});

// ---------------------------------------------------------------------------
// 3. Combined Filter & Search Query Simulation
// ---------------------------------------------------------------------------
console.log('\n▶ SUITE 3: Combined Category and Query Search Simulation');

function filterSim(items, category, query) {
  const needle = (query || '').trim().toLowerCase();
  return items.filter((entry) => {
    if (category !== 'ALL' && entry.category !== category) return false;
    if (!needle) return true;
    return (
      entry.name.toLowerCase().includes(needle) ||
      entry.sku.toLowerCase().includes(needle) ||
      entry.strain.toLowerCase().includes(needle)
    );
  });
}

runTest('SRCH-01', 'Category VAPE + query "rosin" matches only live rosin vapes', () => {
  const results = filterSim(productBlocks, 'VAPE', 'rosin');
  assert.strictEqual(results.length, 2, `Expected 2 live rosin vapes, got ${results.length}`);
  assert(results.every((p) => p.category === 'VAPE'));
  assert(results.some((p) => p.sku === 'CRT-VP-PERMMARK'));
  assert(results.some((p) => p.sku === 'CRT-VP-BANSHACK'));
});

runTest('SRCH-02', 'Category ACCESSORY + query "smart" matches only VOLT Smart 510', () => {
  const results = filterSim(productBlocks, 'ACCESSORY', 'smart');
  assert.strictEqual(results.length, 1, `Expected 1 smart accessory, got ${results.length}`);
  assert.strictEqual(results[0].sku, 'CRT-AC-VOLT510');
});

runTest('SRCH-03', 'Category VAPE + query "flower" returns 0 items without throwing', () => {
  const results = filterSim(productBlocks, 'VAPE', 'flower');
  assert.strictEqual(results.length, 0, `Expected 0 results, got ${results.length}`);
});

runTest('SRCH-04', 'Category ACCESSORY + query "CRT-VP" returns 0 items without throwing', () => {
  const results = filterSim(productBlocks, 'ACCESSORY', 'CRT-VP');
  assert.strictEqual(results.length, 0, `Expected 0 results, got ${results.length}`);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n========================================================================');
console.log(`  PROBE EXECUTION SUMMARY: ${passedTests}/${totalTests} Passed (${Math.round((passedTests/totalTests)*100)}%)`);
console.log('========================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
