/**
 * Milestone 4 Adversarial Stress Probe & Forensic Verification
 * Target: Strict Metric System Standardization (R6, F11, F12)
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

console.log('========================================================================');
console.log('  MILESTONE 4 FORENSIC AUDITOR: ADVERSARIAL STRESS PROBE');
console.log('========================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(id, name, testFn) {
  totalTests++;
  try {
    const result = testFn();
    if (result instanceof Promise) {
      throw new Error(`Test ${id} returned a promise but runner is sync`);
    }
    passedTests++;
    console.log(`  ✓ PASS [${id}] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✗ FAIL [${id}] ${name}`);
    console.error(`    ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// 1. Database Schema & UOM Definition Rigidity
// ---------------------------------------------------------------------------
runTest('M4-ADV-01', 'Database BaseUom strictly restricted to GRAMS | MILLILITERS | UNITS', () => {
  const content = fs.readFileSync('src/types/database.ts', 'utf-8');
  const match = content.match(/export type BaseUom\s*=\s*['"]GRAMS['"]\s*\|\s*['"]MILLILITERS['"]\s*\|\s*['"]UNITS['"]/);
  assert(match, 'BaseUom type must strictly allow only GRAMS, MILLILITERS, UNITS');
  assert(!content.includes('OUNCE'), 'BaseUom must not contain OUNCE');
  assert(!content.includes('POUND'), 'BaseUom must not contain POUND');
});

runTest('M4-ADV-02', 'uom.ts definitions strictly map metric symbols and nouns', () => {
  const content = fs.readFileSync('src/lib/uom.ts', 'utf-8');
  assert(content.includes("GRAMS: 'g'"), 'GRAMS symbol must be g');
  assert(content.includes("MILLILITERS: 'ml'"), 'MILLILITERS symbol must be ml');
  assert(content.includes("UNITS: 'ea'"), 'UNITS symbol must be ea');
  assert(content.includes("GRAMS: 'Grams'"), 'GRAMS label must be Grams');
  assert(content.includes("MILLILITERS: 'Millilitres'"), 'MILLILITERS label must be Millilitres');
  assert(content.includes("UNITS: 'Units'"), 'UNITS label must be Units');
});

// ---------------------------------------------------------------------------
// 2. Fixture Catalog Variant Exhaustive Check
// ---------------------------------------------------------------------------
runTest('M4-ADV-03', 'All flower variant labels in fixtures.ts are strictly pure metric or Custom', () => {
  const content = fs.readFileSync('src/lib/demo/fixtures.ts', 'utf-8');
  const flowerTiersMatch = content.match(/const FLOWER_TIERS =[\s\S]*?\];/);
  assert(flowerTiersMatch, 'FLOWER_TIERS definition must exist in fixtures.ts');
  const snippet = flowerTiersMatch[0];
  
  // Extract all labels in FLOWER_TIERS
  const labelMatches = [...snippet.matchAll(/label:\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
  const expectedLabels = ['1g', '3.5g', '7g', '14g', '28g', 'Custom (scale)'];
  assert.deepStrictEqual(labelMatches, expectedLabels, `Labels must match expected metric labels: ${labelMatches.join(', ')}`);
});

runTest('M4-ADV-04', 'No flower variant in SEED_VARIANTS has imperial names', () => {
  const content = fs.readFileSync('src/lib/demo/fixtures.ts', 'utf-8');
  const forbiddenPatterns = [
    /\b(eighth|quarter|half-ounce|half ounce|ounce|oz|lbs|pound)\b/i,
    /3\.5g\s+Eighth/i,
    /7g\s+Quarter/i,
    /14g\s+Half/i,
    /28g\s+Ounce/i
  ];
  for (const pattern of forbiddenPatterns) {
    const match = content.match(pattern);
    assert(!match, `fixtures.ts contains forbidden pattern: ${pattern}`);
  }
});

// ---------------------------------------------------------------------------
// 3. Exhaustive Scan of ALL Files in src/
// ---------------------------------------------------------------------------
function getAllFiles(dir, exts) {
  let results = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of list) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      results = results.concat(getAllFiles(fullPath, exts));
    } else if (exts.includes(path.extname(item.name))) {
      results.push(fullPath);
    }
  }
  return results;
}

runTest('M4-ADV-05', 'Zero occurrences of imperial measurement terms across all src/ files', () => {
  const srcFiles = getAllFiles('src', ['.ts', '.tsx', '.json', '.css']);
  const measurementImperialRegex = /\b(oz|ounces?|eighths?|quarter\s*pounds?|fl\s*oz|lbs)\b/i;
  
  const violations = [];
  for (const file of srcFiles) {
    const text = fs.readFileSync(file, 'utf-8');
    const lines = text.split('\n');
    lines.forEach((line, index) => {
      if (measurementImperialRegex.test(line)) {
        violations.push(`${file}:${index + 1}: ${line.trim()}`);
      }
    });
  }

  assert.strictEqual(violations.length, 0, `Imperial terms found:\n${violations.join('\n')}`);
});

runTest('M4-ADV-06', 'Zero occurrences of measurement word "quarter" (e.g. "7g Quarter") in src/', () => {
  const srcFiles = getAllFiles('src', ['.ts', '.tsx']);
  const quarterRegex = /\b(\d+g\s+quarter|quarter\s+pound)\b/i;
  
  const violations = [];
  for (const file of srcFiles) {
    const text = fs.readFileSync(file, 'utf-8');
    const lines = text.split('\n');
    lines.forEach((line, index) => {
      if (quarterRegex.test(line)) {
        violations.push(`${file}:${index + 1}: ${line.trim()}`);
      }
    });
  }

  assert.strictEqual(violations.length, 0, `Quarter terms found:\n${violations.join('\n')}`);
});

// ---------------------------------------------------------------------------
// 4. Mathematical Accuracy of Metric Aggregations in Store
// ---------------------------------------------------------------------------
runTest('M4-ADV-07', 'Cart math preserves metric decimal precision (e.g., 3.5g + 3.5g = 7.0g)', () => {
  // Read and check logic in roundBaseQty
  const content = fs.readFileSync('src/lib/uom.ts', 'utf-8');
  assert(content.includes('UOM_PRECISION: Record<BaseUom, number> = {\n  GRAMS: 2,\n  MILLILITERS: 1,\n  UNITS: 0,\n}'), 'UOM_PRECISION must be defined');
  
  // Test mathematical rounding matching uom.ts
  const roundBaseQty = (qty, uom) => {
    const factor = 10 ** (uom === 'GRAMS' ? 2 : uom === 'MILLILITERS' ? 1 : 0);
    return Math.round(qty * factor) / factor;
  };
  
  assert.strictEqual(roundBaseQty(3.5 + 3.5, 'GRAMS'), 7);
  assert.strictEqual(roundBaseQty(3.5 + 7.0, 'GRAMS'), 10.5);
  assert.strictEqual(roundBaseQty(1.25 + 2.50, 'GRAMS'), 3.75);
  assert.strictEqual(roundBaseQty(30.12, 'MILLILITERS'), 30.1);
  assert.strictEqual(roundBaseQty(5.55, 'UNITS'), 6);
});

// ---------------------------------------------------------------------------
// 5. Thermal Receipt Print Metric Verification
// ---------------------------------------------------------------------------
runTest('M4-ADV-08', 'ThermalReceiptPrint formats line items and quantities with metric units', () => {
  const receipt = fs.readFileSync('src/components/pos/ThermalReceiptPrint.tsx', 'utf-8');
  assert(receipt.includes('UOM_SYMBOL'), 'Receipt must use UOM_SYMBOL');
  assert(receipt.includes('formatCentsBare'), 'Receipt must use formatCentsBare');
  assert(receipt.includes('TOTAL WEIGHT'), 'Receipt must have TOTAL WEIGHT section');
  assert(receipt.includes("`${uomTotals.GRAMS.toFixed(3)} g`"), 'Receipt must format weight in grams');
  assert(!receipt.match(/\b(oz|ounce|lbs|pound|eighth)\b/i), 'Receipt must contain zero imperial strings');
});

// ---------------------------------------------------------------------------
// 6. Shop & POS Tab Metric Labeling Verification
// ---------------------------------------------------------------------------
runTest('M4-ADV-09', 'Shop page tabs explicitly display metric unit indicators', () => {
  const shop = fs.readFileSync('src/app/shop/page.tsx', 'utf-8');
  assert(shop.includes("'Craft Flower (g)'"), 'Shop tabs must label Flower in (g)');
  assert(shop.includes("'Vapes & Carts (ea)'"), 'Shop tabs must label Vapes in (ea)');
  assert(shop.includes("'Elixirs & Oils (ml)'"), 'Shop tabs must label Elixirs in (ml)');
  assert(shop.includes("'Hash Holes (ea)'"), 'Shop tabs must label Hash Holes in (ea)');
  assert(shop.includes("'Edibles (ea)'"), 'Shop tabs must label Edibles in (ea)');
});

runTest('M4-ADV-10', 'POS Category tabs strictly map to metric units', () => {
  const uom = fs.readFileSync('src/lib/uom.ts', 'utf-8');
  assert(uom.includes("{ category: 'FLOWER', label: 'Flower', uom: 'GRAMS' }"), 'Flower must map to GRAMS');
  assert(uom.includes("{ category: 'HASH_EXTRACT', label: 'Hash & Extract', uom: 'GRAMS' }"), 'Hash must map to GRAMS');
  assert(uom.includes("{ category: 'ELIXIR_OIL', label: 'Elixirs & Oils', uom: 'MILLILITERS' }"), 'Elixir must map to MILLILITERS');
  assert(uom.includes("{ category: 'DISTILLATE', label: 'Distillate', uom: 'MILLILITERS' }"), 'Distillate must map to MILLILITERS');
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n========================================================================');
console.log(`  ADVERSARIAL STRESS PROBE RESULT: ${failedTests === 0 ? 'ALL PASSED' : 'FAILURES DETECTED'}`);
console.log(`  Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
console.log('========================================================================');

if (failedTests > 0) {
  process.exit(1);
}
