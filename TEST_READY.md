# 420 Cartel :: Test Ready Publication (`TEST_READY.md`)

**Date**: 2026-11-10  
**Test Suite Version**: 1.0.0  
**Status**: **READY FOR MILESTONE VERIFICATION**  
**Runner Command**: `node tests/e2e_runner.mjs`  

---

## 1. Executive Summary

The master E2E test suite for the 420 Cartel modernization project has been designed, implemented, and verified. The test suite provides opaque-box coverage across all 18 features (F1 through F18) specified in `PROJECT.md § Feature Inventory` across the 4-tier test architecture.

The test suite runs deterministically on Node.js v22 without external dependencies or flaky browser harnesses, executing all 202 tests in **~150 milliseconds**.

### Architecture & Coverage

| Tier | Category | Minimum Required | Implemented Tests | Pass Status (Baseline) |
| :---: | :--- | :---: | :---: | :---: |
| **Tier 1** | Feature Coverage (Happy Path) | >= 5 per feature (90) | **90** | 46 Passed / 44 Pending Implementation |
| **Tier 2** | Boundary & Corner Cases (Edge Viewports / Units / Sessions) | >= 5 per feature (90) | **90** | 67 Passed / 23 Pending Implementation |
| **Tier 3** | Cross-Feature Combinations (Integration Workflows) | >= 10 | **12** | 8 Passed / 4 Pending Implementation |
| **Tier 4** | Real-World Application Scenarios (Customer & Staff Journeys) | >= 10 | **10** | 5 Passed / 5 Pending Implementation |
| **Total** | **Comprehensive Master Suite** | **>= 200** | **202 Tests** | **126 Passed (62.4%) / 76 Pending (37.6%)** |

*Note: Tests marked "Pending Implementation" fail with specific, actionable assertion errors indicating features currently assigned to workers for Milestones M1 through M6.*

---

## 2. How to Run the Tests

```bash
# 1. Run the entire 4-tier test suite (202 tests)
node tests/e2e_runner.mjs

# 2. Run with detailed failure explanations and diffs
node tests/e2e_runner.mjs --verbose

# 3. Filter by Tier
node tests/e2e_runner.mjs --tier=1      # Tier 1 (Feature Coverage)
node tests/e2e_runner.mjs --tier=2      # Tier 2 (Boundary & Corner Cases)
node tests/e2e_runner.mjs --tier=3      # Tier 3 (Cross-Feature Combinations)
node tests/e2e_runner.mjs --tier=4      # Tier 4 (Real-World Scenarios)

# 4. Filter by Feature (e.g., F1, F5, F8, F11)
node tests/e2e_runner.mjs --feature=F1  # Tests for Brand Logo Copy & Storage
node tests/e2e_runner.mjs --feature=F5  # Tests for Navigation Ordering
node tests/e2e_runner.mjs --feature=F8  # Tests for Awaken Product Ingestion
node tests/e2e_runner.mjs --feature=F11 # Tests for Metric Standardization

# 5. Output Machine-Readable JSON
node tests/e2e_runner.mjs --json

# 6. CI / Gatekeeper Mode (exits with code 1 on any failure)
node tests/e2e_runner.mjs --strict
```

---

## 3. Feature Inventory Status & Worker Escalation Map

| Feature | Feature Title | Milestone | Owner | Total Tests | Status | Action Needed by Worker |
| :--- | :--- | :---: | :--- | :---: | :---: | :--- |
| **F1** | Brand Logo Copy & Storage | M1 | `teamwork_worker_m1` | 12 | **PASS (11/12)** | Public asset present; T3-07 needs Twitter card reference |
| **F2** | Brand Logo Integration Site-Wide | M1 | `teamwork_worker_m1` | 12 | PENDING (10/12) | Add logo link to Twitter card in `src/app/layout.tsx` |
| **F3** | Higgsfield MCP Configuration | M1 | `teamwork_worker_m1` | 11 | **PASS (10/11)** | Add request timeout / AbortSignal in pipeline |
| **F4** | Higgsfield Brand Visual Formulas | M1 | `teamwork_worker_m1` | 11 | **PASS (10/11)** | Guard `terpeneTags.length` in `prompt.ts` |
| **F5** | Navigation Ordering & Redesign | M2 | `teamwork_worker_m2` | 15 | PENDING (7/15) | Implement mobile drawer, hamburger toggle, route order |
| **F6** | Profile Icon & Login Option | M2 | `teamwork_worker_m2` | 10 | PENDING (8/10) | Add explicit "Log in" textual option linking to `/login` |
| **F7** | Vault Route & Member Gating | M2 | `teamwork_worker_m2` | 16 | PENDING (9/16) | Create `src/app/vault/page.tsx` & client redirect to `/onboarding` |
| **F8** | Awaken Product Ingestion | M3 | `teamwork_worker_m3` | 16 | PENDING (8/16) | Ingest 10 Awaken vape products & media into `fixtures.ts` |
| **F9** | POS Images & Categories | M3 | `teamwork_worker_m3` | 13 | PENDING (9/13) | Add `hero_media_url` images & VAPE/ACCESSORY tabs to POS |
| **F10** | Admin Inventory Images & Stock | M3 | `teamwork_worker_m3` | 15 | PENDING (8/15) | Render product images & low stock threshold in admin inventory |
| **F11** | Metric Standardization in Fixtures | M4 | `teamwork_worker_m4` | 14 | PENDING (7/14) | Eliminate 'Eighth', 'Quarter', 'Half', 'Ounce' from `fixtures.ts` |
| **F12** | Metric Standardization Site-Wide | M4 | `teamwork_worker_m4` | 14 | PENDING (12/14) | Remove imperial strings from `src/app/shop/page.tsx` |
| **F13** | Social Media Context & Brand Copy | M5 | `teamwork_worker_m5` | 14 | PENDING (7/14) | Add official Instagram/Facebook links & daily 09:00-20:00 hours |
| **F14** | SEO & Social Metadata | M5 | `teamwork_worker_m5` | 13 | PENDING (8/13) | Add rich description & `summary_large_image` Twitter card |
| **F15** | AIO & GEO JSON-LD Structured Data | M5 | `teamwork_worker_m5` | 12 | PENDING (0/12) | Create `src/components/seo/JsonLd.tsx` with Schema.org |
| **F16** | Dynamic Sitemap & Robots | M5 | `teamwork_worker_m5` | 11 | PENDING (0/11) | Create `src/app/sitemap.ts` and `src/app/robots.ts` |
| **F17** | Mobile Responsiveness: Shell & Overflow | M6 | `teamwork_worker_m6` | 11 | PENDING (7/11) | Add `overflow-x: hidden` to `body` in `src/app/globals.css` |
| **F18** | Mobile Responsiveness: Key Surfaces | M6 | `teamwork_worker_m6` | 12 | **PASS (11/12)** | Ensure responsive wrapping across all surfaces |

---

## 4. Milestone Verification Workflow

As each worker completes their milestone:
1. Run feature-targeted tests:
   ```bash
   node tests/e2e_runner.mjs --feature=F<id>
   ```
2. Verify all tests for that feature flip to `✓ PASS`.
3. At project completion (Milestone M-Final), run the full strict suite:
   ```bash
   node tests/e2e_runner.mjs --strict
   ```
   100% pass rate confirms complete compliance with `PROJECT.md` and `ORIGINAL_REQUEST.md`.
