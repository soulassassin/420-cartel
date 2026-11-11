#!/usr/bin/env node
/**
 * 420 Cartel Master E2E Test Suite Runner
 *
 * Usage:
 *   node tests/e2e_runner.mjs                   # Run full 4-tier test suite (202 tests)
 *   node tests/e2e_runner.mjs --tier=1          # Run Tier 1 Feature Coverage only
 *   node tests/e2e_runner.mjs --tier=2          # Run Tier 2 Boundary & Corner Cases only
 *   node tests/e2e_runner.mjs --tier=3          # Run Tier 3 Cross-Feature Combinations only
 *   node tests/e2e_runner.mjs --tier=4          # Run Tier 4 Real-World Application Scenarios only
 *   node tests/e2e_runner.mjs --feature=F1      # Run specific feature tests (e.g. F1 through F18)
 *   node tests/e2e_runner.mjs --verbose         # Detailed logs with failure stack traces
 *   node tests/e2e_runner.mjs --json            # Output machine-readable JSON results
 *   node tests/e2e_runner.mjs --strict          # Exit code 1 on any test failure
 */

import { performance } from 'node:perf_hooks';
import { TestRegistry } from './helpers/assertions.mjs';
import { registerTier1Tests } from './tier1_feature_coverage.mjs';
import { registerTier2Tests } from './tier2_boundary_corner.mjs';
import { registerTier3Tests } from './tier3_cross_feature.mjs';
import { registerTier4Tests } from './tier4_scenarios.mjs';

// Feature milestone mapping for actionable escalation
const FEATURE_MILESTONE_MAP = {
  F1: { milestone: 'M1', title: 'Brand Logo Copy & Storage', owner: 'teamwork_worker_m1' },
  F2: { milestone: 'M1', title: 'Brand Logo Integration Site-Wide', owner: 'teamwork_worker_m1' },
  F3: { milestone: 'M1', title: 'Higgsfield MCP Configuration', owner: 'teamwork_worker_m1' },
  F4: { milestone: 'M1', title: 'Higgsfield Brand Visual Formulas', owner: 'teamwork_worker_m1' },
  F5: { milestone: 'M2', title: 'Navigation Ordering & Redesign', owner: 'teamwork_worker_m2' },
  F6: { milestone: 'M2', title: 'Profile Icon & Login Option', owner: 'teamwork_worker_m2' },
  F7: { milestone: 'M2', title: 'Vault Route & Member Gating', owner: 'teamwork_worker_m2' },
  F8: { milestone: 'M3', title: 'Awaken Product Ingestion', owner: 'teamwork_worker_m3' },
  F9: { milestone: 'M3', title: 'POS Images & Categories', owner: 'teamwork_worker_m3' },
  F10: { milestone: 'M3', title: 'Admin Inventory Images & Stock', owner: 'teamwork_worker_m3' },
  F11: { milestone: 'M4', title: 'Metric Standardization in Fixtures', owner: 'teamwork_worker_m4' },
  F12: { milestone: 'M4', title: 'Metric Standardization Site-Wide', owner: 'teamwork_worker_m4' },
  F13: { milestone: 'M5', title: 'Social Media Context & Brand Copy', owner: 'teamwork_worker_m5' },
  F14: { milestone: 'M5', title: 'SEO & Social Metadata', owner: 'teamwork_worker_m5' },
  F15: { milestone: 'M5', title: 'AIO & GEO JSON-LD Structured Data', owner: 'teamwork_worker_m5' },
  F16: { milestone: 'M5', title: 'Dynamic Sitemap & Robots', owner: 'teamwork_worker_m5' },
  F17: { milestone: 'M6', title: 'Mobile Responsiveness: Shell & Overflow', owner: 'teamwork_worker_m6' },
  F18: { milestone: 'M6', title: 'Mobile Responsiveness: Key Surfaces', owner: 'teamwork_worker_m6' },
};

// ANSI color helpers
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gold: '\x1b[38;5;220m',
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    tier: null,
    feature: null,
    verbose: false,
    json: false,
    bail: false,
    strict: false,
  };

  for (const arg of args) {
    if (arg.startsWith('--tier=')) {
      options.tier = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--feature=')) {
      options.feature = arg.split('=')[1].toUpperCase();
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--bail') {
      options.bail = true;
    } else if (arg === '--strict') {
      options.strict = true;
    }
  }

  return options;
}

