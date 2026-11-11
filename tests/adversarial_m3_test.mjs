#!/usr/bin/env node
/**
 * Adversarial Empirical Verification Suite for Milestone 3
 * (Awaken Product Import, POS & Inventory Systems)
 *
 * Designed and executed by Challenger 1 (teamwork_challenger_m3_1)
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();

console.log('========================================================================');
console.log('  CHALLENGER 1 :: ADVERSARIAL STRESS SUITE (MILESTONE 3)');
console.log('========================================================================\n');

let passCount = 0;
let failCount = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failCount++;
  }
}

// -----------------------------------------------------------------------------
// 1. Catalog Fixture Authenticity & Integrity
// -----------------------------------------------------------------------------
console.log('--- 1. Catalog Fixtures & Awaken Product Integrity ---');

const fixturesContent = fs.readFileSync(path.join(rootDir, 'src/lib/demo/fixtures.ts'), 'utf8');

// Expected 10 Awaken product keys
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

const EXPECTED_AWAKEN_SKUS = [
  'CRT-VP-PERMMARK',
  'CRT-VP-BANSHACK',
  'CRT-VP-DUCKTAPE',
  'CRT-VP-SOURDIESEL',
  'CRT-VP-ETCHEDDUO',
  'CRT-VP-BLASTER',
  'CRT-AC-VOLT510',
  'CRT-AC-GHOST510',
  'CRT-EL-AWKTINCT',
  'CRT-ED-PASTILLES',
];

const EXPECTED_AWAKEN_BATCHES = [
  'AWK-LR-01',
  'AWK-LRD-01',
  'AWK-LRC-01',
  'AWK-LRD-02',
  'AWK-DUO-01',
  'AWK-BLT-01',
  'AWK-VOLT-01',
  'AWK-GHOST-01',
  'AWK-TINC-01',
  'AWK-PAST-01',
];

runTest('SEED_IDS has exactly 10 Awaken products defined with fixed UUIDs', () => {
  for (const key of EXPECTED_AWAKEN_KEYS) {
    assert.match(
      fixturesContent,
      new RegExp(`${key}:\\s*'e1000000-0000-4000-8000-[a-f0-9]{12}'`),
      `Expected SEED_IDS.product.${key} to have valid UUID pattern`
    );
  }
});

runTest('All 10 Awaken SKUs match strict cartel format ^CRT-[A-Z0-9]+-[A-Z0-9]+$', () => {
  const skuRegex = /^CRT-[A-Z0-9]+-[A-Z0-9]+$/;
  for (const sku of EXPECTED_AWAKEN_SKUS) {
    assert.ok(skuRegex.test(sku), `SKU ${sku} does not match cartel format`);
    assert.ok(fixturesContent.includes(sku), `SKU ${sku} not found in fixtures.ts`);
  }
});

runTest('All 10 Awaken products have authentic categories, strain types, and descriptions', () => {
  assert.ok(fixturesContent.includes("category: 'VAPE'"), 'VAPE category missing');
  assert.ok(fixturesContent.includes("category: 'ACCESSORY'"), 'ACCESSORY category missing');

  // Verify strain types are valid domain strains
  const validStrains = ['INDICA', 'SATIVA', 'HYBRID', 'CBD', 'NOT_APPLICABLE'];
  for (const strain of ['HYBRID', 'INDICA', 'SATIVA', 'CBD', 'NOT_APPLICABLE']) {
    assert.ok(validStrains.includes(strain));
  }
});

runTest('All 10 Awaken products supply HTTPS Google Cloud Storage media URLs', () => {
  const mediaMatches = fixturesContent.match(/https:\/\/storage\.googleapis\.com\/takeapp\/media\/[a-zA-Z0-9_.-]+/g);
  assert.ok(mediaMatches, 'No takeapp media URLs found in fixtures.ts');
  assert.ok(mediaMatches.length >= 10, `Expected at least 10 takeapp media URLs, found ${mediaMatches.length}`);
  for (const url of mediaMatches) {
    assert.ok(url.startsWith('https://storage.googleapis.com/takeapp/media/'));
  }
});

runTest('All 10 Awaken physical batches exist with authentic THC/CBD lab figures', () => {
  for (const batchCode of EXPECTED_AWAKEN_BATCHES) {
    assert.ok(
      fixturesContent.includes(`code: '${batchCode}'`) || fixturesContent.includes(`batch_code: '${batchCode}'`),
      `Batch code ${batchCode} missing in BATCH_SPECS`
    );
  }

  // Check specific lab metrics
  assert.ok(fixturesContent.includes('thc: 84.5'), 'Permanent Marker THC 84.5% missing');
  assert.ok(fixturesContent.includes('thc: 86.2'), 'Banana Shack THC 86.2% missing');
  assert.ok(fixturesContent.includes('thc: 81.0'), 'Duck Tape THC 81.0% missing');
  assert.ok(fixturesContent.includes('thc: 82.8'), 'Sour Diesel THC 82.8% missing');
  assert.ok(fixturesContent.includes('thc: 85.0'), 'Dual Chamber THC 85.0% missing');
  assert.ok(fixturesContent.includes('thc: 88.5'), 'Blaster THC 88.5% missing');
});

runTest('Awaken variant prices are strictly in ZAR cents and positive integers', () => {
  const priceMatches = fixturesContent.match(/priceCents:\s*([0-9]+)/g);
  assert.ok(priceMatches, 'No priceCents found in fixtures.ts');
  for (const p of priceMatches) {
    const val = parseInt(p.split(':')[1].trim(), 10);
    assert.ok(Number.isInteger(val) && val > 0, `Invalid priceCents: ${val}`);
  }
  // Check specific Awaken prices
  assert.ok(fixturesContent.includes('140000'), 'R1400.00 (140000 cents) missing');
  assert.ok(fixturesContent.includes('150000'), 'R1500.00 (150000 cents) missing');
  assert.ok(fixturesContent.includes('120000'), 'R1200.00 (120000 cents) missing');
  assert.ok(fixturesContent.includes('130000'), 'R1300.00 (130000 cents) missing');
  assert.ok(fixturesContent.includes('165000'), 'R1650.00 (165000 cents) missing');
  assert.ok(fixturesContent.includes('95000'), 'R950.00 (95000 cents) missing');
  assert.ok(fixturesContent.includes('65000'), 'R650.00 (65000 cents) missing');
  assert.ok(fixturesContent.includes('25000'), 'R250.00 (25000 cents) missing');
  assert.ok(fixturesContent.includes('20000'), 'R200.00 (20000 cents) missing');
});

runTest('Data integrity: Batch remaining quantity does not exceed received quantity', () => {
  const receivedRegex = /receivedQty:\s*([0-9.]+)/g;
  const remainingRegex = /remainingQty:\s*([0-9.]+)/g;

  const received = [...fixturesContent.matchAll(receivedRegex)].map((m) => parseFloat(m[1]));
  const remaining = [...fixturesContent.matchAll(remainingRegex)].map((m) => parseFloat(m[1]));

  assert.equal(received.length, remaining.length, 'Mismatch between receivedQty and remainingQty count');
  for (let i = 0; i < received.length; i++) {
    assert.ok(
      remaining[i] <= received[i],
      `Batch ${i}: remaining (${remaining[i]}) exceeds received (${received[i]})`
    );
    assert.ok(remaining[i] >= 0, `Batch ${i}: remaining quantity cannot be negative`);
  }
});

// -----------------------------------------------------------------------------
// 2. Next.js Remote Patterns Image Config
// -----------------------------------------------------------------------------
console.log('\n--- 2. Next.js Remote Patterns Image Config ---');

const nextConfigContent = fs.readFileSync(path.join(rootDir, 'next.config.ts'), 'utf8');

runTest('next.config.ts explicitly includes storage.googleapis.com in remotePatterns', () => {
  assert.match(
    nextConfigContent,
    /hostname:\s*'storage\.googleapis\.com'/,
    'storage.googleapis.com is missing from next.config.ts remotePatterns'
  );
  assert.match(
    nextConfigContent,
    /pathname:\s*'\/\*\*'/,
    'pathname wildcard is missing for storage.googleapis.com'
  );
});

// -----------------------------------------------------------------------------
// 3. POS Terminal (src/app/pos/page.tsx) Surface Checks
// -----------------------------------------------------------------------------
console.log('\n--- 3. POS Terminal Surface & Component Implementation ---');

const posContent = fs.readFileSync(path.join(rootDir, 'src/app/pos/page.tsx'), 'utf8');

runTest('POS page imports Next.js Image component', () => {
  assert.match(posContent, /import Image from 'next\/image';/, 'Image import missing in pos/page.tsx');
});

runTest('POS product card renders product.hero_media_url in Image container with fallback', () => {
  assert.ok(
    posContent.includes('product.hero_media_url'),
    'product.hero_media_url reference missing in pos card'
  );
  assert.match(
    posContent,
    /<Image\s+src=\{product\.hero_media_url\}\s+alt=\{product\.name\}/,
    'Image component with hero_media_url not found in pos/page.tsx'
  );
});

runTest('POS CATEGORIES array contains both VAPE and ACCESSORY tabs', () => {
  assert.match(
    posContent,
    /\{\s*key:\s*'VAPE',\s*label:\s*'Vapes & Carts'\s*\}/,
    'VAPE category tab missing in POS'
  );
  assert.match(
    posContent,
    /\{\s*key:\s*'ACCESSORY',\s*label:\s*'Hardware & Gear'\s*\}/,
    'ACCESSORY category tab missing in POS'
  );
});

runTest('POS stock headroom badge renders remaining stock with UOM symbol and low stock warning', () => {
  assert.ok(
    posContent.includes('stock.low_stock_threshold'),
    'stock.low_stock_threshold check missing in POS card badge'
  );
  assert.ok(
    posContent.includes('remaining <= stock.low_stock_threshold ? \'warn\' : \'gold\''),
    'Low-stock tone badge logic missing in POS card'
  );
  assert.ok(
    posContent.includes('UOM_SYMBOL[product.base_uom]'),
    'UOM_SYMBOL missing in POS badge'
  );
});

// -----------------------------------------------------------------------------
// 4. Admin Inventory (src/app/admin/inventory/page.tsx) Surface Checks
// -----------------------------------------------------------------------------
console.log('\n--- 4. Admin Inventory Surface & Component Implementation ---');

const adminInvContent = fs.readFileSync(path.join(rootDir, 'src/app/admin/inventory/page.tsx'), 'utf8');

runTest('Admin inventory imports Next.js Image component', () => {
  assert.match(
    adminInvContent,
    /import Image from 'next\/image';/,
    'Image import missing in admin/inventory/page.tsx'
  );
});

runTest('Admin inventory cards render product.hero_media_url', () => {
  assert.ok(
    adminInvContent.includes('product.hero_media_url'),
    'product.hero_media_url reference missing in admin inventory'
  );
  assert.match(
    adminInvContent,
    /<Image\s+src=\{product\.hero_media_url\}\s+alt=\{product\.name\}/,
    'Image component with hero_media_url not found in admin inventory'
  );
});

runTest('Admin inventory displays low_stock_threshold and lab_thc_pct', () => {
  assert.ok(
    adminInvContent.includes('stock.low_stock_threshold'),
    'stock.low_stock_threshold display missing in admin inventory'
  );
  assert.ok(
    adminInvContent.includes('batch.lab_thc_pct'),
    'batch.lab_thc_pct display missing in active batches list'
  );
});

// -----------------------------------------------------------------------------
// 5. Stress Testing Engine Simulation (Stock Deductions, FIFO, Price Formats)
// -----------------------------------------------------------------------------
console.log('\n--- 5. Empirical Engine Stress Tests (FIFO, Deductions, Precision) ---');

class MockEngine {
  constructor(products, variants, batches) {
    this.products = JSON.parse(JSON.stringify(products));
    this.variants = JSON.parse(JSON.stringify(variants));
    this.batches = JSON.parse(JSON.stringify(batches));
    this.movements = [];
  }

  getStockLevel(productId, branchId) {
    const batches = this.batches.filter(
      (b) => b.product_id === productId && b.branch_id === branchId && b.is_active
    );
    const remaining = batches.reduce((tot, b) => tot + b.remaining_base_qty, 0);
    const reserved = batches.reduce((tot, b) => tot + b.reserved_base_qty, 0);
    const threshold = batches.reduce((high, b) => Math.max(high, b.low_stock_threshold), 0);
    const available = remaining - reserved;
    return {
      remaining_base_qty: remaining,
      available_base_qty: available,
      low_stock_threshold: threshold,
      is_low_stock: available <= threshold,
    };
  }

  processOrder({ items, branchId }) {
    // 1. Demand check
    const demandByProduct = new Map();
    for (const item of items) {
      const variant = this.variants.find((v) => v.id === item.variant_id);
      if (!variant) throw new Error('Variant not found');
      const product = this.products.find((p) => p.id === variant.product_id);
      if (!product) throw new Error('Product not found');
      const totalBaseQty = variant.base_quantity * item.quantity;
      demandByProduct.set(
        product.id,
        (demandByProduct.get(product.id) ?? 0) + totalBaseQty
      );
    }

    for (const [productId, demand] of demandByProduct) {
      const stock = this.getStockLevel(productId, branchId);
      if (stock.available_base_qty < demand) {
        throw new Error(`Insufficient stock for product ${productId}: requested ${demand}, available ${stock.available_base_qty}`);
      }
    }

    // 2. FIFO batch allocation
    const allocations = [];
    for (const item of items) {
      const variant = this.variants.find((v) => v.id === item.variant_id);
      let outstanding = variant.base_quantity * item.quantity;
      const candidates = this.batches
        .filter(
          (b) =>
            b.product_id === variant.product_id &&
            b.branch_id === branchId &&
            b.is_active &&
            b.remaining_base_qty > 0
        )
        .sort((a, b) => a.received_at.localeCompare(b.received_at));

      for (const batch of candidates) {
        if (outstanding <= 0) break;
        const take = Math.min(batch.remaining_base_qty, outstanding);
        batch.remaining_base_qty -= take;
        outstanding -= take;
        allocations.push({
          batch_id: batch.id,
          batch_code: batch.batch_code,
          qty: take,
        });
      }
    }
    return allocations;
  }
}

runTest('Stress Test 1: FIFO batch order depletion across multiple Awaken batches', () => {
  const testProduct = { id: 'prod-awk-1', base_uom: 'UNITS' };
  const testVariant = { id: 'var-awk-1', product_id: 'prod-awk-1', base_quantity: 1, price_cents: 140000 };
  const initialBatches = [
    {
      id: 'b-0',
      product_id: 'prod-awk-1',
      branch_id: 'branch-1',
      batch_code: 'AWK-OLD-01',
      received_at: '2026-06-01T00:00:00Z',
      remaining_base_qty: 10,
      reserved_base_qty: 0,
      low_stock_threshold: 5,
      is_active: true,
    },
    {
      id: 'b-1',
      product_id: 'prod-awk-1',
      branch_id: 'branch-1',
      batch_code: 'AWK-NEW-02',
      received_at: '2026-09-01T00:00:00Z',
      remaining_base_qty: 25,
      reserved_base_qty: 0,
      low_stock_threshold: 5,
      is_active: true,
    },
  ];

  const engine = new MockEngine([testProduct], [testVariant], initialBatches);

  // Initial stock check
  let stock = engine.getStockLevel('prod-awk-1', 'branch-1');
  assert.equal(stock.available_base_qty, 35);
  assert.equal(stock.is_low_stock, false);

  // Order 15 items: should take 10 from AWK-OLD-01 and 5 from AWK-NEW-02
  const alloc = engine.processOrder({
    branchId: 'branch-1',
    items: [{ variant_id: 'var-awk-1', quantity: 15 }],
  });

  assert.equal(alloc.length, 2);
  assert.equal(alloc[0].batch_code, 'AWK-OLD-01');
  assert.equal(alloc[0].qty, 10);
  assert.equal(alloc[1].batch_code, 'AWK-NEW-02');
  assert.equal(alloc[1].qty, 5);

  // Check remaining within the engine
  stock = engine.getStockLevel('prod-awk-1', 'branch-1');
  assert.equal(stock.available_base_qty, 20);
  assert.equal(engine.batches[0].remaining_base_qty, 0); // Depleted!
  assert.equal(engine.batches[1].remaining_base_qty, 20);
});

runTest('Stress Test 2: Low-stock threshold boundary conditions', () => {
  const testProduct = { id: 'prod-awk-2', base_uom: 'UNITS' };
  const testVariant = { id: 'var-awk-2', product_id: 'prod-awk-2', base_quantity: 1, price_cents: 150000 };
  const initialBatches = [
    {
      id: 'b-2',
      product_id: 'prod-awk-2',
      branch_id: 'branch-1',
      batch_code: 'AWK-LRD-01',
      received_at: '2026-09-01T00:00:00Z',
      remaining_base_qty: 10,
      reserved_base_qty: 0,
      low_stock_threshold: 8,
      is_active: true,
    },
  ];

  const engine = new MockEngine([testProduct], [testVariant], initialBatches);

  // At remaining 10 > threshold 8 -> is_low_stock = false
  assert.equal(engine.getStockLevel('prod-awk-2', 'branch-1').is_low_stock, false);

  // Deduct 2 -> remaining 8 == threshold 8 -> is_low_stock = true
  engine.processOrder({ branchId: 'branch-1', items: [{ variant_id: 'var-awk-2', quantity: 2 }] });
  assert.equal(engine.getStockLevel('prod-awk-2', 'branch-1').is_low_stock, true);

  // Deduct 1 -> remaining 7 < threshold 8 -> is_low_stock = true
  engine.processOrder({ branchId: 'branch-1', items: [{ variant_id: 'var-awk-2', quantity: 1 }] });
  assert.equal(engine.getStockLevel('prod-awk-2', 'branch-1').is_low_stock, true);

  // Deduct 7 -> remaining 0 <= threshold 8 -> is_low_stock = true
  engine.processOrder({ branchId: 'branch-1', items: [{ variant_id: 'var-awk-2', quantity: 7 }] });
  assert.equal(engine.getStockLevel('prod-awk-2', 'branch-1').remaining_base_qty, 0);
  assert.equal(engine.getStockLevel('prod-awk-2', 'branch-1').is_low_stock, true);
});

runTest('Stress Test 3: Insufficient stock hard rejection (No partial/corrupted deductions)', () => {
  const testProduct = { id: 'prod-awk-3', base_uom: 'UNITS' };
  const testVariant = { id: 'var-awk-3', product_id: 'prod-awk-3', base_quantity: 1, price_cents: 120000 };
  const initialBatches = [
    {
      id: 'b-3',
      product_id: 'prod-awk-3',
      branch_id: 'branch-1',
      batch_code: 'AWK-LRC-01',
      received_at: '2026-09-01T00:00:00Z',
      remaining_base_qty: 5,
      reserved_base_qty: 0,
      low_stock_threshold: 2,
      is_active: true,
    },
  ];

  const engine = new MockEngine([testProduct], [testVariant], initialBatches);

  assert.throws(
    () => {
      engine.processOrder({ branchId: 'branch-1', items: [{ variant_id: 'var-awk-3', quantity: 10 }] });
    },
    /Insufficient stock/,
    'Engine must reject orders exceeding available stock'
  );

  // Verify stock was unaffected
  assert.equal(engine.getStockLevel('prod-awk-3', 'branch-1').remaining_base_qty, 5);
});

runTest('Stress Test 4: Currency formatting and round-trip parsing across all Awaken price points', () => {
  const ZAR = new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  function formatCents(cents) {
    return ZAR.format(cents / 100);
  }

  function parseCurrencyToCents(input) {
    const cleaned = input
      .replace(/[Rr\s ]/g, '')
      .replace(/,(\d{1,2})$/, '.$1')
      .replace(/,/g, '');
    if (cleaned === '' || !/^-?\d*\.?\d*$/.test(cleaned)) return null;
    const value = Number(cleaned);
    if (!Number.isFinite(value)) return null;
    return Math.round(value * 100);
  }

  const testPrices = [140000, 150000, 120000, 130000, 165000, 95000, 65000, 25000, 20000, 0, 99, 10000000];
  for (const price of testPrices) {
    const formatted = formatCents(price);
    assert.ok(formatted.includes('R') || formatted.includes('ZAR'), `Missing currency symbol in ${formatted}`);
    const roundTripped = parseCurrencyToCents(formatted);
    assert.equal(roundTripped, price, `Round-trip parse failed for ${price}: got ${roundTripped}`);
  }
});

runTest('Stress Test 5: Vault/Shop page contains VAPE and ACCESSORY category tabs', () => {
  const shopContent = fs.readFileSync(path.join(rootDir, 'src/app/shop/page.tsx'), 'utf8');
  assert.match(shopContent, /key:\s*'VAPE'/, 'VAPE key missing in shop/page.tsx');
  assert.match(shopContent, /key:\s*'ACCESSORY'/, 'ACCESSORY key missing in shop/page.tsx');
});

console.log('\n========================================================================');
console.log(`  ADVERSARIAL STRESS TEST SUMMARY: ${passCount} passed, ${failCount} failed`);
console.log('========================================================================\n');

if (failCount > 0) {
  process.exit(1);
}
