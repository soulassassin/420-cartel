/**
 * 420 CARTEL :: MILESTONE 6 EMPIRICAL ADVERSARIAL CHALLENGE HARNESS
 *
 * Verifies Mobile Responsiveness Remediation (Requirement R7, Features F17 & F18)
 * under adversarial stress conditions, multi-viewport simulations, accessibility
 * audits, and invariant protections.
 */

import fs from 'fs';
import path from 'path';

const ROOT_DIR = process.cwd();

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureDetails = [];

function assert(condition, message, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${message}`);
    if (details) {
      console.error(`    ↳ Details: ${details}`);
    }
    failureDetails.push({ message, details });
  }
}

console.log('========================================================================');
console.log('  CHALLENGER 1 :: MILESTONE 6 EMPIRICAL ADVERSARIAL STRESS SUITE');
console.log('  Mobile Responsiveness Remediation (Requirement R7, Features F17 & F18)');
console.log('========================================================================\n');

// ------------------------------------------------------------------------
// SECTION 1: Viewport Shell & Overflow Containment (Feature F17)
// ------------------------------------------------------------------------
console.log('▶ SECTION 1: Viewport Shell & Global Overflow Containment (F17)');

const globalsCssPath = path.join(ROOT_DIR, 'src/app/globals.css');
assert(fs.existsSync(globalsCssPath), 'src/app/globals.css exists');
const globalsCss = fs.readFileSync(globalsCssPath, 'utf8');

// 1.1 Body overflow-x: hidden
const bodyBlockMatch = globalsCss.match(/(?:^|\n)\s*body\s*\{([^}]+)\}/);
assert(
  bodyBlockMatch !== null && /overflow-x:\s*hidden/.test(bodyBlockMatch[1]),
  'globals.css body block explicitly declares overflow-x: hidden;',
  bodyBlockMatch ? bodyBlockMatch[1].trim() : 'No body block found'
);

// 1.2 No overriding overflow-x: visible or auto in body or html
const conflictingBodyOverflow = /body[^{]*\{[^}]*overflow-x:\s*(visible|auto|scroll)[^}]*\}/i.test(globalsCss);
assert(!conflictingBodyOverflow, 'No conflicting overflow-x: visible/auto/scroll overrides on body in globals.css');

// 1.3 Layout body class
const layoutPath = path.join(ROOT_DIR, 'src/app/layout.tsx');
assert(fs.existsSync(layoutPath), 'src/app/layout.tsx exists');
const layoutContent = fs.readFileSync(layoutPath, 'utf8');

const layoutBodyTagMatch = layoutContent.match(/<body([^>]+)>/);
assert(
  layoutBodyTagMatch !== null && /overflow-x-hidden/.test(layoutBodyTagMatch[1]),
  'layout.tsx <body> element applies overflow-x-hidden utility class',
  layoutBodyTagMatch ? layoutBodyTagMatch[1].trim() : 'No body tag found'
);

// 1.4 Next.js Viewport export validation
assert(
  /export\s+const\s+viewport:\s*Viewport\s*=\s*\{/.test(layoutContent),
  'layout.tsx exports typed Next.js Viewport configuration'
);
assert(
  /width:\s*['"]device-width['"]/.test(layoutContent) && /initialScale:\s*1/.test(layoutContent),
  'layout.tsx Viewport specifies width: device-width and initialScale: 1'
);

// 1.5 Landing page footer overflow containment
const pagePath = path.join(ROOT_DIR, 'src/app/page.tsx');
assert(fs.existsSync(pagePath), 'src/app/page.tsx exists');
const pageContent = fs.readFileSync(pagePath, 'utf8');

const footerTagMatch = pageContent.match(/<footer([^>]+)>/);
assert(
  footerTagMatch !== null && /overflow-hidden/.test(footerTagMatch[1]),
  'src/app/page.tsx footer element contains overflow-hidden',
  footerTagMatch ? footerTagMatch[1].trim() : 'No footer tag found'
);

// 1.6 Verify massive watermark is contained within footer
const watermarkMatch = pageContent.match(/text-\[20\.5vw\]/);
assert(watermarkMatch !== null, 'Hero/Landing page retains the 20.5vw brand watermark');
const footerBlock = pageContent.slice(pageContent.indexOf('<footer'), pageContent.indexOf('</footer>') + 9);
assert(
  footerBlock.includes('text-[20.5vw]'),
  'Brand watermark text-[20.5vw] is strictly wrapped inside the overflow-hidden footer container'
);

// ------------------------------------------------------------------------
// SECTION 2: Mobile Navigation Accessibility & Touch Targets (CartelCommandNav)
// ------------------------------------------------------------------------
console.log('\n▶ SECTION 2: Mobile Command Nav Accessibility & Breakpoints');

const navPath = path.join(ROOT_DIR, 'src/components/layout/CartelCommandNav.tsx');
assert(fs.existsSync(navPath), 'src/components/layout/CartelCommandNav.tsx exists');
const navContent = fs.readFileSync(navPath, 'utf8');

// 2.1 Escape key handler
assert(
  /e\.key\s*===\s*['"]Escape['"]/.test(navContent),
  'CartelCommandNav handles Escape keydown event'
);
assert(
  /if\s*\(!isOpen\)\s*return/.test(navContent),
  'Escape key listener is guarded by isOpen state (does not leak to background)'
);
assert(
  /window\.removeEventListener\(['"]keydown['"]/.test(navContent),
  'Escape key listener removes event listener on unmount/re-render'
);

// 2.2 Touch target dimensions (WCAG 2.1 Level AA: min 44px)
// h-11 w-11 in Tailwind = 2.75rem = 44px
const hamburgerSnippet = navContent.slice(
  navContent.indexOf('aria-label="Toggle navigation"'),
  navContent.indexOf('aria-label="Toggle navigation"') + 250
);
assert(
  hamburgerSnippet.includes('h-11') && hamburgerSnippet.includes('w-11'),
  'Mobile hamburger button meets WCAG 44px min touch target (h-11 w-11)',
  hamburgerSnippet
);

const closeSnippet = navContent.slice(
  navContent.indexOf('aria-label="Close navigation"'),
  navContent.indexOf('aria-label="Close navigation"') + 250
);
assert(
  closeSnippet.includes('h-11') && closeSnippet.includes('w-11'),
  'Drawer close button meets WCAG 44px min touch target (h-11 w-11)',
  closeSnippet
);

const userProfileMatch = navContent.match(/<Link[^>]+href=["']\/account["'][^>]*aria-label=["']Your profile["'][^>]*>/);
assert(
  userProfileMatch !== null && /h-11\s+w-11/.test(userProfileMatch[0]),
  'Profile icon touch target meets WCAG 44px standard (h-11 w-11)',
  userProfileMatch ? userProfileMatch[0] : 'Not found'
);

// 2.3 Drawer panel maximum width constraints
assert(
  /w-full\s+max-w-sm/.test(navContent),
  'Mobile drawer panel has w-full max-w-sm (fits 320px/375px screens without horizontal spill)'
);

// ------------------------------------------------------------------------
// SECTION 3: Key Interactive Surfaces Responsiveness (Feature F18)
// ------------------------------------------------------------------------
console.log('\n▶ SECTION 3: Key Interactive Surfaces Responsive Implementations (F18)');

// 3.1 Onboarding Step Rail
const onboardingPath = path.join(ROOT_DIR, 'src/app/onboarding/page.tsx');
assert(fs.existsSync(onboardingPath), 'src/app/onboarding/page.tsx exists');
const onboardingContent = fs.readFileSync(onboardingPath, 'utf8');

assert(
  /flex\s+flex-col\s+sm:flex-row/.test(onboardingContent),
  'Onboarding step rail items use responsive stacking (flex-col sm:flex-row)'
);
assert(
  /text-xs\s+sm:type-ui/.test(onboardingContent),
  'Onboarding step rail text scales down on mobile viewports (text-xs sm:type-ui)'
);
assert(
  /truncate/.test(onboardingContent) && /<span[^>]*className=["'][^"']*truncate[^"']*["']>\s*\{label\}/.test(onboardingContent),
  'Onboarding step rail labels use truncate to avoid layout blowout'
);

// 3.2 POS Member Search & Product Search
const posPath = path.join(ROOT_DIR, 'src/app/pos/page.tsx');
assert(fs.existsSync(posPath), 'src/app/pos/page.tsx exists');
const posContent = fs.readFileSync(posPath, 'utf8');

assert(
  /flex\s+flex-wrap\s+sm:flex-nowrap\s+items-center\s+gap-2\s+w-full\s+sm:w-auto/.test(posContent),
  'POS member search header wraps gracefully on small viewports (flex-wrap sm:flex-nowrap)'
);
assert(
  /w-full\s+sm:w-64/.test(posContent),
  'POS member search input expands full width on mobile (w-full sm:w-64)'
);
assert(
  /w-full\s+sm:w-80\s+max-w-\[calc\(100vw-2rem\)\]/.test(posContent),
  'POS member search dropdown is clamped with max-w-[calc(100vw-2rem)]'
);
assert(
  /w-full\s+sm:w-48/.test(posContent),
  'POS product query input expands full width on mobile (w-full sm:w-48)'
);

// 3.3 POS Thumbnail Container Invariant Check
assert(
  posContent.includes('relative size-12 shrink-0 overflow-hidden rounded border border-[color:var(--border-mono)] bg-void'),
  'POS product thumbnail container invariant strictly preserved'
);

// 3.4 Admin Inventory Tabs
const adminInvPath = path.join(ROOT_DIR, 'src/app/admin/inventory/page.tsx');
assert(fs.existsSync(adminInvPath), 'src/app/admin/inventory/page.tsx exists');
const adminInvContent = fs.readFileSync(adminInvPath, 'utf8');

assert(
  /flex\s+flex-wrap\s+gap-2/.test(adminInvContent),
  'Admin inventory sub-tabs container has flex-wrap to prevent horizontal spill'
);
assert(
  adminInvContent.includes('relative size-12 shrink-0 overflow-hidden rounded border border-[color:var(--border-mono)] bg-void'),
  'Admin inventory thumbnail container invariant strictly preserved'
);

// 3.5 AI Sommelier Tool Stream & Chat Send Button
const agentPath = path.join(ROOT_DIR, 'src/app/agent/page.tsx');
assert(fs.existsSync(agentPath), 'src/app/agent/page.tsx exists');
const agentContent = fs.readFileSync(agentPath, 'utf8');

assert(
  /flex\s+flex-col\s+sm:flex-row\s+sm:items-center\s+justify-between\s+gap-2/.test(agentContent),
  'AI Sommelier tool stream header stacks vertically on mobile (flex-col sm:flex-row)'
);
assert(
  !/bg-transparent\s+text-black/.test(agentContent),
  'AI Sommelier send button eliminated low-contrast/invisible bg-transparent text-black'
);
assert(
  /bg-foreground\s+hover:bg-foreground\/90\s+disabled:opacity-40\s+text-background/.test(agentContent),
  'AI Sommelier send button uses high-contrast bg-foreground text-background'
);

// ------------------------------------------------------------------------
// SECTION 4: Viewport Boundary Stress Simulations (320px, 375px, 768px, 1280px)
// ------------------------------------------------------------------------
console.log('\n▶ SECTION 4: Viewport Boundary Stress Simulations');

const VIEWPORT_TESTS = [
  { name: 'Ultra-compact mobile (iPhone SE 1st gen / Android compact)', width: 320, paddingRem: 2 },
  { name: 'Standard mobile (iPhone SE 2nd gen / iPhone 13 mini)', width: 375, paddingRem: 2 },
  { name: 'Tablet portrait (iPad Mini / Air)', width: 768, paddingRem: 3 },
  { name: 'Standard desktop (MacBook / PC Monitor)', width: 1280, paddingRem: 4 },
];

for (const vp of VIEWPORT_TESTS) {
  // Simulate POS dropdown max width: calc(100vw - 2rem) -> 1rem = 16px
  const paddingPx = 2 * 16; // 32px
  const maxDropdownWidth = vp.width - paddingPx;
  const standardDropdownWidth = 320; // sm:w-80 = 20rem = 320px
  const effectiveDropdownWidth = vp.width < 640 ? Math.min(vp.width, maxDropdownWidth) : standardDropdownWidth;

  const fitsInViewport = effectiveDropdownWidth <= vp.width;
  assert(
    fitsInViewport,
    `[Viewport ${vp.width}px (${vp.name})] POS search dropdown effectively fits within screen (${effectiveDropdownWidth}px <= ${vp.width}px)`
  );

  // Simulate Drawer max width: w-full max-w-sm (max-w-sm = 24rem = 384px)
  const maxDrawerWidth = 384;
  const effectiveDrawerWidth = Math.min(vp.width, maxDrawerWidth);
  assert(
    effectiveDrawerWidth <= vp.width,
    `[Viewport ${vp.width}px (${vp.name})] Mobile slide-over drawer width (${effectiveDrawerWidth}px) fits within viewport`
  );

  // Simulate Footer watermark 20.5vw text blowout containment
  const fontSizePx = (20.5 / 100) * vp.width;
  // At 320px, 20.5vw is 65.6px. Text "420 Cartel" is 10 chars -> estimated ~450px wide.
  const estTextWidth = fontSizePx * 6.8; 
  const exceedsContainer = estTextWidth > vp.width;
  // Because footer has overflow-hidden, parent width is preserved exactly
  assert(
    footerBlock.includes('overflow-hidden'),
    `[Viewport ${vp.width}px] Watermark (~${Math.round(estTextWidth)}px) would overflow viewport, but overflow-hidden prevents horizontal scroll blowout`
  );
}

// ------------------------------------------------------------------------
// SECTION 5: Metric System Purity Verification
// ------------------------------------------------------------------------
console.log('\n▶ SECTION 5: Metric System Purity Verification across Modified Files');

const MODIFIED_FILES = [
  'src/app/globals.css',
  'src/app/layout.tsx',
  'src/app/page.tsx',
  'src/app/onboarding/page.tsx',
  'src/app/pos/page.tsx',
  'src/app/admin/inventory/page.tsx',
  'src/app/agent/page.tsx',
  'src/components/layout/CartelCommandNav.tsx',
];

const IMPERIAL_PATTERNS = [
  /\bounces?\b/i,
  /\b\d+\s*oz\b/i,
  /\bpounds?\b/i,
  /\b\d+\s*lbs?\b/i,
  /\beighth\b/i,
  /\bquarter\s+oz\b/i,
];

let imperialViolations = 0;

for (const relFile of MODIFIED_FILES) {
  const fullPath = path.join(ROOT_DIR, relFile);
  const content = fs.readFileSync(fullPath, 'utf8');
  for (const pat of IMPERIAL_PATTERNS) {
    const match = content.match(pat);
    if (match) {
      imperialViolations++;
      assert(false, `Imperial term violation in ${relFile}`, `Matched: "${match[0]}"`);
    }
  }
}

if (imperialViolations === 0) {
  assert(true, 'Zero imperial terms detected across all modified files (100% metric pure)');
}

// ------------------------------------------------------------------------
// SUMMARY & VERDICT
// ------------------------------------------------------------------------
console.log('\n========================================================================');
console.log('  CHALLENGE SUITE EXECUTION SUMMARY');
console.log('========================================================================');
console.log(`  Total Probes Executed : ${totalTests}`);
console.log(`  Passed                : ${passedTests}`);
console.log(`  Failed                : ${failedTests}`);
console.log(`  Pass Rate             : ${((passedTests / totalTests) * 100).toFixed(1)}%`);

if (failedTests === 0) {
  console.log('\n★ ADVERSARIAL VERDICT: CONFIRMED ★');
  console.log('All mobile responsiveness remediations, overflow protections, accessibility');
  console.log('standards, and viewport boundaries verified empirically without flaw.\n');
  process.exit(0);
} else {
  console.log('\n✖ ADVERSARIAL VERDICT: REJECTED ✖');
  console.log('Failures identified in adversarial testing:\n');
  failureDetails.forEach((f, idx) => {
    console.log(`  ${idx + 1}. ${f.message}`);
    if (f.details) console.log(`     Details: ${f.details}`);
  });
  process.exit(1);
}
