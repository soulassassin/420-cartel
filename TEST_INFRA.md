# 420 Cartel :: E2E Test Infrastructure & Methodology (`TEST_INFRA.md`)

## 1. Overview & Architecture

The 420 Cartel End-to-End (E2E) Test Suite provides comprehensive, opaque-box verification across the entire project lifecycle—from individual feature unit contracts up to real-world multi-step user and budtender journeys.

The test infrastructure is built directly upon standard Node.js ESM (`node:perf_hooks`, `node:fs`, `node:path`) with zero external test runtime dependencies. It executes deterministically, without flaky browser crashes, across Windows, Linux, and CI environments in ~150ms.

### The 4-Tier Test Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│  Tier 4: Real-World Scenarios (10 User Journeys)                      │
│  Customer Ordering · POS Checkout · SEO Crawler · VIP Vault · Pass     │
├────────────────────────────────────────────────────────────────────────┤
│  Tier 3: Cross-Feature Combinations (12 Integration Tests)            │
│  Catalog + Metrics · POS + Realtime Stock · Onboarding + Gating        │
├────────────────────────────────────────────────────────────────────────┤
│  Tier 2: Boundary & Corner Cases (90 Tests · >=5 per Feature F1..F18)  │
│  Empty Sessions · 320px/375px/1280px · Imperial Regex · Extreme Qty    │
├────────────────────────────────────────────────────────────────────────┤
│  Tier 1: Feature Coverage (90 Tests · >=5 per Feature F1..F18)        │
│  Happy path verification for all 18 features in Feature Inventory     │
└────────────────────────────────────────────────────────────────────────┘
```

Total Test Suite Size: **202 Tests**

---

## 2. Test File Layout

```
tests/
├── e2e_runner.mjs               # Master CLI test runner with ANSI reporting & JSON output
├── tier1_feature_coverage.mjs   # 90 tests: 5 tests per feature (F1 through F18)
├── tier2_boundary_corner.mjs    # 90 tests: boundary, negative, viewport & regex checks
├── tier3_cross_feature.mjs      # 12 multi-feature integration workflows
├── tier4_scenarios.mjs          # 10 end-to-end customer, staff, and crawler scenarios
└── helpers/
    ├── assertions.mjs           # Zero-dependency assertion engine & TestRegistry singleton
    └── mock_session.mjs         # Headless session store, access guard & cart simulator
```

---

## 3. Feature Mapping Matrix (F1 through F18)

Every test case maps explicitly to a feature ID, milestone, and assigned implementing agent:

| Feature | Feature Title | Milestone | Assigned Agent | Tier 1 Tests | Tier 2 Tests | Tier 3/4 Inclusion |
| :--- | :--- | :---: | :--- | :---: | :---: | :---: |
| **F1** | Brand Logo Copy & Storage | M1 | `teamwork_worker_m1` | 5 | 5 | T3-06, T3-07 |
| **F2** | Brand Logo Integration Site-Wide | M1 | `teamwork_worker_m1` | 5 | 5 | T3-06, T3-07, T4-08 |
| **F3** | Higgsfield MCP Configuration | M1 | `teamwork_worker_m1` | 5 | 5 | T3-08 |
| **F4** | Higgsfield Brand Visual Formulas | M1 | `teamwork_worker_m1` | 5 | 5 | T3-08, T4-07 |
| **F5** | Navigation Ordering & Redesign | M2 | `teamwork_worker_m2` | 5 | 5 | T3-05, T4-01, T4-09 |
| **F6** | Profile Icon & Login Option | M2 | `teamwork_worker_m2` | 5 | 5 | T3-04 |
| **F7** | Vault Route & Member Gating | M2 | `teamwork_worker_m2` | 5 | 5 | T3-04, T3-05, T3-12, T4-01, T4-04, T4-05 |
| **F8** | Awaken Product Ingestion | M3 | `teamwork_worker_m3` | 5 | 5 | T3-01, T3-02, T3-10, T4-01, T4-04 |
| **F9** | POS Images & Categories | M3 | `teamwork_worker_m3` | 5 | 5 | T3-02, T3-03, T3-09, T4-02 |
| **F10** | Admin Inventory Images & Stock | M3 | `teamwork_worker_m3` | 5 | 5 | T3-03, T3-09, T4-02, T4-06 |
| **F11** | Metric Standardization in Fixtures | M4 | `teamwork_worker_m4` | 5 | 5 | T3-01, T3-10, T4-01, T4-04 |
| **F12** | Metric Standardization Site-Wide | M4 | `teamwork_worker_m4` | 5 | 5 | T3-01, T3-10, T4-01, T4-02 |
| **F13** | Social Media Context & Brand Copy | M5 | `teamwork_worker_m5` | 5 | 5 | T3-11, T4-05, T4-08, T4-10 |
| **F14** | SEO & Social Metadata | M5 | `teamwork_worker_m5` | 5 | 5 | T3-07, T4-03, T4-10 |
| **F15** | AIO & GEO JSON-LD Structured Data | M5 | `teamwork_worker_m5` | 5 | 5 | T3-11, T4-03 |
| **F16** | Dynamic Sitemap & Robots | M5 | `teamwork_worker_m5` | 5 | 5 | T4-03 |
| **F17** | Mobile Responsiveness: Shell & Overflow | M6 | `teamwork_worker_m6` | 5 | 5 | T4-09 |
| **F18** | Mobile Responsiveness: Key Surfaces | M6 | `teamwork_worker_m6` | 5 | 5 | T4-07, T4-09 |

---

## 4. Test Runner CLI Commands

The runner provides flexible execution modes for individual workers, orchestrator verification, and CI pipelines:

```bash
# Full test suite execution (all 202 tests)
node tests/e2e_runner.mjs

