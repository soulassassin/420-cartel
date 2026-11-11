/**
 * M4 Adversarial Challenger & Stress Probe
 *
 * Validates:
 * 1. Strict metric standardization compliance across all source code and fixtures.
 * 2. Complete absence of imperial units (eighth, quarter, ounce, oz, lbs, etc.) in measurement contexts.
 * 3. Fractional measurement pattern scan (e.g. 1/8, 1/4, 1/2 in variant labels).
 * 4. UOM mathematical engine boundary, precision, and floating-point stress testing.
 * 5. Integrity verification: check for facade/mocked code or shortcuts.
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

// Ensure Node runs with --experimental-strip-types to import .ts modules directly
if (!process.execArgv.some((arg) => arg.includes('strip-types'))) {
  const child = spawnSync(process.execPath, ['--experimental-strip-types', ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(child.status ?? 0);
}

const ROOT_DIR = process.cwd();

console.log('========================================================================');
console.log('  M4 ADVERSARIAL CHALLENGER & METRIC STRESS PROBE');
console.log('========================================================================\n');

let passedTests = 0;
let failedTests = 0;

async function runTest(id, name, fn) {
  try {
    await fn();
    console.log(`  ✓ PASS [${id}] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL [${id}] ${name}`);
    console.error(`    -> ${err.message}`);
    failedTests++;
  }
}

// Helper: collect all files matching extensions
function getFilesRecursively(dir, exts, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next' && file !== '.git' && file !== '.agents') {
        getFilesRecursively(fullPath, exts, fileList);
      }
    } else {
      if (exts.some((ext) => file.endsWith(ext))) {
        fileList.push(fullPath);
      }
    }
  }
  return fileList;
}

// =========================================================================
// SECTION 1: Imperial Measurement Elimination Scan
// =========================================================================
console.log('▶ SECTION 1: Imperial Terminology Elimination Scan');

await runTest('M4-ADV-01', 'Recursive word-boundary check for imperial units in src/', () => {
  const srcFiles = getFilesRecursively(path.join(ROOT_DIR, 'src'), ['.ts', '.tsx']);
  const imperialPattern = /\b(Eighth|Quarter|Ounce|ounces|oz|lbs)\b/i;
  const nonMeasurementExceptions = [
    // Ordinary English idioms where 'quarter' or 'half' is not a unit of measure
    'quarterly',
    'half-rendered',
    'admin half',
    'half-migrated',
  ];

  const violations = [];
  for (const filePath of srcFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, lineNum) => {
      const match = line.match(imperialPattern);
      if (match) {
        let isException = false;
        for (const exc of nonMeasurementExceptions) {
          if (line.toLowerCase().includes(exc)) {
            isException = true;
            break;
          }
        }
        if (!isException) {
          violations.push({
            file: path.relative(ROOT_DIR, filePath),
            line: lineNum + 1,
            match: match[0],
            text: line.trim(),
          });
        }
      }
    });
  }

  if (violations.length > 0) {
    const details = violations.map((v) => `  ${v.file}:${v.line} matched '${v.match}' in: "${v.text}"`).join('\n');
    throw new Error(`Found ${violations.length} imperial unit occurrences:\n${details}`);
  }
});

await runTest('M4-ADV-02', 'Zero imperial weight fractions in variant labels (e.g. 1/8, 1/4, 1/2 oz)', () => {
  const fixturesPath = path.join(ROOT_DIR, 'src/lib/demo/fixtures.ts');
  const fixtures = fs.readFileSync(fixturesPath, 'utf8');
  const fractionMatch = fixtures.match(/label:\s*['"][^'"]*(1\/8|1\/4|1\/2)[^'"]*['"]/i);
  assert.strictEqual(fractionMatch, null, `Found fractional imperial variant label: ${fractionMatch ? fractionMatch[0] : ''}`);
});

await runTest('M4-ADV-03', 'Flower tiers definition strictly metric (1g, 3.5g, 7g, 14g, 28g)', () => {
  const fixturesPath = path.join(ROOT_DIR, 'src/lib/demo/fixtures.ts');
  const fixtures = fs.readFileSync(fixturesPath, 'utf8');
  assert.ok(fixtures.includes("label: '1g'"), 'Missing 1g tier');
  assert.ok(fixtures.includes("label: '3.5g'"), 'Missing 3.5g tier');
  assert.ok(fixtures.includes("label: '7g'"), 'Missing 7g tier');
  assert.ok(fixtures.includes("label: '14g'"), 'Missing 14g tier');
  assert.ok(fixtures.includes("label: '28g'"), 'Missing 28g tier');
  assert.ok(fixtures.includes("label: 'Custom (scale)'"), 'Missing Custom scale tier');
});

// =========================================================================
// SECTION 2: UOM Engine Mathematical & Edge-Case Probing
// =========================================================================
console.log('\n▶ SECTION 2: UOM Engine Mathematical & Boundary Stress-Testing');

await runTest('M4-ADV-04', 'formatBaseQty precision & formatting tests', async () => {
  const { formatBaseQty, UOM_SYMBOL } = await import('../src/lib/uom.ts');
  assert.strictEqual(formatBaseQty(1, 'GRAMS'), '1 g');
  assert.strictEqual(formatBaseQty(3.5, 'GRAMS'), '3.5 g');
  assert.strictEqual(formatBaseQty(0.25, 'GRAMS'), '0.25 g');
  assert.strictEqual(formatBaseQty(1000, 'GRAMS'), '1000 g');
  assert.strictEqual(formatBaseQty(0, 'GRAMS'), '0 g');

  assert.strictEqual(formatBaseQty(30, 'MILLILITERS'), '30 ml');
  assert.strictEqual(formatBaseQty(0.5, 'MILLILITERS'), '0.5 ml');

  assert.strictEqual(formatBaseQty(1, 'UNITS'), '1 ea');
  assert.strictEqual(formatBaseQty(5, 'UNITS'), '5 ea');
});

await runTest('M4-ADV-05', 'tierLabel formatting logic for all unit types', async () => {
  const { tierLabel } = await import('../src/lib/uom.ts');
  assert.strictEqual(tierLabel(1, 'GRAMS'), '1g');
  assert.strictEqual(tierLabel(3.5, 'GRAMS'), '3.5g');
  assert.strictEqual(tierLabel(28, 'GRAMS'), '28g');

  assert.strictEqual(tierLabel(30, 'MILLILITERS'), '30ml');
  assert.strictEqual(tierLabel(1, 'UNITS'), 'Single');
  assert.strictEqual(tierLabel(5, 'UNITS'), '5-Pack');
});

await runTest('M4-ADV-06', 'roundBaseQty floating-point precision stabilization', async () => {
  const { roundBaseQty } = await import('../src/lib/uom.ts');
  // 0.1 + 0.2 in JS is 0.30000000000000004
  const sum = 0.1 + 0.2;
  const roundedGrams = roundBaseQty(sum, 'GRAMS');
  assert.strictEqual(roundedGrams, 0.3);

  // 3.5g * 3 = 10.5g
  assert.strictEqual(roundBaseQty(3.5 * 3, 'GRAMS'), 10.5);

  // Millilitres 1dp
  assert.strictEqual(roundBaseQty(15.54, 'MILLILITERS'), 15.5);
  assert.strictEqual(roundBaseQty(15.56, 'MILLILITERS'), 15.6);

  // Units 0dp
  assert.strictEqual(roundBaseQty(4.9, 'UNITS'), 5);
});

await runTest('M4-ADV-07', 'validateCustomAmount boundary conditions & validation', async () => {
  const { validateCustomAmount } = await import('../src/lib/uom.ts');
  // Valid amounts
  const r1 = validateCustomAmount(5.25, 'GRAMS', 1);
  assert.strictEqual(r1.ok, true);
  if (r1.ok) assert.strictEqual(r1.value, 5.25);

  // Below minimum
  const r2 = validateCustomAmount(0.5, 'GRAMS', 1);
  assert.strictEqual(r2.ok, false);

  // Zero / negative
  const r3 = validateCustomAmount(0, 'GRAMS', 1);
  assert.strictEqual(r3.ok, false);
  const r4 = validateCustomAmount(-2, 'GRAMS', 1);
  assert.strictEqual(r4.ok, false);

  // Non-integer units
  const r5 = validateCustomAmount(1.5, 'UNITS', 1);
  assert.strictEqual(r5.ok, false);

  // Integer units
  const r6 = validateCustomAmount(3, 'UNITS', 1);
  assert.strictEqual(r6.ok, true);
});

await runTest('M4-ADV-08', 'tiersAvailable headroom calculation under edge cases', async () => {
  const { tiersAvailable } = await import('../src/lib/uom.ts');
  // Standard
  assert.strictEqual(tiersAvailable(10, 3.5), 2); // 2 * 3.5 = 7 <= 10
  assert.strictEqual(tiersAvailable(28, 28), 1);
  assert.strictEqual(tiersAvailable(27.9, 28), 0);

  // Zero tier base quantity (division by zero defense)
  assert.strictEqual(tiersAvailable(10, 0), 0);

  // Negative available quantity
  assert.strictEqual(tiersAvailable(-5, 3.5), -2); // Math.floor(-5 / 3.5)
});

// =========================================================================
// SECTION 3: Integrity & Anti-Shortcut Verification
// =========================================================================
console.log('\n▶ SECTION 3: Codebase Integrity & Non-Bypass Verification');

await runTest('M4-ADV-09', 'Verify no test-bypassing environment flags in UOM logic', () => {
  const uomContent = fs.readFileSync(path.join(ROOT_DIR, 'src/lib/uom.ts'), 'utf8');
  assert.ok(!uomContent.includes('process.env.NODE_ENV === \'test\''), 'UOM logic contains test bypass check');
  assert.ok(!uomContent.includes('process.env.CI'), 'UOM logic contains CI bypass check');
});

await runTest('M4-ADV-10', 'Verify cart store headroom calculation uses genuine metric math', () => {
  const cartContent = fs.readFileSync(path.join(ROOT_DIR, 'src/lib/store/cart.ts'), 'utf8');
  assert.ok(cartContent.includes('cartProductBaseQty'), 'Cart must implement cartProductBaseQty');
  assert.ok(cartContent.includes('selectCartUomTotals'), 'Cart must implement selectCartUomTotals');
  assert.ok(cartContent.includes('roundBaseQty'), 'Cart must use roundBaseQty');
});

await runTest('M4-ADV-11', 'Verify ThermalReceiptPrint strictly standardizes receipt lines to metric', () => {
  const receiptContent = fs.readFileSync(path.join(ROOT_DIR, 'src/components/pos/ThermalReceiptPrint.tsx'), 'utf8');
  assert.ok(receiptContent.includes('UOM_SYMBOL'), 'Receipt must use UOM_SYMBOL for metric display');
  assert.ok(receiptContent.includes('TOTAL WEIGHT'), 'Receipt must show TOTAL WEIGHT in grams');
  assert.ok(receiptContent.includes('TOTAL VOLUME'), 'Receipt must show TOTAL VOLUME in ml');
  assert.ok(receiptContent.includes('TOTAL UNITS'), 'Receipt must show TOTAL UNITS in ea');
  assert.ok(!receiptContent.match(/\b(Eighth|Quarter|Ounce|ounces|oz|lbs)\b/i), 'Receipt must contain no imperial labels');
});

await runTest('M4-ADV-12', 'Verify POS and Admin Inventory surfaces render metric units only', () => {
  const posContent = fs.readFileSync(path.join(ROOT_DIR, 'src/app/pos/page.tsx'), 'utf8');
  const invContent = fs.readFileSync(path.join(ROOT_DIR, 'src/app/admin/inventory/page.tsx'), 'utf8');
  assert.ok(!posContent.match(/\b(Eighth|Quarter|Ounce|ounces|oz|lbs)\b/i), 'POS terminal must contain no imperial units');
  assert.ok(!invContent.match(/\b(Eighth|Quarter|Ounce|ounces|oz|lbs)\b/i), 'Admin inventory must contain no imperial units');
});

console.log('\n========================================================================');
console.log(`  M4 PROBE SUMMARY: ${passedTests} passed, ${failedTests} failed`);
console.log('========================================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
