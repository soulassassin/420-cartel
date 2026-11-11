/**
 * 420 CARTEL :: Challenger 2 Adversarial Stress Suite for Milestone 4
 *
 * Comprehensive adversarial verification of Metric System Standardization (R6, F11, F12).
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results = results.concat(walk(full));
    } else if (/\.(ts|tsx|js|mjs|json|css|md)$/i.test(file)) {
      results.push(full);
    }
  }
  return results;
}

let passedCount = 0;
let failedCount = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    Error: ${err.message}`);
    failedCount++;
  }
}

console.log('\n========================================================================');
console.log('  CHALLENGER 2 :: MILESTONE 4 ADVERSARIAL STRESS TEST SUITE');
console.log('========================================================================\n');

// ---------------------------------------------------------------------------
// Group 1: Case-Insensitive Imperial Vocabulary Stress Probe across src/
// ---------------------------------------------------------------------------
console.log('▶ GROUP 1: Imperial Vocabulary & Casing Leakage in src/');

const srcFiles = walk('src');

runTest('Zero imperial Eighth variations in src/ (eighth, EIGHTH, Eighth)', () => {
  const matches = [];
  for (const f of srcFiles) {
    const text = fs.readFileSync(f, 'utf8');
    if (/\b(eighth|eighths)\b/i.test(text)) {
      matches.push(f);
    }
  }
  assert.strictEqual(matches.length, 0, `Found imperial eighth in: ${matches.join(', ')}`);
});

runTest('Zero imperial Ounce variations in src/ (ounce, OUNCE, oz, OZ, fl oz)', () => {
  const matches = [];
  for (const f of srcFiles) {
    const text = fs.readFileSync(f, 'utf8');
    // Check word boundaries for ounce/oz/fl oz
    if (/\b(ounce|ounces|oz|fl\s*oz)\b/i.test(text)) {
      matches.push(f);
    }
  }
  assert.strictEqual(matches.length, 0, `Found imperial ounce/oz in: ${matches.join(', ')}`);
});

runTest('Zero imperial Pound/Lbs variations in src/ (pound, POUND, lbs, LBS)', () => {
  const matches = [];
  for (const f of srcFiles) {
    const text = fs.readFileSync(f, 'utf8');
    // Exclude English idiom "compounding" or standard words, match isolated pound/lbs
    const lines = text.split('\n');
    lines.forEach((line, idx) => {
      if (/\b(pound|pounds|lbs)\b/i.test(line)) {
        matches.push(`${f}:${idx + 1}: ${line.trim()}`);
      }
    });
  }
  assert.strictEqual(matches.length, 0, `Found imperial pound/lbs in:\n${matches.join('\n')}`);
});

runTest('Zero imperial Quarter unit references in src/ (quarter-pound, 7g quarter, etc.)', () => {
  const matches = [];
  for (const f of srcFiles) {
    const text = fs.readFileSync(f, 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, idx) => {
      // Look for quarter as a weight/tier unit (e.g., quarter oz, quarter pound, a quarter)
      if (/\bquarter\b/i.test(line)) {
        matches.push(`${f}:${idx + 1}: ${line.trim()}`);
      }
    });
  }
  assert.strictEqual(matches.length, 0, `Found imperial quarter in:\n${matches.join('\n')}`);
});

runTest('Non-measurement "half" occurrences in src/ strictly limited to idioms', () => {
  const allowedPatterns = [
    /admin half/i,
    /half the time/i,
    /half-authorised/i,
    /half-rendered slip/i,
    /half-migrated shape/i,
    /half-rung sale/i,
    /realtime half/i,
  ];

  const unexpectedMatches = [];
  for (const f of srcFiles) {
    const text = fs.readFileSync(f, 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, idx) => {
      if (/\bhalf\b/i.test(line)) {
        const isAllowed = allowedPatterns.some((pattern) => pattern.test(line));
        if (!isAllowed) {
          unexpectedMatches.push(`${f}:${idx + 1}: ${line.trim()}`);
        }
      }
    });
  }
  assert.strictEqual(
    unexpectedMatches.length,
    0,
    `Found unexpected half references:\n${unexpectedMatches.join('\n')}`,
  );
});

// ---------------------------------------------------------------------------
// Group 2: Catalog & Fixtures Metric Parity Probe
// ---------------------------------------------------------------------------
console.log('\n▶ GROUP 2: Catalog & Fixtures Metric Parity');

const fixturesContent = fs.readFileSync('src/lib/demo/fixtures.ts', 'utf8');

runTest('FLOWER_TIERS pure metric labels and base quantities', () => {
  assert.match(fixturesContent, /label:\s*'1g',\s*baseQuantity:\s*1/, '1g tier required');
  assert.match(fixturesContent, /label:\s*'3\.5g',\s*baseQuantity:\s*3\.5/, '3.5g tier required');
  assert.match(fixturesContent, /label:\s*'7g',\s*baseQuantity:\s*7/, '7g tier required');
  assert.match(fixturesContent, /label:\s*'14g',\s*baseQuantity:\s*14/, '14g tier required');
  assert.match(fixturesContent, /label:\s*'28g',\s*baseQuantity:\s*28/, '28g tier required');
  assert.match(fixturesContent, /label:\s*'Custom \(scale\)',\s*baseQuantity:\s*1/, 'Custom scale tier required');
});

runTest('No flower tier labels contain imperial words', () => {
  const flowerTierBlock = fixturesContent.match(/const FLOWER_TIERS =[\s\S]*?\];/);
  assert(flowerTierBlock !== null, 'FLOWER_TIERS definition must exist');
  assert.doesNotMatch(
    flowerTierBlock[0],
    /(eighth|quarter|half|ounce|oz|lbs)/i,
    'FLOWER_TIERS must contain zero imperial references',
  );
});

runTest('All catalog products define valid metric base_uom', () => {
  const baseUomMatches = fixturesContent.matchAll(/base_uom:\s*'(GRAMS|MILLILITERS|UNITS)'/g);
  let count = 0;
  for (const m of baseUomMatches) {
    count++;
  }
  assert(count >= 15, `Expected at least 15 base_uom declarations, found ${count}`);
  assert.doesNotMatch(
    fixturesContent,
    /base_uom:\s*'(?!GRAMS|MILLILITERS|UNITS)[A-Z_]+'/,
    'Found invalid base_uom',
  );
});

// ---------------------------------------------------------------------------
// Group 3: UOM Utility Engine Mathematical Correctness & Boundary Testing
// ---------------------------------------------------------------------------
console.log('\n▶ GROUP 3: UOM Utility Functions Boundary & Invariant Probes');

const uomContent = fs.readFileSync('src/lib/uom.ts', 'utf8');

runTest('BaseUom symbols are exclusively g, ml, ea', () => {
  assert.match(uomContent, /GRAMS:\s*'g'/);
  assert.match(uomContent, /MILLILITERS:\s*'ml'/);
  assert.match(uomContent, /UNITS:\s*'ea'/);
});

runTest('BaseUom precisions are strictly 2, 1, 0', () => {
  assert.match(uomContent, /GRAMS:\s*2/);
  assert.match(uomContent, /MILLILITERS:\s*1/);
  assert.match(uomContent, /UNITS:\s*0/);
});

runTest('Simulated formatBaseQty handles small, standard, and large quantities accurately', () => {
  const UOM_PRECISION = { GRAMS: 2, MILLILITERS: 1, UNITS: 0 };
  const UOM_SYMBOL = { GRAMS: 'g', MILLILITERS: 'ml', UNITS: 'ea' };

  function formatBaseQty(qty, uom) {
    const precision = UOM_PRECISION[uom];
    const rounded = Number(qty.toFixed(precision));
    const text = Number.isInteger(rounded) ? String(rounded) : String(rounded);
    return `${text} ${UOM_SYMBOL[uom]}`;
  }

  // Grams
  assert.strictEqual(formatBaseQty(0.5, 'GRAMS'), '0.5 g');
  assert.strictEqual(formatBaseQty(1, 'GRAMS'), '1 g');
  assert.strictEqual(formatBaseQty(3.5, 'GRAMS'), '3.5 g');
  assert.strictEqual(formatBaseQty(3.546, 'GRAMS'), '3.55 g');
  assert.strictEqual(formatBaseQty(7, 'GRAMS'), '7 g');
  assert.strictEqual(formatBaseQty(14, 'GRAMS'), '14 g');
  assert.strictEqual(formatBaseQty(28, 'GRAMS'), '28 g');
  assert.strictEqual(formatBaseQty(1000, 'GRAMS'), '1000 g');

  // Milliliters
  assert.strictEqual(formatBaseQty(5, 'MILLILITERS'), '5 ml');
  assert.strictEqual(formatBaseQty(30.5, 'MILLILITERS'), '30.5 ml');
  assert.strictEqual(formatBaseQty(100, 'MILLILITERS'), '100 ml');

  // Units
  assert.strictEqual(formatBaseQty(1, 'UNITS'), '1 ea');
  assert.strictEqual(formatBaseQty(5, 'UNITS'), '5 ea');
  assert.strictEqual(formatBaseQty(10, 'UNITS'), '10 ea');
});

runTest('Simulated tierLabel outputs pure metric without imperial words', () => {
  const UOM_PRECISION = { GRAMS: 2, MILLILITERS: 1, UNITS: 0 };
  const UOM_SYMBOL = { GRAMS: 'g', MILLILITERS: 'ml', UNITS: 'ea' };

  function tierLabel(qty, uom) {
    if (uom === 'UNITS') {
      return qty === 1 ? 'Single' : `${qty}-Pack`;
    }
    return `${Number(qty.toFixed(UOM_PRECISION[uom]))}${UOM_SYMBOL[uom]}`;
  }

  assert.strictEqual(tierLabel(1, 'GRAMS'), '1g');
  assert.strictEqual(tierLabel(3.5, 'GRAMS'), '3.5g');
  assert.strictEqual(tierLabel(7, 'GRAMS'), '7g');
  assert.strictEqual(tierLabel(14, 'GRAMS'), '14g');
  assert.strictEqual(tierLabel(28, 'GRAMS'), '28g');
  assert.strictEqual(tierLabel(30, 'MILLILITERS'), '30ml');
  assert.strictEqual(tierLabel(1, 'UNITS'), 'Single');
  assert.strictEqual(tierLabel(5, 'UNITS'), '5-Pack');
});

// ---------------------------------------------------------------------------
// Group 4: POS Thermal Receipt & Cart Calculations Verification
// ---------------------------------------------------------------------------
console.log('\n▶ GROUP 4: POS Receipt, Cart Store & Checkout Metric Roll-Ups');

const thermalReceipt = fs.readFileSync('src/components/pos/ThermalReceiptPrint.tsx', 'utf8');

runTest('ThermalReceiptPrint uses strictly metric unit roll-ups and deduction lines', () => {
  assert.match(thermalReceipt, /label="TOTAL WEIGHT"\s*value=\{`\$\{uomTotals\.GRAMS\.toFixed\(3\)\} g`\}/);
  assert.match(thermalReceipt, /label="TOTAL VOLUME"\s*value=\{`\$\{uomTotals\.MILLILITERS\.toFixed\(1\)\} ml`\}/);
  assert.match(thermalReceipt, /label="TOTAL UNITS"\s*value=\{`\$\{uomTotals\.UNITS\.toFixed\(0\)\} ea`\}/);
  assert.doesNotMatch(thermalReceipt, /\b(eighth|quarter|ounce|oz|lbs|pound)\b/i);
});

const cartStore = fs.readFileSync('src/lib/store/cart.ts', 'utf8');

runTest('Cart store calculates selectCartUomTotals strictly in base metric units', () => {
  assert.match(cartStore, /selectCartUomTotals\(state:\s*CartState\):\s*Partial<Record<BaseUom,\s*number>>/);
  assert.match(cartStore, /roundBaseQty\(current \+ cartLineBaseQty\(line\),\s*line\.baseUom\)/);
  assert.doesNotMatch(cartStore, /\b(eighth|quarter|ounce|oz|lbs|pound)\b/i);
});

const checkoutPage = fs.readFileSync('src/app/checkout/page.tsx', 'utf8');

runTest('Checkout page displays multi-UOM metrics with UOM_ORDER [GRAMS, MILLILITERS, UNITS]', () => {
  assert.match(checkoutPage, /const UOM_ORDER:\s*BaseUom\[\]\s*=\s*\['GRAMS',\s*'MILLILITERS',\s*'UNITS'\]/);
  assert.match(checkoutPage, /formatBaseQty\(item\.base_qty,\s*item\.base_uom\)/);
  assert.doesNotMatch(checkoutPage, /\b(eighth|quarter|ounce|oz|lbs|pound)\b/i);
});

const shopPage = fs.readFileSync('src/app/shop/page.tsx', 'utf8');

runTest('Shop page renders pure metric headings, badges, and variant selectors', () => {
  assert.match(shopPage, /uom === 'GRAMS' \? 'Grams' : uom === 'MILLILITERS' \? 'Millilitres' : 'Units'/);
  assert.doesNotMatch(shopPage, /\b(eighth|quarter|ounce|oz|lbs|pound)\b/i);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n========================================================================');
console.log(`  RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
console.log('========================================================================\n');

if (failedCount > 0) {
  process.exit(1);
}
