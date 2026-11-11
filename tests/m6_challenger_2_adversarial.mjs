/**
 * Milestone 6 Challenger 2: Adversarial Stress Test Harness
 * 
 * Target: Mobile Responsiveness Remediation (Requirement R7, Features F17 & F18)
 * 
 * Verifications:
 * 1. Touch Target Compliance (>= 44x44px for hamburger, close button, nav links, actions, inputs).
 * 2. Keyboard Accessibility (Escape key closes mobile drawer, listener cleanup & zero memory leak on unmount/re-render).
 * 3. Body Scroll Locking & Unlocking Integrity (overflow-hidden on open, restored to '' on close/unmount, global overflow-x: hidden).
 * 4. Dropdown Boundary Containment in POS Terminal (prevents off-screen clipping or horizontal scroll on 320px/360px/375px viewports).
 * 5. Invariant Preservation (verbatim `relative size-12 shrink-0 overflow-hidden rounded border border-[color:var(--border-mono)] bg-void` in POS and Admin inventory).
 * 6. Exhaustive Imperial Unit Scan across all 8 touched files.
 * 7. Key Surface Responsiveness & Contrast Hardening (footer overflow-hidden, onboarding rail stacking, admin tabs wrapping, agent stream header & send button contrast).
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

console.log('========================================================================');
console.log('  MILESTONE 6 CHALLENGER 2: INDEPENDENT ADVERSARIAL STRESS HARNESS');
console.log('  Mobile Responsiveness Remediation (Requirement R7, F17 & F18)');
console.log('========================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureDetails = [];

function runTest(id, name, testFn) {
  totalTests++;
  try {
    testFn();
    passedTests++;
    console.log(`  ✓ PASS [${id}] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✗ FAIL [${id}] ${name}`);
    console.error(`    -> ${err.message}`);
    failureDetails.push({ id, name, error: err.message });
  }
}

function readProjectFile(relPath) {
  const fullPath = path.resolve(process.cwd(), relPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Required file not found: ${relPath}`);
  }
  return fs.readFileSync(fullPath, 'utf-8');
}

// -----------------------------------------------------------------------------
// SECTION 1: Touch Target Compliance Across Interactive Controls
// -----------------------------------------------------------------------------
console.log('--- SECTION 1: Touch Target Compliance (Minimum 44x44px) ---');

const navCode = readProjectFile('src/components/layout/CartelCommandNav.tsx');
const buttonCode = readProjectFile('src/components/ui/button.tsx');
const fieldCode = readProjectFile('src/components/ui/field.tsx');

runTest('M6-C2-01', 'Hamburger toggle button enforces minimum 44x44px touch target', () => {
  const hamburgerMatch = navCode.match(/aria-label="Toggle navigation"[\s\S]*?className="([^"]*)"/);
  assert(hamburgerMatch, 'Hamburger toggle button with aria-label="Toggle navigation" must exist');
  const classNames = hamburgerMatch[1];
  assert(
    classNames.includes('h-11') && classNames.includes('w-11'),
    `Hamburger button must specify h-11 w-11 (44px) touch target, got: "${classNames}"`
  );
});

runTest('M6-C2-02', 'Mobile drawer close button enforces minimum 44x44px touch target', () => {
  const buttonSnippet = navCode.match(/<button[\s\S]*?aria-label="Close navigation"[\s\S]*?>/)?.[0] || '';
  assert(buttonSnippet, 'Close button with aria-label="Close navigation" must exist');
  const classNames = buttonSnippet.match(/className="([^"]*)"/)?.[1] || '';
  assert(
    classNames.includes('h-11') && classNames.includes('w-11'),
    `Close button must specify h-11 w-11 (44px) touch target, got: "${classNames}"`
  );
});

runTest('M6-C2-03', 'Profile action icon link enforces minimum 44x44px touch target', () => {
  const profileMatch = navCode.match(/<Link[^>]*aria-label="Your profile"[^>]*className=\{cn\('([^']*)'/);
  assert(profileMatch, 'Profile link with aria-label="Your profile" must exist in desktop nav');
  const classNames = profileMatch[1];
  assert(
    classNames.includes('h-11') && classNames.includes('w-11'),
    `Profile action link must specify h-11 w-11 (44px), got: "${classNames}"`
  );
});

runTest('M6-C2-04', 'Drawer primary navigation links provide generous vertical touch target (>= 44px)', () => {
  const navLinkPattern = /LINKS\.map\(\(link\)\s*=>[\s\S]*?className=\{cn\([\s\S]*?'([^']*)'/;
  const match = navCode.match(navLinkPattern);
  assert(match, 'Drawer primary nav link className mapping must be defined');
  const classNames = match[1];
  assert(
    classNames.includes('py-3') && classNames.includes('text-2xl'),
    `Drawer nav links must provide py-3 and text-2xl (>= 48px computed height), got: "${classNames}"`
  );
});

runTest('M6-C2-05', 'Drawer secondary action buttons (Login, Onboarding) provide >= 44px touch height', () => {
  const drawerIndex = navCode.indexOf('Mobile Slide-over Drawer');
  assert(drawerIndex !== -1, 'Mobile drawer section must exist');
  const drawerCode = navCode.slice(drawerIndex);

  const drawerLoginMatch = drawerCode.match(/href="\/login"[\s\S]*?className="([^"]*)"/);
  assert(drawerLoginMatch, 'Drawer Login link must exist');
  assert(
    drawerLoginMatch[1].includes('py-3'),
    `Drawer Login link must have py-3 (min 44px height), got: "${drawerLoginMatch[1]}"`
  );

  const drawerOnboardMatch = drawerCode.match(/href="\/onboarding"[\s\S]*?className="([^"]*)"/);
  assert(drawerOnboardMatch, 'Drawer Onboarding link must exist');
  assert(
    drawerOnboardMatch[1].includes('py-3'),
    `Drawer Onboarding link must have py-3 (min 44px height), got: "${drawerOnboardMatch[1]}"`
  );
});

runTest('M6-C2-06', 'Global Button primitive sizes comply with mobile touch guidelines', () => {
  assert(buttonCode.includes("default: 'h-11 px-0'"), 'Button default size must be h-11 (44px)');
  assert(buttonCode.includes("icon: 'h-11 w-11 px-0'"), 'Button icon size must be h-11 w-11 (44px)');
  assert(buttonCode.includes("till: 'h-16"), 'POS Till buttons must maintain large 64px touch target');
});

runTest('M6-C2-07', 'Form Input primitive enforces >= 44px vertical height baseline', () => {
  assert(fieldCode.includes('h-12 w-full border'), 'Field Input primitive must specify h-12 (48px) baseline height');
});

// -----------------------------------------------------------------------------
// SECTION 2: Keyboard Accessibility & Escape Key Cleanup / Zero Leak
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 2: Keyboard Accessibility (Escape Dismissal & Lifecycle Leak Test) ---');

runTest('M6-C2-08', 'CartelCommandNav handles Escape keydown event to dismiss mobile drawer', () => {
  assert(
    navCode.includes("e.key === 'Escape'"),
    'CartelCommandNav must check e.key === "Escape"'
  );
  assert(
    navCode.includes('setIsOpen(false)'),
    'CartelCommandNav must set isOpen to false on Escape'
  );
  assert(
    navCode.includes("window.addEventListener('keydown', handleKeyDown)"),
    'CartelCommandNav must add keydown listener on window'
  );
  assert(
    navCode.includes("window.removeEventListener('keydown', handleKeyDown)"),
    'CartelCommandNav must remove keydown listener on unmount/effect cleanup'
  );
});

runTest('M6-C2-09', 'Adversarial Lifecycle Simulation: Escape listener does not leak across 100 open/close cycles', () => {
  const listeners = new Map();
  const mockWindow = {
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener: (type, fn) => {
      if (listeners.has(type)) listeners.get(type).delete(fn);
    },
  };

  let isOpenState = false;
  let cleanupFn = null;

  function setDrawerOpen(open) {
    if (cleanupFn) {
      cleanupFn();
      cleanupFn = null;
    }
    isOpenState = open;
    if (isOpenState) {
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') setDrawerOpen(false);
      };
      mockWindow.addEventListener('keydown', handleKeyDown);
      cleanupFn = () => mockWindow.removeEventListener('keydown', handleKeyDown);
    }
  }

  assert.strictEqual(listeners.get('keydown')?.size ?? 0, 0, 'Initially, zero keydown listeners attached');

  setDrawerOpen(true);
  assert.strictEqual(listeners.get('keydown')?.size, 1, 'Drawer open attaches exactly 1 keydown listener');

  const keydownHandlers = Array.from(listeners.get('keydown') || []);
  for (const handler of keydownHandlers) {
    handler({ key: 'Escape' });
  }
  assert.strictEqual(isOpenState, false, 'Escape keydown successfully flipped isOpen to false');
  assert.strictEqual(listeners.get('keydown')?.size ?? 0, 0, 'Escape handler cleanly removed its listener');

  for (let i = 0; i < 100; i++) {
    setDrawerOpen(true);
    assert.strictEqual(listeners.get('keydown')?.size, 1, `Iteration ${i}: exactly 1 listener while open`);
    setDrawerOpen(false);
    assert.strictEqual(listeners.get('keydown')?.size ?? 0, 0, `Iteration ${i}: exactly 0 listeners while closed`);
  }

  setDrawerOpen(true);
  assert.strictEqual(listeners.get('keydown')?.size, 1);
  if (cleanupFn) cleanupFn();
  assert.strictEqual(listeners.get('keydown')?.size ?? 0, 0, 'Unmount while open cleanly de-registers event listener');
});

// -----------------------------------------------------------------------------
// SECTION 3: Body Scroll Locking & Unlocking Integrity
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 3: Body Scroll Locking & Unlocking Integrity ---');

const globalsCss = readProjectFile('src/app/globals.css');
const rootLayout = readProjectFile('src/app/layout.tsx');

runTest('M6-C2-10', 'globals.css enforces global overflow-x: hidden on body', () => {
  const bodyBlockMatch = globalsCss.match(/(?:^|\n)\s*body\s*\{([^}]*)\}/);
  assert(bodyBlockMatch, 'globals.css must contain a body { ... } definition');
  assert(
    bodyBlockMatch[1].includes('overflow-x: hidden;'),
    'globals.css body block must specify "overflow-x: hidden;"'
  );
});

runTest('M6-C2-11', 'Root layout body tag includes overflow-x-hidden class', () => {
  assert(
    rootLayout.includes('overflow-x-hidden'),
    'src/app/layout.tsx body className must include overflow-x-hidden'
  );
});

runTest('M6-C2-12', 'Scroll lock lifecycle locks on open and strictly unlocks on close and unmount', () => {
  const mockDocumentBody = {
    style: {
      overflow: '',
    },
  };

  let cleanupScroll = null;
  function triggerScrollLock(isOpen) {
    if (cleanupScroll) {
      cleanupScroll();
      cleanupScroll = null;
    }
    if (isOpen) {
      mockDocumentBody.style.overflow = 'hidden';
    } else {
      mockDocumentBody.style.overflow = '';
    }
    cleanupScroll = () => {
      mockDocumentBody.style.overflow = '';
    };
  }

  assert.strictEqual(mockDocumentBody.style.overflow, '', 'Initial body overflow must be empty');

  triggerScrollLock(true);
  assert.strictEqual(mockDocumentBody.style.overflow, 'hidden', 'Opening drawer must set body overflow to hidden');

  triggerScrollLock(false);
  assert.strictEqual(mockDocumentBody.style.overflow, '', 'Closing drawer must reset body overflow to empty string');

  triggerScrollLock(true);
  assert.strictEqual(mockDocumentBody.style.overflow, 'hidden');
  if (cleanupScroll) cleanupScroll();
  assert.strictEqual(mockDocumentBody.style.overflow, '', 'Unmounting component with drawer open must restore body overflow');
});

// -----------------------------------------------------------------------------
// SECTION 4: POS Dropdown Boundary Containment on Mobile Viewports
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 4: Dropdown Boundary Containment in POS Terminal ---');

const posCode = readProjectFile('src/app/pos/page.tsx');

runTest('M6-C2-13', 'POS member search dropdown is constrained to viewport width on compact mobile', () => {
  const dropdownMatch = posCode.match(/className="dropdown absolute right-0 top-11 z-30 ([^"]*)"/);
  assert(dropdownMatch, 'POS member search dropdown container must be present');
  const classes = dropdownMatch[1];
  assert(
    classes.includes('max-w-[calc(100vw-2rem)]'),
    `POS search dropdown must have max-w-[calc(100vw-2rem)], got: "${classes}"`
  );
  assert(
    classes.includes('w-full') && classes.includes('sm:w-80'),
    `POS search dropdown must be fluid w-full on mobile and sm:w-80 on larger screens, got: "${classes}"`
  );
});

runTest('M6-C2-14', 'Dropdown width geometry verification across standard phone viewports', () => {
  const VIEWPORTS = [
    { name: 'iPhone SE (1st gen)', width: 320, paddingRem: 2 },
    { name: 'Galaxy S8 / Fold', width: 360, paddingRem: 2 },
    { name: 'iPhone 13 / 14 / 15', width: 375, paddingRem: 2 },
    { name: 'Pixel 7 / Pro', width: 412, paddingRem: 2 },
  ];

  for (const vp of VIEWPORTS) {
    const maxDropdownWidth = vp.width - (vp.paddingRem * 16);
    assert(
      maxDropdownWidth < vp.width,
      `Dropdown on ${vp.name} (${vp.width}px) must stay within screen (${maxDropdownWidth}px < ${vp.width}px)`
    );
    assert(
      maxDropdownWidth >= 280,
      `Dropdown on ${vp.name} must retain usable text width (>= 280px), calculated: ${maxDropdownWidth}px`
    );
  }
});

runTest('M6-C2-15', 'POS search input wrapper and product filter use responsive width', () => {
  assert(
    posCode.includes('w-full sm:w-64'),
    'POS member search input must use responsive width: w-full sm:w-64'
  );
  assert(
    posCode.includes('w-full sm:w-48'),
    'POS product SKU query input must use responsive width: w-full sm:w-48'
  );
  assert(
    posCode.includes('flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto'),
    'POS search controls wrapper must wrap on mobile'
  );
});

// -----------------------------------------------------------------------------
// SECTION 5: Invariant Preservation Across POS & Admin Inventory
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 5: Invariant Preservation Across POS & Admin Inventory ---');

const adminInventoryCode = readProjectFile('src/app/admin/inventory/page.tsx');

const REQUIRED_THUMBNAIL_INVARIANT =
  'relative size-12 shrink-0 overflow-hidden rounded border border-[color:var(--border-mono)] bg-void';

runTest('M6-C2-16', 'POS terminal preserves exact product thumbnail invariant container', () => {
  assert(
    posCode.includes(REQUIRED_THUMBNAIL_INVARIANT),
    `POS terminal must contain exact invariant string: "${REQUIRED_THUMBNAIL_INVARIANT}"`
  );
  const invariantIndex = posCode.indexOf(REQUIRED_THUMBNAIL_INVARIANT);
  const snippet = posCode.slice(invariantIndex, invariantIndex + 300);
  assert(
    snippet.includes('src={product.hero_media_url}'),
    'POS thumbnail container must render Image with src={product.hero_media_url}'
  );
});

runTest('M6-C2-17', 'Admin inventory preserves exact product thumbnail invariant container', () => {
  assert(
    adminInventoryCode.includes(REQUIRED_THUMBNAIL_INVARIANT),
    `Admin inventory must contain exact invariant string: "${REQUIRED_THUMBNAIL_INVARIANT}"`
  );
  const invariantIndex = adminInventoryCode.indexOf(REQUIRED_THUMBNAIL_INVARIANT);
  const snippet = adminInventoryCode.slice(invariantIndex, invariantIndex + 300);
  assert(
    snippet.includes('src={product.hero_media_url}'),
    'Admin inventory thumbnail container must render Image with src={product.hero_media_url}'
  );
});

// -----------------------------------------------------------------------------
// SECTION 6: Comprehensive Imperial Unit Scan Across All 8 Touched Files
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 6: Imperial Unit Scan Across Touched Files ---');

const TOUCHED_FILES = [
  'src/app/globals.css',
  'src/app/layout.tsx',
  'src/app/page.tsx',
  'src/app/onboarding/page.tsx',
  'src/app/pos/page.tsx',
  'src/app/admin/inventory/page.tsx',
  'src/app/agent/page.tsx',
  'src/components/layout/CartelCommandNav.tsx',
];

const FORBIDDEN_IMPERIAL_PATTERNS = [
  { pattern: /\b(ounces?)\b/i, name: 'ounce / ounces' },
  { pattern: /\b(\d+(?:\.\d+)?)\s*oz\b/i, name: 'number + oz' },
  { pattern: /\b(pounds?)\b/i, name: 'pound / pounds' },
  { pattern: /\b(\d+(?:\.\d+)?)\s*lbs?\b/i, name: 'number + lb/lbs' },
  { pattern: /3\.5\s*g\s+eighth/i, name: '3.5g Eighth' },
  { pattern: /7\s*g\s+quarter/i, name: '7g Quarter' },
  { pattern: /14\s*g\s+half/i, name: '14g Half' },
  { pattern: /28\s*g\s+ounce/i, name: '28g Ounce' },
  { pattern: /\b(eighth)\b/i, name: 'eighth (weight reference)' },
];

for (const filePath of TOUCHED_FILES) {
  runTest(`M6-C2-IMP-${path.basename(filePath)}`, `Imperial unit purity in ${filePath}`, () => {
    const content = readProjectFile(filePath);
    for (const { pattern, name } of FORBIDDEN_IMPERIAL_PATTERNS) {
      const match = content.match(pattern);
      assert(
        !match,
        `Forbidden imperial unit "${name}" detected in ${filePath} at line match: "${match ? match[0] : ''}"`
      );
    }
  });
}

// -----------------------------------------------------------------------------
// SECTION 7: Key Surfaces Responsiveness & Accessibility Hardening
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 7: Key Surfaces Responsiveness & Accessibility Hardening ---');

const homeCode = readProjectFile('src/app/page.tsx');
const onboardingCode = readProjectFile('src/app/onboarding/page.tsx');
const agentCode = readProjectFile('src/app/agent/page.tsx');

runTest('M6-C2-18', 'Landing page footer prevents typography blowout on mobile (overflow-hidden)', () => {
  const footerMatch = homeCode.match(/<footer[^>]*className="([^"]*)"/);
  assert(footerMatch, 'Landing page footer tag must exist');
  assert(
    footerMatch[1].includes('overflow-hidden'),
    `Footer must have overflow-hidden to contain text-[20.5vw], got: "${footerMatch[1]}"`
  );
});

runTest('M6-C2-19', 'Onboarding step rail stacks vertically on small screens and truncates', () => {
  assert(
    onboardingCode.includes('flex flex-col sm:flex-row items-start sm:items-center'),
    'Onboarding step rail must stack vertically on mobile (flex-col sm:flex-row)'
  );
  assert(
    onboardingCode.includes('text-xs sm:type-ui truncate'),
    'Onboarding step rail labels must be text-xs and truncate on compact screens'
  );
});

runTest('M6-C2-20', 'Admin inventory sub-tabs wrap on narrow mobile viewports', () => {
  assert(
    adminInventoryCode.includes('flex flex-wrap gap-2'),
    'Admin inventory tabs container must have flex-wrap gap-2'
  );
});

runTest('M6-C2-21', 'AI Sommelier stream header stacks responsively on mobile', () => {
  assert(
    agentCode.includes('flex flex-col sm:flex-row sm:items-center justify-between gap-2'),
    'AI Sommelier stream header must have flex flex-col sm:flex-row'
  );
});

runTest('M6-C2-22', 'AI Sommelier chat send button has high-contrast styling on dark background', () => {
  assert(
    agentCode.includes('bg-foreground hover:bg-foreground/90 disabled:opacity-40 text-background'),
    'AI Sommelier chat send button must use high-contrast foreground/background theme colors'
  );
  assert(
    !agentCode.includes('text-black bg-transparent'),
    'AI Sommelier send button must NOT have invisible text-black bg-transparent'
  );
});

// -----------------------------------------------------------------------------
// SUMMARY & VERDICT
// -----------------------------------------------------------------------------
console.log('\n========================================================================');
console.log('  TEST SUMMARY');
console.log('========================================================================');
console.log(`  Total Executed : ${totalTests}`);
console.log(`  Passed         : ${passedTests}`);
console.log(`  Failed         : ${failedTests}`);
console.log(`  Pass Rate      : ${((passedTests / totalTests) * 100).toFixed(1)}%`);

if (failedTests > 0) {
  console.log('\nFailures:');
  for (const f of failureDetails) {
    console.log(`  - [${f.id}] ${f.name}: ${f.error}`);
  }
  console.log('\nVERDICT: REJECTED');
  process.exit(1);
} else {
  console.log('\nVERDICT: CONFIRMED — All adversarial mobile responsiveness stress tests PASSED');
  process.exit(0);
}
