import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

console.log('====================================================');
console.log('420 CARTEL - MILESTONE 1 EMPIRICAL CHALLENGE SUITE');
console.log('====================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`[PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`[FAIL] ${testName}`);
    if (details) console.error(`       Details: ${details}`);
  }
}

// -----------------------------------------------------------------------------
// 1. Brand Logo Binary & Metadata Checks
// -----------------------------------------------------------------------------
console.log('>>> SECTION 1: Brand Logo File Integrity (public/fourtwentycartel_logo.jpg)');
const logoPath = path.resolve('public/fourtwentycartel_logo.jpg');
const logoExists = fs.existsSync(logoPath);
assert(logoExists, 'Logo file exists at public/fourtwentycartel_logo.jpg');

if (logoExists) {
  const stat = fs.statSync(logoPath);
  assert(stat.size > 0, `Logo file has non-zero size (${stat.size} bytes)`, `Size is ${stat.size}`);
  assert(stat.size === 80700, `Logo file size matches source (80700 bytes)`, `Found size: ${stat.size}`);

  const buffer = fs.readFileSync(logoPath);
  const isJpegHeader = buffer[0] === 0xff && buffer[1] === 0xd8;
  const isJpegFooter = buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
  assert(isJpegHeader, 'Valid JPEG SOI marker (0xFF, 0xD8)', `Got: 0x${buffer[0]?.toString(16)} 0x${buffer[1]?.toString(16)}`);
  assert(isJpegFooter, 'Valid JPEG EOI marker (0xFF, 0xD9)', `Got: 0x${buffer[buffer.length - 2]?.toString(16)} 0x${buffer[buffer.length - 1]?.toString(16)}`);

  // Parse SOF0 / SOF2 for dimensions
  let width = 0;
  let height = 0;
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    if (marker === 0xc0 || marker === 0xc2) {
      height = buffer.readUInt16BE(offset + 5);
      width = buffer.readUInt16BE(offset + 7);
      break;
    }
    const len = buffer.readUInt16BE(offset + 2);
    offset += 2 + len;
  }
  assert(width === 1080 && height === 1080, `Logo dimensions match 1080x1080 (Found: ${width}x${height})`);
}

// -----------------------------------------------------------------------------
// 2. Source Code Integration Checks
// -----------------------------------------------------------------------------
console.log('\n>>> SECTION 2: Source Code Brand & Logo Touchpoint Integration');

// 2.1 CartelCommandNav.tsx
const navPath = 'src/components/layout/CartelCommandNav.tsx';
if (fs.existsSync(navPath)) {
  const c = fs.readFileSync(navPath, 'utf8');
  assert(c.includes("import Image from 'next/image'"), 'CartelCommandNav imports Image from next/image');
  assert(c.includes('src="/fourtwentycartel_logo.jpg"'), 'CartelCommandNav uses /fourtwentycartel_logo.jpg in Image src');
  assert(c.includes('alt="420 Cartel"'), 'CartelCommandNav Image has valid alt text');
  assert(c.includes('fill'), 'CartelCommandNav Image uses fill layout mode');
  assert(c.includes('rounded-full'), 'CartelCommandNav wraps logo in rounded-full container');
} else {
  assert(false, `File exists: ${navPath}`);
}

// 2.2 CartelMemberQrPass.tsx
const passPath = 'src/components/crm/CartelMemberQrPass.tsx';
if (fs.existsSync(passPath)) {
  const c = fs.readFileSync(passPath, 'utf8');
  assert(c.includes("import Image from 'next/image'"), 'CartelMemberQrPass imports Image from next/image');
  assert(c.includes('src="/fourtwentycartel_logo.jpg"'), 'CartelMemberQrPass uses /fourtwentycartel_logo.jpg in Image src');
  assert(c.includes('width={32}') && c.includes('height={32}'), 'CartelMemberQrPass embeds 32x32 logo avatar');
} else {
  assert(false, `File exists: ${passPath}`);
}

// 2.3 POS Terminal
const posPath = 'src/app/pos/page.tsx';
if (fs.existsSync(posPath)) {
  const c = fs.readFileSync(posPath, 'utf8');
  assert(c.includes("import Image from 'next/image'"), 'pos/page.tsx imports Image from next/image');
  assert(c.includes('src="/fourtwentycartel_logo.jpg"'), 'pos/page.tsx uses /fourtwentycartel_logo.jpg in Image src');
  assert(c.includes('width={40}') && c.includes('height={40}'), 'pos/page.tsx renders 40x40 logo header thumbnail');
} else {
  assert(false, `File exists: ${posPath}`);
}

