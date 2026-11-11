import fs from 'node:fs';
import path from 'node:path';

console.log('========================================================================');
console.log('  420 CARTEL :: MILESTONE 2 EMPIRICAL ADVERSARIAL CHALLENGE SUITE');
console.log('  Navigation Menu Redesign, Mobile Drawer & Member Route Gating');
console.log('========================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const findings = [];

function assert(condition, testName, details = '', severity = 'ERROR') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`[PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`[FAIL] ${testName}`);
    if (details) console.error(`       Details: ${details}`);
    findings.push({ testName, details, severity });
  }
}

// -----------------------------------------------------------------------------
// 1. Navigation Menu Viewport Breakpoints & Responsive Separation
// -----------------------------------------------------------------------------
console.log('>>> SECTION 1: Viewport Breakpoints & Responsive Markup Separation');

const navPath = path.resolve('src/components/layout/CartelCommandNav.tsx');
assert(fs.existsSync(navPath), 'CartelCommandNav.tsx exists at expected location');

if (fs.existsSync(navPath)) {
  const navSrc = fs.readFileSync(navPath, 'utf8');

  // Desktop viewport container
  assert(
    navSrc.includes('hidden md:flex'),
    'Desktop navigation is constrained with hidden md:flex',
    'Desktop nav links must not render on mobile viewports (<768px)'
  );

  // Mobile hamburger button
  assert(
    navSrc.includes('md:hidden') && navSrc.includes('<Menu'),
    'Mobile hamburger button is visible only on mobile viewports (md:hidden)',
    'Hamburger toggle button missing or lacks md:hidden constraint'
  );

  // Mobile drawer container
  assert(
    navSrc.includes('md:hidden') && navSrc.includes('fixed inset-0 z-50'),
    'Mobile slide-over drawer has md:hidden and fixed inset-0 z-50 viewport overlay',
    'Mobile drawer container missing proper responsive breakpoint or z-index stacking'
  );

  // ---------------------------------------------------------------------------
  // 2. State Toggling, Backdrop & Keyboard Handling
  // ---------------------------------------------------------------------------
  console.log('\n>>> SECTION 2: Drawer State Toggling, Backdrop & Keyboard Handling');

  // Initial state
  assert(
    navSrc.includes('const [isOpen, setIsOpen] = useState(false)'),
    'Drawer isOpen state is initialized to false',
    'Drawer must not default to open on page mount'
  );

  // Toggle button action
  assert(
    navSrc.includes('onClick={() => setIsOpen((prev) => !prev)}') ||
    navSrc.includes('onClick={() => setIsOpen(prev => !prev)}'),
    'Hamburger button toggles isOpen state',
    'Hamburger button click handler missing or malformed'
  );

  // Close button inside drawer
  assert(
    navSrc.includes('<X className="size-6"') && navSrc.includes('onClick={() => setIsOpen(false)}'),
    'Drawer close button (<X />) explicitly closes drawer (setIsOpen(false))',
    'Drawer lacks close button or click handler'
  );

  // Backdrop click handling
  assert(
    navSrc.includes('bg-void/80') && navSrc.includes('onClick={() => setIsOpen(false)}'),
    'Drawer backdrop overlay handles click-to-dismiss (setIsOpen(false))',
    'Backdrop missing click dismiss handler'
  );

  // Scroll lock implementation
  const hasScrollLock =
    navSrc.includes("document.body.style.overflow = 'hidden'") &&
    navSrc.includes("document.body.style.overflow = ''");
  assert(
    hasScrollLock,
    'Drawer locks body scroll when open (overflow = "hidden") and restores on close',
    'Body scroll locking effect missing or incomplete'
  );

  // Route change auto-dismiss
  assert(
    navSrc.includes('useEffect(() => {\n    setIsOpen(false);\n  }, [pathname])') ||
    navSrc.includes('setIsOpen(false);') && navSrc.includes('[pathname]'),
    'Drawer automatically closes when pathname changes',
    'Drawer must close on route navigation'
  );

  // ADVERSARIAL PROBE: Esc key handling
  const hasEscKeyHandling =
    navSrc.includes("'Escape'") ||
    navSrc.includes('"Escape"') ||
    navSrc.includes('event.key === "Escape"') ||
    navSrc.includes("event.key === 'Escape'");
  assert(
    hasEscKeyHandling,
    'Drawer listens for Escape keydown event to dismiss',
    'ACCESSIBILITY / USABILITY FLAW: CartelCommandNav does not handle Escape key to close mobile drawer when open',
    'ADVISORY'
  );

  // ---------------------------------------------------------------------------
  // 3. Strict Link Ordering & Profile/Login Option
  // ---------------------------------------------------------------------------
  console.log('\n>>> SECTION 3: Navigation Links Strict Ordering & Profile/Login Actions');

  // Verify LINKS array strictly in order: 1. Home, 2. About, 3. Membership, 4. Vault, 5. Contact
  const linksRegex = /const\s+LINKS\s*=\s*\[([\s\S]*?)\];/;
  const matchLinks = navSrc.match(linksRegex);
  assert(matchLinks !== null, 'LINKS array defined in CartelCommandNav');

  if (matchLinks) {
    const rawLinks = matchLinks[1];
    const items = [...rawLinks.matchAll(/label:\s*['"]([^'"]+)['"],\s*href:\s*['"]([^'"]+)['"]/g)].map(m => ({
      label: m[1],
      href: m[2],
    }));

    assert(items.length === 5, `LINKS array has exactly 5 items (Found: ${items.length})`);
    if (items.length === 5) {
      assert(items[0].label === 'Home' && items[0].href === '/', '1st link is Home (/)');
      assert(items[1].label === 'About' && items[1].href === '/about', '2nd link is About (/about)');
      assert(items[2].label === 'Membership' && items[2].href === '/onboarding', '3rd link is Membership (/onboarding)');
      assert(items[3].label === 'Vault' && items[3].href === '/vault', '4th link is Vault (/vault)');
      assert(items[4].label === 'Contact' && items[4].href === '/contact', '5th link is Contact (/contact)');
    }
  }

  // Profile icon & accessible label
  assert(
    navSrc.includes('<User') && navSrc.includes('aria-label="Your profile"'),
    'Profile icon renders <User /> with accessible aria-label="Your profile"',
    'User profile icon missing or lacks aria-label'
  );

  // Explicit "Log in" text link for visitors
  assert(
    navSrc.includes('!member') && navSrc.includes('Log in') && navSrc.includes('href="/login"'),
    'Unauthenticated state displays explicit "Log in" option routing to /login',
    'Unauthenticated visitors must see clear "Log in" option'
  );

  // Authenticated dossier / member code
  assert(
    navSrc.includes('member.member_code') || navSrc.includes('Dossier'),
    'Authenticated state displays member code or Dossier indicator',
    'Authenticated state missing member badge'
  );
}

// -----------------------------------------------------------------------------
// 4. Route Gating & Member Access Control Probe
// -----------------------------------------------------------------------------
console.log('\n>>> SECTION 4: Route Gating & Access Control Deep Probe');

const vaultPath = path.resolve('src/app/vault/page.tsx');
const shopPath = path.resolve('src/app/shop/page.tsx');
const middlewarePath = path.resolve('src/middleware.ts');

assert(fs.existsSync(vaultPath), 'Vault route file src/app/vault/page.tsx exists');
assert(fs.existsSync(shopPath), 'Shop route file src/app/shop/page.tsx exists');
assert(fs.existsSync(middlewarePath), 'Edge middleware src/middleware.ts exists');

if (fs.existsSync(vaultPath) && fs.existsSync(middlewarePath)) {
  const vaultSrc = fs.readFileSync(vaultPath, 'utf8');
  const mwSrc = fs.readFileSync(middlewarePath, 'utf8');
  const shopSrc = fs.readFileSync(shopPath, 'utf8');

  // Check middleware protection of /vault
  assert(
    mwSrc.includes("'/vault'") || mwSrc.includes('"/vault"'),
    'src/middleware.ts MEMBER_ROUTES includes /vault',
    'Edge middleware must include /vault in protected routes'
  );

  // Middleware redirection target
  assert(
    mwSrc.includes("target.searchParams.set('next', path)") && mwSrc.includes("target.pathname = needsStaff ? '/staff-login' : profilePage ? '/login' : '/onboarding'"),
    'Edge middleware redirects unauthenticated /vault traffic to /onboarding?next=/vault',
    'Middleware redirection logic does not target /onboarding with next param'
  );

  // Client-side redirect in Vault page
  assert(
    vaultSrc.includes("router.replace('/onboarding?next=/vault')"),
    'src/app/vault/page.tsx triggers client-side redirect to /onboarding?next=/vault',
    'Vault page missing router.replace("/onboarding?next=/vault")'
  );

  // ADVERSARIAL PROBE: Local Preview vs Production Gating Branch
  console.log('\n>>> ADVERSARIAL PROBE: Local Preview mode (!IS_LOCAL_PREVIEW) vs Production Supabase');
  const hasPreviewBypass = vaultSrc.includes('!IS_LOCAL_PREVIEW');
  assert(
    hasPreviewBypass,
    'Client-side redirect guard respects IS_LOCAL_PREVIEW condition',
    'Vault page does not check IS_LOCAL_PREVIEW'
  );

  if (hasPreviewBypass) {
    console.log('    ℹ BEHAVIORAL ANALYSIS: When NEXT_PUBLIC_SUPABASE_URL is NOT set (development/preview):');
    console.log('      - Edge middleware skips redirect to allow offline local previewing without cloud credentials.');
    console.log('      - VaultPage client-side effect (!verified && !IS_LOCAL_PREVIEW) allows unverified visitors to see the Vault preview.');
    console.log('      - Inside ShopPage, unverified visitors see the 18+ member price lock and "Simulate verified member (local preview)" helper.');
    console.log('      - In production (when Supabase credentials are set), BOTH Edge middleware and client effect immediately redirect unauthenticated visitors to /onboarding?next=/vault.');
  }

  // Backwards compatibility: shop route also guards
  assert(
    shopSrc.includes("router.replace('/onboarding?next=/vault')"),
    'src/app/shop/page.tsx also includes symmetric client-side redirect guard',
    'Shop route lacks client-side redirect guard'
  );
}

// -----------------------------------------------------------------------------
// 5. Test Summary & Empirical Findings
// -----------------------------------------------------------------------------
console.log('\n========================================================================');
console.log('  EMPIRICAL CHALLENGE SUITE SUMMARY');
console.log('========================================================================');
console.log(`Total Probes Executed : ${totalTests}`);
console.log(`Passed                : ${passedTests}`);
console.log(`Failed                : ${failedTests}`);
console.log(`Pass Rate             : ${(passedTests / totalTests * 100).toFixed(1)}%`);

if (findings.length > 0) {
  console.log('\nEmpirical Findings & Vulnerabilities:');
  findings.forEach((f, idx) => {
    console.log(`  ${idx + 1}. [${f.severity}] ${f.testName}`);
    console.log(`     ${f.details}`);
  });
}
console.log('========================================================================\n');