async function runTestSuite() {
  const startTime = performance.now();
  const options = parseArgs();

  // 1. Register all tests
  TestRegistry.clear();
  registerTier1Tests();
  registerTier2Tests();
  registerTier3Tests();
  registerTier4Tests();

  let testsToRun = TestRegistry.getAll();

  // 2. Filter tests if options provided
  if (options.tier !== null) {
    testsToRun = testsToRun.filter((t) => t.tier === options.tier);
  }
  if (options.feature !== null) {
    const featRegex = new RegExp(`(^|\\b|\\+)${options.feature}(\\b|\\+|$)`, 'i');
    testsToRun = testsToRun.filter((t) => featRegex.test(t.feature));
  }

  if (!options.json) {
    console.log(`\n${colors.gold}${colors.bold}========================================================================${colors.reset}`);
    console.log(`${colors.gold}${colors.bold}  420 CARTEL :: MASTER E2E TEST RUNNER${colors.reset}`);
    console.log(`${colors.gold}${colors.bold}  Tiers 1-4 Feature Verification & Regression Suite${colors.reset}`);
    console.log(`${colors.gold}${colors.bold}========================================================================${colors.reset}\n`);
    console.log(`${colors.dim}Total tests registered: ${testsToRun.length}${colors.reset}`);
    if (options.tier) console.log(`${colors.cyan}Filtered by Tier: ${options.tier}${colors.reset}`);
    if (options.feature) console.log(`${colors.cyan}Filtered by Feature: ${options.feature}${colors.reset}`);
    console.log('');
  }

  const results = [];
  let currentTier = null;
  let currentFeature = null;

  // 3. Execute tests safely
  for (const test of testsToRun) {
    if (!options.json) {
      if (test.tier !== currentTier) {
        currentTier = test.tier;
        currentFeature = null;
        console.log(`\n${colors.cyan}${colors.bold}▶ TIER ${currentTier}: ${getTierTitle(currentTier)}${colors.reset}`);
      }
      if (test.feature !== currentFeature && test.tier <= 2) {
        currentFeature = test.feature;
        const meta = FEATURE_MILESTONE_MAP[currentFeature] || { title: currentFeature, milestone: 'M?' };
        console.log(`  ${colors.bold}${colors.white}[${currentFeature}] ${meta.title} (${meta.milestone})${colors.reset}`);
      }
    }

    const testStart = performance.now();
    let status = 'PASS';
    let error = null;

    try {
      test.fn();
    } catch (err) {
      status = 'FAIL';
      error = {
        message: err.message,
        actual: err.actual !== undefined ? err.actual : null,
        expected: err.expected !== undefined ? err.expected : null,
        stack: err.stack,
      };
    }

    const duration = Math.round((performance.now() - testStart) * 100) / 100;

    const result = {
      id: test.id,
      name: test.name,
      feature: test.feature,
      tier: test.tier,
      description: test.description,
      status,
      durationMs: duration,
      error,
    };
    results.push(result);

    if (!options.json) {
      const badge = status === 'PASS' 
        ? `${colors.green}${colors.bold}✓ PASS${colors.reset}` 
        : `${colors.red}${colors.bold}✗ FAIL${colors.reset}`;
      const prefix = test.tier <= 2 ? '    ' : '  ';
      console.log(`${prefix}${badge} ${colors.dim}${test.id}${colors.reset} - ${test.name} ${colors.dim}(${duration}ms)${colors.reset}`);

      if (status === 'FAIL' && options.verbose) {
        console.log(`${prefix}  ${colors.red}${error.message}${colors.reset}`);
      }
    }

    if (status === 'FAIL' && options.bail) {
      if (!options.json) {
        console.log(`\n${colors.yellow}Execution halted due to --bail flag.${colors.reset}`);
      }
      break;
    }
  }

  const totalTime = Math.round((performance.now() - startTime) * 100) / 100;

  // 4. Summarize results
  const total = results.length;
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const passRate = total > 0 ? Math.round((passed / total) * 1000) / 10 : 0;

  // Tier Breakdown
  const tierSummary = {};
  for (let t = 1; t <= 4; t++) {
    const tTests = results.filter((r) => r.tier === t);
    const tPass = tTests.filter((r) => r.status === 'PASS').length;
    tierSummary[t] = {
      total: tTests.length,
      passed: tPass,
      failed: tTests.length - tPass,
      passRate: tTests.length > 0 ? Math.round((tPass / tTests.length) * 1000) / 10 : 0,
    };
  }

  // Feature Breakdown (F1..F18)
  const featureSummary = {};
  for (let i = 1; i <= 18; i++) {
    const fId = `F${i}`;
    const fTests = results.filter((r) => r.feature.includes(fId));
    const fPass = fTests.filter((r) => r.status === 'PASS').length;
    featureSummary[fId] = {
      total: fTests.length,
      passed: fPass,
      failed: fTests.length - fPass,
      milestone: FEATURE_MILESTONE_MAP[fId]?.milestone || 'M?',
      owner: FEATURE_MILESTONE_MAP[fId]?.owner || 'unknown',
    };
  }

  if (options.json) {
    const jsonOutput = {
      timestamp: new Date().toISOString(),
      durationMs: totalTime,
      summary: {
        total,
        passed,
        failed,
        passRatePct: passRate,
      },
      tierSummary,
      featureSummary,
      results,
    };
    console.log(JSON.stringify(jsonOutput, null, 2));
    if (options.strict && failed > 0) process.exit(1);
    return;
  }

  // Console Summary Report
  console.log(`\n${colors.gold}${colors.bold}========================================================================${colors.reset}`);
  console.log(`${colors.gold}${colors.bold}  TEST SUITE EXECUTION SUMMARY${colors.reset}`);
  console.log(`${colors.gold}${colors.bold}========================================================================${colors.reset}\n`);

  console.log(`  Total Executed : ${colors.bold}${total}${colors.reset}`);
  console.log(`  Passed         : ${colors.green}${colors.bold}${passed}${colors.reset}`);
  console.log(`  Failed         : ${failed > 0 ? colors.red : colors.green}${colors.bold}${failed}${colors.reset}`);
  console.log(`  Pass Rate      : ${passRate === 100 ? colors.green : colors.yellow}${colors.bold}${passRate}%${colors.reset}`);
  console.log(`  Execution Time : ${colors.dim}${totalTime}ms${colors.reset}\n`);

  console.log(`${colors.bold}Tier Breakdown:${colors.reset}`);
  for (let t = 1; t <= 4; t++) {
    const s = tierSummary[t];
    const statusColor = s.failed === 0 ? colors.green : colors.yellow;
    console.log(
      `  Tier ${t} (${getTierTitle(t).padEnd(35)}) : ${statusColor}${s.passed}/${s.total} passed (${s.passRate}%)${colors.reset}`
    );
  }

  console.log(`\n${colors.bold}Feature Inventory Progress (F1 - F18):${colors.reset}`);
  for (let i = 1; i <= 18; i++) {
    const fId = `F${i}`;
    const s = featureSummary[fId];
    if (s.total === 0) continue;
    const meta = FEATURE_MILESTONE_MAP[fId];
    const statusIcon = s.failed === 0 ? `${colors.green}✓ PASS` : `${colors.red}✗ PENDING`;
    console.log(
      `  ${fId.padEnd(4)} [${s.milestone}] ${(meta?.title || '').padEnd(38)} : ${statusIcon}${colors.reset} (${s.passed}/${s.total} tests passing) -> ${colors.dim}${s.owner}${colors.reset}`
    );
  }

  // Actionable Escalations
  if (failed > 0) {
    console.log(`\n${colors.yellow}${colors.bold}------------------------------------------------------------------------${colors.reset}`);
    console.log(`${colors.yellow}${colors.bold}  ACTIONABLE ESCALATION SUMMARY (Features Pending Worker Implementation)${colors.reset}`);
    console.log(`${colors.yellow}${colors.bold}------------------------------------------------------------------------${colors.reset}\n`);

    const failedByFeature = {};
    for (const r of results) {
      if (r.status === 'FAIL') {
        const fKey = r.feature;
        if (!failedByFeature[fKey]) failedByFeature[fKey] = [];
        failedByFeature[fKey].push(r);
      }
    }

    for (const [feat, fList] of Object.entries(failedByFeature)) {
      const meta = FEATURE_MILESTONE_MAP[feat] || { milestone: 'M-Integration', owner: 'workers' };
      console.log(`  ${colors.red}${colors.bold}[${feat}] ${meta.title || feat}${colors.reset} (${fList.length} failing tests)`);
      console.log(`    Target Milestone: ${colors.cyan}${meta.milestone}${colors.reset} | Assigned Agent: ${colors.cyan}${meta.owner}${colors.reset}`);
      for (const f of fList.slice(0, 3)) {
        console.log(`      - ${colors.dim}${f.id}:${colors.reset} ${f.error?.message || f.name}`);
      }
      if (fList.length > 3) {
        console.log(`      ... and ${fList.length - 3} more failing assertions`);
      }
      console.log('');
    }
  } else {
    console.log(`\n${colors.green}${colors.bold}★ ALL 202 E2E TESTS PASSED (100% SPEC COMPLIANCE) ★${colors.reset}\n`);
  }

  if (options.strict && failed > 0) {
    process.exit(1);
  }
}

function getTierTitle(tier) {
  switch (tier) {
    case 1:
      return 'Feature Coverage (Happy Path)';
    case 2:
      return 'Boundary & Corner Cases (Edge Viewports / Units / Sessions)';
    case 3:
      return 'Cross-Feature Combinations (Integration Workflows)';
    case 4:
      return 'Real-World Application Scenarios (Customer & Staff Journeys)';
    default:
      return 'Unknown Tier';
  }
}

// Execute runner
runTestSuite().catch((err) => {
  console.error('Fatal unhandled error in test runner:', err);
  process.exit(1);
});