// 2.4 Admin Operations
const adminPath = 'src/app/admin/page.tsx';
if (fs.existsSync(adminPath)) {
  const c = fs.readFileSync(adminPath, 'utf8');
  assert(c.includes("import Image from 'next/image'"), 'admin/page.tsx imports Image from next/image');
  assert(c.includes('src="/fourtwentycartel_logo.jpg"'), 'admin/page.tsx uses /fourtwentycartel_logo.jpg in Image src');
  assert(c.includes('width={48}') && c.includes('height={48}'), 'admin/page.tsx renders 48x48 logo banner');
} else {
  assert(false, `File exists: ${adminPath}`);
}

// 2.5 Landing Page Footer
const landingPath = 'src/app/page.tsx';
if (fs.existsSync(landingPath)) {
  const c = fs.readFileSync(landingPath, 'utf8');
  assert(c.includes("import Image from 'next/image'"), 'app/page.tsx imports Image from next/image');
  assert(c.includes('src="/fourtwentycartel_logo.jpg"'), 'app/page.tsx uses /fourtwentycartel_logo.jpg in Image src');
  assert(c.includes('width={64}') && c.includes('height={64}'), 'app/page.tsx renders 64x64 crest in footer');
} else {
  assert(false, `File exists: ${landingPath}`);
}

// 2.6 Root Layout Metadata
const layoutPath = 'src/app/layout.tsx';
if (fs.existsSync(layoutPath)) {
  const c = fs.readFileSync(layoutPath, 'utf8');
  assert(c.includes("icon: '/fourtwentycartel_logo.jpg'"), 'layout.tsx configures favicon icon');
  assert(c.includes("apple: '/fourtwentycartel_logo.jpg'"), 'layout.tsx configures apple-touch-icon');
  assert(c.includes("url: '/fourtwentycartel_logo.jpg'"), 'layout.tsx configures openGraph image url');
  assert(c.includes('width: 1080') && c.includes('height: 1080'), 'layout.tsx specifies 1080x1080 openGraph dimensions');
} else {
  assert(false, `File exists: ${layoutPath}`);
}

// 2.7 Environment Example
const envPath = '.env.example';
if (fs.existsSync(envPath)) {
  const c = fs.readFileSync(envPath, 'utf8');
  assert(c.includes('HIGGSFIELD_MCP_URL=https://mcp.higgsfield.ai/mcp'), '.env.example documents HIGGSFIELD_MCP_URL endpoint');
} else {
  assert(false, `File exists: ${envPath}`);
}

// 2.8 Brand Constants
const brandPath = 'src/lib/brand.ts';
if (fs.existsSync(brandPath)) {
  const c = fs.readFileSync(brandPath, 'utf8');
  assert(c.includes('export const HIGGSFIELD_VISUAL_FORMULA'), 'brand.ts exports HIGGSFIELD_VISUAL_FORMULA');
  assert(c.includes('#D4AF37'), 'HIGGSFIELD_VISUAL_FORMULA incorporates 24k metallic gold (#D4AF37)');
  assert(c.includes('#000000'), 'HIGGSFIELD_VISUAL_FORMULA incorporates deep obsidian black (#000000)');
  assert(c.includes('ARRI Alexa 65 Macro lens'), 'HIGGSFIELD_VISUAL_FORMULA specifies ARRI Alexa 65 Macro lens');
} else {
  assert(false, `File exists: ${brandPath}`);
}

// 2.9 Higgsfield Prompt Construction
const promptPath = 'src/lib/higgsfield/prompt.ts';
if (fs.existsSync(promptPath)) {
  const c = fs.readFileSync(promptPath, 'utf8');
  assert(c.includes('HIGGSFIELD_VISUAL_FORMULA'), 'prompt.ts references HIGGSFIELD_VISUAL_FORMULA');
  assert(c.includes('Strictly no text, no fake logos, no watermarks'), 'prompt.ts implements strict negative prompt constraints');
} else {
  assert(false, `File exists: ${promptPath}`);
}

// -----------------------------------------------------------------------------
// 3. Static Type Checking
// -----------------------------------------------------------------------------
console.log('\n>>> SECTION 3: Static Compilation / Typecheck');
try {
  console.log('Running `npm run typecheck` (tsc --noEmit)...');
  const typecheckOutput = execSync('npm run typecheck', { encoding: 'utf8', stdio: 'pipe' });
  assert(true, 'npm run typecheck exited with code 0 and zero errors');
  console.log(typecheckOutput.trim());
} catch (err) {
  assert(false, 'npm run typecheck succeeded', err.stdout || err.message);
}

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n====================================================');
console.log(`TOTAL PROBES: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
console.log('====================================================');

if (failedTests > 0) {
  console.error('\nOVERALL VERDICT: FAILED');
  process.exit(1);
} else {
  console.log('\nOVERALL VERDICT: CONFIRMED');
  process.exit(0);
}