# Milestone/Tier-specific execution
node tests/e2e_runner.mjs --tier=1        # Feature Coverage (Happy Path, 90 tests)
node tests/e2e_runner.mjs --tier=2        # Boundary & Corner Cases (90 tests)
node tests/e2e_runner.mjs --tier=3        # Cross-Feature Integration (12 tests)
node tests/e2e_runner.mjs --tier=4        # Real-World Scenarios (10 tests)

# Feature-specific execution (e.g. while working on F1 or F8)
node tests/e2e_runner.mjs --feature=F1     # Tests touching F1 (Logo copy & storage)
node tests/e2e_runner.mjs --feature=F5     # Tests touching F5 (Navigation redesign)
node tests/e2e_runner.mjs --feature=F8     # Tests touching F8 (Awaken products)
node tests/e2e_runner.mjs --feature=F11    # Tests touching F11 (Metric standardization)

# Verbose failure output with line numbers and expected vs actual diffs
node tests/e2e_runner.mjs --verbose

# Machine-readable JSON output (for automated orchestration / reporting)
node tests/e2e_runner.mjs --json

# CI / Final Hardening Mode (exits with non-zero exit code on any failure)
node tests/e2e_runner.mjs --strict
```

---

## 5. Expected Output Derivation & Verification Methodology

Every test derives its expected assertion values strictly from the authoritative project contracts:
1. **Logo Contract**: Dimensions `1080x1080` and `image/jpeg` format directly verified by reading binary SOF markers in `public/fourtwentycartel_logo.jpg`.
2. **Navigation Contract**: Strict ordered list `['/', '/about', '/onboarding', '/vault', '/contact']` and `/account` + `/login`.
3. **Access Control Contract**: Anonymous or unverified visitors redirected to `/onboarding?next=...` on `/vault` and `/shop`.
4. **Metric System Contract**: Zero tolerance for imperial strings (`\b(eighth|quarter|half|ounce|oz|lbs|fl oz)\b`) in UI copy, fixtures, and receipts.
5. **SEO & AIO Contract**: Valid schema.org structured data for `Organization`, `SocialClub`/`LocalBusiness` (Sandton, Norwood, Rivonia, Kibler Park), `FAQPage`, and `BreadcrumbList`.
6. **Mobile Containment Contract**: Global `overflow-x: hidden` and absence of unconstrained viewport typography (`text-[20.5vw]`).
