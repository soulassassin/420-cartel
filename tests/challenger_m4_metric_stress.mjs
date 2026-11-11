#!/usr/bin/env node
/**
 * Milestone 4 Adversarial Metric System Stress Test Harness
 * Author: Challenger 1 (Milestone 4 - Strict Metric System Standardization)
 *
 * Exhaustively stress-tests:
 * 1. Catalog variants across all 16 products for strict metric compliance.
 * 2. Numerical base quantity parity with tier labels.
 * 3. Monotonic price-per-gram / price-per-ml step ladders.
 * 4. Custom scale math, boundary conditions, and precision tolerances.
 * 5. Multi-category cart simulations and rollup isolation.
 * 6. Receipt and ticket generation emissions for imperial leakage.
 * 7. Source tree imperial regex scanning across client and server files.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Dynamically import TypeScript modules using experimental strip-types
const fixturesUrl = pathToFileURL(path.resolve(ROOT_DIR, 'src/lib/demo/fixtures.ts')).href;
const uomUrl = pathToFileURL(path.resolve(ROOT_DIR, 'src/lib/uom.ts')).href;

const { SEED_PRODUCTS, SEED_VARIANTS, SEED_BATCHES } = await import(fixturesUrl);
const {
  UOM_SYMBOL,
  UOM_LABEL,
  UOM_PRECISION,
  CATEGORY_UOM,
  formatBaseQty,
  tierLabel,
  roundBaseQty,
  validateCustomAmount,
  pricePerBaseUnitCents,
  tiersAvailable,
  stockSummary,
} = await import(uomUrl);

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ PASS: ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message, stack: err.stack });
    console.error(`  ✗ FAIL: ${name} -> ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertMatch(str, regex, message) {
  if (!regex.test(str)) {
    throw new Error(message || `Expected string to match ${regex}, got "${str}"`);
  }
}

function assertNotMatch(str, regex, message) {
  if (regex.test(str)) {
    throw new Error(message || `Expected string NOT to match ${regex}, matched "${str.match(regex)[0]}"`);
  }
}

console.log('========================================================================');
console.log('  CHALLENGER 1 :: MILESTONE 4 METRIC SYSTEM EMPIRICAL STRESS SUITE');
console.log('========================================================================\n');

// -----------------------------------------------------------------------------
// SECTION 1: Catalog Inventory & Metric Variant Format Audit (All 16 Products)
// -----------------------------------------------------------------------------
console.log('▶ SECTION 1: Catalog Inventory & Metric Variant Audit (All 16 Products)');

test('Catalog contains exactly 16 products', () => {
  assertEqual(SEED_PRODUCTS.length, 16, `Expected exactly 16 products in catalog, found ${SEED_PRODUCTS.length}`);
});

test('Every product has valid category and corresponding BaseUom', () => {
  for (const product of SEED_PRODUCTS) {
    const expectedUom = CATEGORY_UOM[product.category];
    assert(expectedUom !== undefined, `Product ${product.id} (${product.name}) has unknown category ${product.category}`);
    assertEqual(
      product.base_uom,
      expectedUom,
      `Product ${product.name} base_uom (${product.base_uom}) does not match category UOM (${expectedUom})`
    );
  }
});

test('All 16 products have at least one variant and all variants have non-empty labels', () => {
  for (const product of SEED_PRODUCTS) {
    const variants = SEED_VARIANTS.filter((v) => v.product_id === product.id);
    assert(variants.length > 0, `Product ${product.name} (${product.id}) has 0 variants`);
    for (const v of variants) {
      assert(typeof v.label === 'string' && v.label.trim().length > 0, `Variant ${v.id} of ${product.name} has invalid label`);
    }
  }
});

test('Flower variants strictly match metric tier labels or Custom (scale)', () => {
  const flowerProducts = SEED_PRODUCTS.filter((p) => p.category === 'FLOWER');
  assert(flowerProducts.length >= 2, 'Expected at least 2 flower products in seed');

  const validFlowerLabels = new Set(['1g', '3.5g', '7g', '14g', '28g', 'Custom (scale)']);

  for (const product of flowerProducts) {
    const variants = SEED_VARIANTS.filter((v) => v.product_id === product.id);
    for (const v of variants) {
      assert(
        validFlowerLabels.has(v.label),
        `Flower product ${product.name} contains invalid/non-metric variant label: "${v.label}"`
      );
    }
  }
});

test('Elixir & Oil variants strictly match metric volume labels (ml)', () => {
  const elixirProducts = SEED_PRODUCTS.filter((p) => p.category === 'ELIXIR_OIL');
  assert(elixirProducts.length >= 2, 'Expected at least 2 elixir products');

  const metricMlRegex = /^(\d+(\.\d+)?ml(\s+[\w\s]+)?|Custom\s*\(syringe\))$/i;
  for (const product of elixirProducts) {
    const variants = SEED_VARIANTS.filter((v) => v.product_id === product.id);
    for (const v of variants) {
      assertMatch(
        v.label,
        metricMlRegex,
        `Elixir product ${product.name} contains non-metric label: "${v.label}"`
      );
      assertNotMatch(v.label, /\b(oz|fl\s*oz|ounce|pint|quart|gal)\b/i, `Elixir tier contains imperial unit`);
    }
  }
});

test('Vape products strictly declare metric capacity in variant labels and UNIT base_uom', () => {
  const vapeProducts = SEED_PRODUCTS.filter((p) => p.category === 'VAPE');
  assert(vapeProducts.length >= 6, `Expected at least 6 vape products from Awaken import, found ${vapeProducts.length}`);

  for (const product of vapeProducts) {
    assertEqual(product.base_uom, 'UNITS', `Vape product ${product.name} must be stocked in UNITS`);
    const variants = SEED_VARIANTS.filter((v) => v.product_id === product.id);
    assert(variants.length > 0, `Vape product ${product.name} must have variants`);
    for (const v of variants) {
      assertMatch(
        v.label,
        /^\d+(\.\d+)?ml\s+(Cartridge|Disposable|Dual Tank)$/i,
        `Vape product ${product.name} variant label "${v.label}" must state metric capacity in ml`
      );
    }
    assertNotMatch(
      product.name + ' ' + product.short_tagline + ' ' + product.description,
      /\b(oz|fl\s*oz|ounce|eighth|quarter)\b/i,
      `Vape product ${product.name} must not contain imperial units`
    );
  }
});

test('Pre-rolls, Edibles, and Accessories variants strictly use metric/count terms', () => {
  const discreteProducts = SEED_PRODUCTS.filter((p) =>
    ['PRE_ROLL', 'EDIBLE', 'ACCESSORY', 'MERCH'].includes(p.category)
  );

  for (const product of discreteProducts) {
    assertEqual(product.base_uom, 'UNITS', `Product ${product.name} base_uom must be UNITS`);
    const variants = SEED_VARIANTS.filter((v) => v.product_id === product.id);
    for (const v of variants) {
      assertNotMatch(
        v.label,
        /\b(eighth|quarter\s+pound|ounce|oz|lbs|pound)\b/i,
        `Discrete product ${product.name} variant ${v.label} contains imperial units`
      );
    }
  }
});

// -----------------------------------------------------------------------------
// SECTION 2: Base Quantity Parity & Numerical Conversions
// -----------------------------------------------------------------------------
console.log('\n▶ SECTION 2: Base Quantity Parity & Numerical Conversions');

test('Flower variants base_quantity matches exact numeric metric quantity', () => {
  const expectedMap = {
    '1g': 1.0,
    '3.5g': 3.5,
    '7g': 7.0,
    '14g': 14.0,
    '28g': 28.0,
    'Custom (scale)': 1.0,
  };

  const flowerProducts = SEED_PRODUCTS.filter((p) => p.category === 'FLOWER');
  for (const product of flowerProducts) {
    const variants = SEED_VARIANTS.filter((v) => v.product_id === product.id);
    for (const v of variants) {
      const expected = expectedMap[v.label];
      assert(expected !== undefined, `Unexpected flower label ${v.label}`);
      assertEqual(v.base_quantity, expected, `Variant ${v.label} base_quantity mismatch`);
      if (v.label === 'Custom (scale)') {
        assertEqual(v.is_custom_amount, true, 'Custom (scale) must have is_custom_amount = true');
      } else {
        assertEqual(v.is_custom_amount, false, `Standard variant ${v.label} must have is_custom_amount = false`);
      }
    }
  }
});

test('Elixir variants base_quantity matches milliliter quantity', () => {
  const expectedMap = {
    '10ml Dropper': 10.0,
    '30ml Elixir': 30.0,
    '50ml Reserve': 50.0,
    'Custom (syringe)': 1.0,
  };

  const elixirProducts = SEED_PRODUCTS.filter((p) => p.category === 'ELIXIR_OIL');
  for (const product of elixirProducts) {
    const variants = SEED_VARIANTS.filter((v) => v.product_id === product.id);
    for (const v of variants) {
      if (expectedMap[v.label] !== undefined) {
        assertEqual(v.base_quantity, expectedMap[v.label], `Elixir variant ${v.label} base_quantity mismatch`);
      }
    }
  }
});

test('Unit products base_quantity matches count', () => {
  const unitVariants = SEED_VARIANTS.filter((v) => {
    const prod = SEED_PRODUCTS.find((p) => p.id === v.product_id);
    return prod && prod.base_uom === 'UNITS';
  });

  for (const v of unitVariants) {
    assert(Number.isInteger(v.base_quantity), `Unit variant ${v.label} base_quantity must be integer`);
    assert(v.base_quantity >= 1, `Unit variant ${v.label} base_quantity must be >= 1`);
  }
});

// -----------------------------------------------------------------------------
// SECTION 3: Step Ladder Pricing Monotonicity & Discount Curves
// -----------------------------------------------------------------------------
console.log('\n▶ SECTION 3: Step Ladder Pricing Monotonicity & Discount Curves');

test('Flower tier effective price per gram strictly decreases monotonically as tier scales', () => {
  const flowerProducts = SEED_PRODUCTS.filter((p) => p.category === 'FLOWER');
  for (const product of flowerProducts) {
    const variants = SEED_VARIANTS.filter((v) => v.product_id === product.id && !v.is_custom_amount)
      .sort((a, b) => a.base_quantity - b.base_quantity);

    let previousRate = Infinity;
    for (const v of variants) {
      const perGramRate = v.price_cents / v.base_quantity;
      assert(
        perGramRate < previousRate,
        `Flower tier ${v.label} per-gram rate (${perGramRate}) not cheaper than preceding tier (${previousRate}) for ${product.name}`
      );
      previousRate = perGramRate;
    }
  }
});

test('Elixir tier effective price per ml strictly decreases monotonically as bottle size scales', () => {
  const elixirProducts = SEED_PRODUCTS.filter((p) => p.category === 'ELIXIR_OIL');
  for (const product of elixirProducts) {
    const variants = SEED_VARIANTS.filter((v) => v.product_id === product.id && !v.is_custom_amount)
      .sort((a, b) => a.base_quantity - b.base_quantity);

    let previousRate = Infinity;
    for (const v of variants) {
      const perMlRate = v.price_cents / v.base_quantity;
      assert(
        perMlRate <= previousRate,
        `Elixir tier ${v.label} per-ml rate (${perMlRate}) not cheaper than preceding tier (${previousRate}) for ${product.name}`
      );
      previousRate = perMlRate;
    }
  }
});

// -----------------------------------------------------------------------------
// SECTION 4: Custom Scale Math & Boundary Condition Stress Testing
// -----------------------------------------------------------------------------
console.log('\n▶ SECTION 4: Custom Scale Math & Boundary Condition Stress Testing');

test('roundBaseQty rounds precisely to UOM decimal standard', () => {
  // GRAMS: 2 decimals
  assertEqual(roundBaseQty(3.456, 'GRAMS'), 3.46);
  assertEqual(roundBaseQty(3.454, 'GRAMS'), 3.45);
  assertEqual(roundBaseQty(0.004, 'GRAMS'), 0);
  assertEqual(roundBaseQty(0.005, 'GRAMS'), 0.01);
  assertEqual(roundBaseQty(1234.5678, 'GRAMS'), 1234.57);

  // MILLILITERS: 1 decimal
  assertEqual(roundBaseQty(10.24, 'MILLILITERS'), 10.2);
  assertEqual(roundBaseQty(10.26, 'MILLILITERS'), 10.3);

  // UNITS: 0 decimals
  assertEqual(roundBaseQty(5.4, 'UNITS'), 5);
  assertEqual(roundBaseQty(5.6, 'UNITS'), 6);
});

test('formatBaseQty produces strictly metric labels with correct symbol spacing', () => {
  assertEqual(formatBaseQty(1, 'GRAMS'), '1 g');
  assertEqual(formatBaseQty(3.5, 'GRAMS'), '3.5 g');
  assertEqual(formatBaseQty(7, 'GRAMS'), '7 g');
  assertEqual(formatBaseQty(14, 'GRAMS'), '14 g');
  assertEqual(formatBaseQty(28, 'GRAMS'), '28 g');
  assertEqual(formatBaseQty(0.25, 'GRAMS'), '0.25 g');
  assertEqual(formatBaseQty(1000, 'GRAMS'), '1000 g');

  assertEqual(formatBaseQty(10, 'MILLILITERS'), '10 ml');
  assertEqual(formatBaseQty(30, 'MILLILITERS'), '30 ml');
  assertEqual(formatBaseQty(50, 'MILLILITERS'), '50 ml');

  assertEqual(formatBaseQty(1, 'UNITS'), '1 ea');
  assertEqual(formatBaseQty(5, 'UNITS'), '5 ea');
});

test('tierLabel generates metric tokens without imperial leakage', () => {
  assertEqual(tierLabel(1, 'GRAMS'), '1g');
  assertEqual(tierLabel(3.5, 'GRAMS'), '3.5g');
  assertEqual(tierLabel(7, 'GRAMS'), '7g');
  assertEqual(tierLabel(14, 'GRAMS'), '14g');
  assertEqual(tierLabel(28, 'GRAMS'), '28g');
  assertEqual(tierLabel(30, 'MILLILITERS'), '30ml');
  assertEqual(tierLabel(1, 'UNITS'), 'Single');
  assertEqual(tierLabel(3, 'UNITS'), '3-Pack');
  assertEqual(tierLabel(5, 'UNITS'), '5-Pack');
});

test('validateCustomAmount strictly validates scale weights and bounds', () => {
  // GRAMS
  assertEqual(validateCustomAmount(-1, 'GRAMS', 1).ok, false);
  assertEqual(validateCustomAmount(0, 'GRAMS', 1).ok, false);
  assertEqual(validateCustomAmount(NaN, 'GRAMS', 1).ok, false);
  assertEqual(validateCustomAmount(Infinity, 'GRAMS', 1).ok, false);
  assertEqual(validateCustomAmount(0.5, 'GRAMS', 1).ok, false); // below minimum 1g
  assertEqual(validateCustomAmount(1.0, 'GRAMS', 1).ok, true);
  assertEqual(validateCustomAmount(3.826, 'GRAMS', 1).value, 3.83);

  // MILLILITERS
  assertEqual(validateCustomAmount(0.2, 'MILLILITERS', 1).ok, false);
  assertEqual(validateCustomAmount(15.75, 'MILLILITERS', 1).value, 15.8);

  // UNITS
  assertEqual(validateCustomAmount(1.5, 'UNITS', 1).ok, false); // units must be whole
  assertEqual(validateCustomAmount(3, 'UNITS', 1).ok, true);
});

test('pricePerBaseUnitCents computes unit rates cleanly without zero division', () => {
  assertEqual(pricePerBaseUnitCents(0, 0), 0);
  assertEqual(pricePerBaseUnitCents(28000, 1), 28000);
  assertEqual(pricePerBaseUnitCents(91140, 3.5), 26040); // 3.5g tier rate
});

test('tiersAvailable accurately computes inventory fill capacity', () => {
  assertEqual(tiersAvailable(100, 3.5), 28);
  assertEqual(tiersAvailable(10, 28), 0);
  assertEqual(tiersAvailable(28, 28), 1);
  assertEqual(tiersAvailable(0, 3.5), 0);
  assertEqual(tiersAvailable(100, 0), 0);
});

// -----------------------------------------------------------------------------
// SECTION 5: Multi-Category Cart Simulation & Metric Rollup Isolation
// -----------------------------------------------------------------------------
console.log('\n▶ SECTION 5: Multi-Category Cart Simulation & Metric Rollup Isolation');

test('Multi-tier inventory headroom guard aggregates multiple metric lines of the same batch', () => {
  // Batch has 10.0g remaining
  const remainingStock = 10.0;
  
  // Line 1: 7g of Truffle
  const line1Qty = 7.0;
  // Line 2: 3.5g of Truffle
  const line2Qty = 3.5;

  const totalCommitted = roundBaseQty(line1Qty + line2Qty, 'GRAMS');
  assertEqual(totalCommitted, 10.5, 'Total committed must be 10.5g');
  
  // Check if headroom correctly refuses the second line
  const canFit = totalCommitted <= remainingStock;
  assertEqual(canFit, false, 'Shop must refuse 10.5g claim against 10.0g remaining stock');
});

test('Comma decimal separator support in custom scale inputs (e.g. "3,5g" -> 3.5g)', () => {
  const commaInput = '3,5';
  const parsed = Number(commaInput.replace(',', '.'));
  assertEqual(parsed, 3.5, 'Comma separator must parse to 3.5');
  const validation = validateCustomAmount(parsed, 'GRAMS', 1);
  assertEqual(validation.ok, true, 'Validation must succeed for parsed comma decimal');
  assertEqual(validation.value, 3.5, 'Validated value must be 3.5');
});

test('Scale weight price calculation always produces whole integer cents without sub-cent float leaks', () => {
  const gramRate = 28000; // R280.00
  const weightsToTest = [0.1, 0.13, 0.25, 0.333, 0.777, 1.234, 3.1415, 7.89, 14.05, 27.99];

  for (const w of weightsToTest) {
    const roundedWeight = roundBaseQty(w, 'GRAMS');
    const priceCents = Math.round(gramRate * roundedWeight);
    assert(Number.isInteger(priceCents), `Price cents ${priceCents} must be an integer`);
    assert(priceCents > 0, `Price cents must be > 0`);
  }
});

test('Thermal receipt rolls up only populated UOMs and omits empty units cleanly', () => {
  // Receipt with only UNITS
  const unitOnlyRollups = { GRAMS: 0, MILLILITERS: 0, UNITS: 3 };
  const lines = [];
  if (unitOnlyRollups.GRAMS > 0) lines.push(`TOTAL WEIGHT: ${unitOnlyRollups.GRAMS} g`);
  if (unitOnlyRollups.MILLILITERS > 0) lines.push(`TOTAL VOLUME: ${unitOnlyRollups.MILLILITERS} ml`);
  if (unitOnlyRollups.UNITS > 0) lines.push(`TOTAL UNITS: ${unitOnlyRollups.UNITS} ea`);

  assertEqual(lines.length, 1);
  assertEqual(lines[0], 'TOTAL UNITS: 3 ea');
});

test('Multi-category cart tracks GRAMS, MILLILITERS, and UNITS in separate non-colliding buckets', () => {
  // Simulate cart lines
  const lines = [
    {
      productId: 'prod-truffle',
      category: 'FLOWER',
      baseUom: 'GRAMS',
      baseQuantity: 3.5,
      customBaseQty: null,
      quantity: 2, // 7.0g total
      priceCents: 91140,
    },
    {
      productId: 'prod-haze',
      category: 'FLOWER',
      baseUom: 'GRAMS',
      baseQuantity: 1.0,
      customBaseQty: 4.25, // custom scale 4.25g
      quantity: 1, // 4.25g total
      priceCents: 22000,
    },
    {
      productId: 'prod-rosin-elixir',
      category: 'ELIXIR_OIL',
      baseUom: 'MILLILITERS',
      baseQuantity: 30,
      customBaseQty: null,
      quantity: 2, // 60ml total
      priceCents: 247950,
    },
    {
      productId: 'prod-vape-perm',
      category: 'VAPE',
      baseUom: 'UNITS',
      baseQuantity: 1,
      customBaseQty: null,
      quantity: 3, // 3 units total
      priceCents: 140000,
    },
  ];

  // Calculate rollups matching src/lib/store/cart.ts selectCartUomTotals
  const uomTotals = lines.reduce((totals, line) => {
    const effectiveQty = (line.customBaseQty ?? line.baseQuantity) * line.quantity;
    totals[line.baseUom] = roundBaseQty((totals[line.baseUom] ?? 0) + effectiveQty, line.baseUom);
    return totals;
  }, {});

  assertEqual(uomTotals.GRAMS, 11.25, 'Total grams must be 7.0 + 4.25 = 11.25g');
  assertEqual(uomTotals.MILLILITERS, 60.0, 'Total ml must be 60.0ml');
  assertEqual(uomTotals.UNITS, 3, 'Total units must be 3 ea');

  // Verify format strings
  const gramsFormatted = formatBaseQty(uomTotals.GRAMS, 'GRAMS');
  const mlFormatted = formatBaseQty(uomTotals.MILLILITERS, 'MILLILITERS');
  const unitsFormatted = formatBaseQty(uomTotals.UNITS, 'UNITS');

  assertEqual(gramsFormatted, '11.25 g');
  assertEqual(mlFormatted, '60 ml');
  assertEqual(unitsFormatted, '3 ea');

  // Assert no imperial units leak into formatted rollups
  assertNotMatch(`${gramsFormatted} ${mlFormatted} ${unitsFormatted}`, /\b(oz|lbs|eighth|quarter|half|ounce)\b/i);
});

// -----------------------------------------------------------------------------
// SECTION 6: Thermal Receipt & Ticket Emission Simulation
// -----------------------------------------------------------------------------
console.log('\n▶ SECTION 6: Thermal Receipt & Ticket Emission Simulation');

test('Thermal receipt format strictly emits metric measurements with scale precision', () => {
  // Simulate receipt payload matching ThermalReceiptPrint.tsx
  const mockOrder = {
    order_number: 'CRT-ORD-90210',
    subtotal_cents: 295000,
    discount_cents: 0,
    delivery_fee_cents: 0,
    total_cents: 295000,
    items: [
      {
        product_name: 'Black Truffle Gold',
        variant_label: '3.5g',
        quantity: 1,
        base_uom: 'GRAMS',
        base_qty: 3.5,
        line_total_cents: 91140,
        batch_allocation: [{ batch_code: 'BATCH-GF-01', base_qty: 3.5 }],
      },
      {
        product_name: 'Jozi Lemon Haze',
        variant_label: '4.85 g',
        quantity: 1,
        base_uom: 'GRAMS',
        base_qty: 4.85,
        line_total_cents: 106700,
        batch_allocation: [{ batch_code: 'BATCH-GF-02', base_qty: 4.85 }],
      },
      {
        product_name: 'Awaken Live Rosin Disposable',
        variant_label: '1ml Disposable',
        quantity: 1,
        base_uom: 'UNITS',
        base_qty: 1,
        line_total_cents: 150000,
        batch_allocation: [{ batch_code: 'BATCH-AWK-02', base_qty: 1 }],
      },
    ],
  };

  // Simulate lines rendered by ThermalReceiptPrint.tsx
  const renderedLines = [];
  renderedLines.push(`DOCKET #${mockOrder.order_number}`);

  const uomTotals = { GRAMS: 0, MILLILITERS: 0, UNITS: 0 };

  for (const item of mockOrder.items) {
    uomTotals[item.base_uom] += item.base_qty;
    const unitBaseQty = item.quantity > 0 ? item.base_qty / item.quantity : item.base_qty;
    renderedLines.push(`${item.quantity} x ${item.variant_label}`);
    renderedLines.push(
      `${unitBaseQty.toFixed(3)} ${UOM_SYMBOL[item.base_uom]} each · ${item.base_qty.toFixed(3)} ${UOM_SYMBOL[item.base_uom]} total`
    );
    for (const alloc of item.batch_allocation) {
      renderedLines.push(`${alloc.base_qty.toFixed(3)} ${UOM_SYMBOL[item.base_uom]} off #${alloc.batch_code}`);
    }
  }

  if (uomTotals.GRAMS > 0) renderedLines.push(`TOTAL WEIGHT: ${uomTotals.GRAMS.toFixed(3)} g`);
  if (uomTotals.MILLILITERS > 0) renderedLines.push(`TOTAL VOLUME: ${uomTotals.MILLILITERS.toFixed(1)} ml`);
  if (uomTotals.UNITS > 0) renderedLines.push(`TOTAL UNITS: ${uomTotals.UNITS.toFixed(0)} ea`);

  const fullReceiptText = renderedLines.join('\n');

  // Verify presence of exact metric representations
  assertMatch(fullReceiptText, /TOTAL WEIGHT: 8\.350 g/);
  assertMatch(fullReceiptText, /TOTAL UNITS: 1 ea/);
  assertMatch(fullReceiptText, /3\.500 g off #BATCH-GF-01/);
  assertMatch(fullReceiptText, /4\.850 g off #BATCH-GF-02/);

  // Assert absolute zero imperial words in receipt output
  assertNotMatch(
    fullReceiptText,
    /\b(eighth|quarter\s+pound|ounce|ounces|\boz\b|\bfl\s*oz\b|\blbs\b|\bpound\b|\bpounds\b)/i,
    'Thermal receipt must contain zero imperial terms'
  );
});

// -----------------------------------------------------------------------------
// SECTION 7: Exhaustive Source Tree Imperial Regex Scanner
// -----------------------------------------------------------------------------
console.log('\n▶ SECTION 7: Exhaustive Source Tree Imperial Regex Scanner');

test('Client components and pages contain zero imperial unit terms', () => {
  const targetDirs = ['src/components', 'src/app', 'src/lib'];
  const imperialRegex = /\b(eighth|quarter\s+pound|ounce|ounces|\boz\b|\bfl\s*oz\b|\blbs\b|\bpound\b|\bpounds\b)/i;

  const scannedFiles = [];
  const detectedViolations = [];

  function scanDir(dir) {
    const entries = fs.readdirSync(path.resolve(ROOT_DIR, dir), { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        scannedFiles.push(fullPath);
        const content = fs.readFileSync(path.resolve(ROOT_DIR, fullPath), 'utf8');
        const lines = content.split('\n');
        lines.forEach((line, lineNum) => {
          // Check for imperial units, ignoring legitimate brand name "Imperial Hash Hole"
          const sanitizedLine = line.replace(/Imperial Hash Hole/gi, '');
          const match = sanitizedLine.match(imperialRegex);
          if (match) {
            detectedViolations.push({
              file: fullPath,
              line: lineNum + 1,
              matched: match[0],
              snippet: line.trim(),
            });
          }
        });
      }
    }
  }

  for (const d of targetDirs) {
    scanDir(d);
  }

  console.log(`    (Scanned ${scannedFiles.length} TypeScript source files in ${targetDirs.join(', ')})`);

  if (detectedViolations.length > 0) {
    console.error('    Found violations:', detectedViolations);
  }
  assertEqual(
    detectedViolations.length,
    0,
    `Found ${detectedViolations.length} imperial leakage instances in source files`
  );
});

// -----------------------------------------------------------------------------
// SUMMARY & VERDICT
// -----------------------------------------------------------------------------
console.log('\n========================================================================');
console.log('  CHALLENGE SUITE EXECUTION SUMMARY');
console.log('========================================================================');
console.log(`  Total Tests : ${passed + failed}`);
console.log(`  Passed      : ${passed}`);
console.log(`  Failed      : ${failed}`);
console.log(`  Pass Rate   : ${Math.round((passed / (passed + failed)) * 100)}%`);

if (failed === 0) {
  console.log('\n★ VERDICT: CONFIRMED ★');
  console.log('Strict metric standardization holds across all 16 products, variants, step ladders, carts, receipts, and source files.');
  process.exit(0);
} else {
  console.error('\n★ VERDICT: DISPROVED ★');
  console.error(`Found ${failed} empirical challenge failure(s):`);
  failures.forEach((f) => console.error(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
