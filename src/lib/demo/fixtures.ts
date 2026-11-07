/**
 * 420 CARTEL :: seed fixtures
 *
 * One source of truth for the flagship catalogue, branches, staff and demo
 * members. `supabase/migrations/20261107000005_cartel_seed.sql` inserts exactly
 * these rows, and `lib/demo/engine.ts` loads them when Supabase is not yet
 * configured — so a local preview and a seeded project show the same data.
 *
 * Every id is a fixed UUID so the SQL seed and the local engine agree on
 * foreign keys, and re-running either is idempotent.
 */

import type {
  AffiliateCodeRow,
  BranchRow,
  DeliveryZoneRow,
  LoyaltyRulesRow,
  MasterBatchRow,
  MemberRow,
  ProductRow,
  ProductVariantRow,
  StaffProfileRow,
} from '@/types/database';

const NOW = '2026-11-01T08:00:00.000Z';

// ---------------------------------------------------------------------------
// Fixed identifiers
// ---------------------------------------------------------------------------

export const SEED_IDS = {
  branch: {
    sandton: 'b1000000-0000-4000-8000-000000000001',
    rosebank: 'b1000000-0000-4000-8000-000000000002',
  },
  staff: {
    owner: 'c1000000-0000-4000-8000-000000000001',
    budtender: 'c1000000-0000-4000-8000-000000000002',
  },
  member: {
    cartel0420: 'd1000000-0000-4000-8000-000000000001',
    cartel7777: 'd1000000-0000-4000-8000-000000000002',
    pending: 'd1000000-0000-4000-8000-000000000003',
    don: 'd1000000-0000-4000-8000-000000000004',
    suspended: 'd1000000-0000-4000-8000-000000000005',
  },
  product: {
    truffle: 'e1000000-0000-4000-8000-000000000001',
    haze: 'e1000000-0000-4000-8000-000000000002',
    rosin: 'e1000000-0000-4000-8000-000000000003',
    cbd: 'e1000000-0000-4000-8000-000000000004',
    hashHole: 'e1000000-0000-4000-8000-000000000005',
    truffles: 'e1000000-0000-4000-8000-000000000006',
  },
} as const;

/** The branch a fresh terminal or cart defaults to. */
export const DEFAULT_BRANCH_ID = SEED_IDS.branch.sandton;

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

export const SEED_BRANCHES: BranchRow[] = [
  {
    id: SEED_IDS.branch.sandton,
    name: 'Sandton Vault Lounge',
    slug: 'sandton-vault',
    address_line: '12 Maude Street',
    suburb: 'Sandton',
    city: 'Johannesburg',
    province: 'Gauteng',
    postal_code: '2196',
    latitude: -26.1076,
    longitude: 28.0567,
    phone: '+27105551420',
    is_active: true,
    timezone: 'Africa/Johannesburg',
    pickup_slot_minutes: 30,
    opens_at: '09:00',
    closes_at: '21:00',
    delivery_enabled: true,
    created_at: NOW,
    updated_at: NOW,
  },
  {
    id: SEED_IDS.branch.rosebank,
    name: 'Rosebank Dispensary',
    slug: 'rosebank-dispensary',
    address_line: '7 Baker Street',
    suburb: 'Rosebank',
    city: 'Johannesburg',
    province: 'Gauteng',
    postal_code: '2196',
    latitude: -26.1467,
    longitude: 28.0436,
    phone: '+27105551421',
    is_active: true,
    timezone: 'Africa/Johannesburg',
    pickup_slot_minutes: 30,
    opens_at: '09:00',
    closes_at: '20:00',
    delivery_enabled: true,
    created_at: NOW,
    updated_at: NOW,
  },
];

export const SEED_STAFF: StaffProfileRow[] = [
  {
    id: SEED_IDS.staff.owner,
    branch_id: SEED_IDS.branch.sandton,
    role: 'OWNER',
    display_name: 'R. Mathebula',
    pos_pin_hash: null,
    is_active: true,
    created_at: NOW,
    updated_at: NOW,
  },
  {
    id: SEED_IDS.staff.budtender,
    branch_id: SEED_IDS.branch.sandton,
    role: 'BUDTENDER',
    display_name: 'K. Naidoo',
    pos_pin_hash: null,
    is_active: true,
    created_at: NOW,
    updated_at: NOW,
  },
];

// ---------------------------------------------------------------------------
// Delivery zones — concentric rings out of each branch
// ---------------------------------------------------------------------------

function zone(
  index: number,
  branchId: string,
  name: string,
  radiusKm: number,
  feeCents: number,
  minOrderCents: number,
  freeOverCents: number | null,
  etaMinutes: number,
  priority: number,
): DeliveryZoneRow {
  return {
    id: `b2000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    branch_id: branchId,
    name,
    polygon: null,
    max_radius_km: radiusKm,
    fee_cents: feeCents,
    min_order_cents: minOrderCents,
    free_over_cents: freeOverCents,
    eta_minutes: etaMinutes,
    priority,
    is_active: true,
    created_at: NOW,
    updated_at: NOW,
  };
}

export const SEED_DELIVERY_ZONES: DeliveryZoneRow[] = [
  zone(1, SEED_IDS.branch.sandton, 'Zone 1 · Express', 10, 6_000, 30_000, 150_000, 45, 1),
  zone(2, SEED_IDS.branch.sandton, 'Zone 2 · Metro', 25, 12_000, 50_000, 250_000, 90, 2),
  zone(3, SEED_IDS.branch.sandton, 'Zone 3 · Extended', 50, 19_500, 75_000, 400_000, 150, 3),
  zone(4, SEED_IDS.branch.sandton, 'National · Armoured Courier', 800, 25_000, 120_000, null, 2880, 4),
  zone(5, SEED_IDS.branch.rosebank, 'Zone 1 · Express', 10, 6_000, 30_000, 150_000, 45, 1),
  zone(6, SEED_IDS.branch.rosebank, 'Zone 2 · Metro', 25, 12_000, 50_000, 250_000, 90, 2),
  zone(7, SEED_IDS.branch.rosebank, 'Zone 3 · Extended', 50, 19_500, 75_000, 400_000, 150, 3),
];

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

type ProductSeed = Omit<ProductRow, 'created_at' | 'updated_at'>;

export const SEED_PRODUCTS: ProductRow[] = (
  [
    {
      id: SEED_IDS.product.truffle,
      sku: 'CRT-FL-TRUFFLE',
      name: 'Black Truffle Gold',
      slug: 'black-truffle-gold',
      category: 'FLOWER',
      base_uom: 'GRAMS',
      strain: 'INDICA',
      short_tagline: 'Indoor-cured. Trichome-drenched. Allocation only.',
      description:
        'A slow-cured indoor indica grown under the collective’s own lights in six-week ' +
        'cycles. Dense, fuel-forward and heavy with caryophyllene — the batch the founders ' +
        'keep for themselves.',
      brand: '420 Cartel Reserve',
      thc_pct: 29.4,
      cbd_pct: 0.2,
      terpene_tags: ['β-Caryophyllene', 'Limonene', 'Myrcene', 'Linalool'],
      extraction_purity_pct: null,
      is_active: true,
      is_member_only: true,
      is_featured: true,
      sort_order: 1,
      hero_media_url: null,
      gallery: [],
      model_glb_url: null,
    },
    {
      id: SEED_IDS.product.haze,
      sku: 'CRT-FL-JOZIHAZE',
      name: 'Jozi Lemon Haze',
      slug: 'jozi-lemon-haze',
      category: 'FLOWER',
      base_uom: 'GRAMS',
      strain: 'SATIVA',
      short_tagline: 'Citrus-forward daylight sativa.',
      description:
        'Bright, electric and unmistakably citrus. Hand-trimmed, slow-dried over fourteen ' +
        'days and jarred at 62% relative humidity.',
      brand: '420 Cartel Reserve',
      thc_pct: 26.8,
      cbd_pct: 0.1,
      terpene_tags: ['d-Limonene', 'Terpinolene', 'Ocimene'],
      extraction_purity_pct: null,
      is_active: true,
      is_member_only: true,
      is_featured: true,
      sort_order: 2,
      hero_media_url: null,
      gallery: [],
      model_glb_url: null,
    },
    {
      id: SEED_IDS.product.rosin,
      sku: 'CRT-EL-ROSIN',
      name: 'Obsidian Rosin Dropper',
      slug: 'obsidian-rosin-dropper',
      category: 'ELIXIR_OIL',
      base_uom: 'MILLILITERS',
      strain: 'HYBRID',
      short_tagline: 'Solventless live rosin in MCT. Sublingual.',
      description:
        'Single-strain live rosin pressed from fresh-frozen flower, never touched by solvent, ' +
        'suspended in cold-pressed MCT. Dosed by the millilitre with a graduated glass pipette.',
      brand: '420 Cartel Apothecary',
      thc_pct: 41.2,
      cbd_pct: 1.4,
      terpene_tags: ['β-Myrcene', 'Pinene', 'Humulene'],
      extraction_purity_pct: 92.4,
      is_active: true,
      is_member_only: true,
      is_featured: true,
      sort_order: 3,
      hero_media_url: null,
      gallery: [],
      model_glb_url: null,
    },
    {
      id: SEED_IDS.product.cbd,
      sku: 'CRT-EL-GOLDCBD',
      name: 'Gold Standard CBD Elixir',
      slug: 'gold-standard-cbd-elixir',
      category: 'ELIXIR_OIL',
      base_uom: 'MILLILITERS',
      strain: 'CBD',
      short_tagline: 'Broad-spectrum CBD. Surgical consistency.',
      description:
        'A broad-spectrum CBD elixir standardised to 50mg/ml, third-party assayed on every ' +
        'batch. Clean, near-flavourless and built for daily sublingual dosing.',
      brand: '420 Cartel Apothecary',
      thc_pct: 0.3,
      cbd_pct: 50.0,
      terpene_tags: ['Linalool', 'Bisabolol'],
      extraction_purity_pct: 98.1,
      is_active: true,
      is_member_only: false,
      is_featured: false,
      sort_order: 4,
      hero_media_url: null,
      gallery: [],
      model_glb_url: null,
    },
    {
      id: SEED_IDS.product.hashHole,
      sku: 'CRT-PR-HASHHOLE',
      name: 'Imperial Hash Hole',
      slug: 'imperial-hash-hole',
      category: 'PRE_ROLL',
      base_uom: 'UNITS',
      strain: 'HYBRID',
      short_tagline: '2g donut-rolled, hash-cored.',
      description:
        'Two grams of Reserve flower rolled around a solid core of temple-ball hash, finished ' +
        'with an unbleached glass tip. Burns slow, burns clean, burns gold.',
      brand: '420 Cartel Atelier',
      thc_pct: 38.6,
      cbd_pct: 0.4,
      terpene_tags: ['β-Caryophyllene', 'Humulene'],
      extraction_purity_pct: null,
      is_active: true,
      is_member_only: true,
      is_featured: true,
      sort_order: 5,
      hero_media_url: null,
      gallery: [],
      model_glb_url: null,
    },
    {
      id: SEED_IDS.product.truffles,
      sku: 'CRT-ED-GOLDDUST',
      name: '24K Gold Dust Truffles',
      slug: '24k-gold-dust-truffles',
      category: 'EDIBLE',
      base_uom: 'UNITS',
      strain: 'INDICA',
      short_tagline: '10mg per truffle. Edible gold leaf.',
      description:
        '72% single-origin dark chocolate truffles dosed at a precise 10mg each and finished ' +
        'with edible 24K gold leaf. Boxed in sixes.',
      brand: '420 Cartel Confection',
      thc_pct: 10.0,
      cbd_pct: 0.0,
      terpene_tags: ['Myrcene'],
      extraction_purity_pct: null,
      is_active: true,
      is_member_only: true,
      is_featured: false,
      sort_order: 6,
      hero_media_url: null,
      gallery: [],
      model_glb_url: null,
    },
  ] satisfies ProductSeed[]
).map((product) => ({ ...product, created_at: NOW, updated_at: NOW }));

// ---------------------------------------------------------------------------
// Sellable tiers
// ---------------------------------------------------------------------------

interface VariantSpec {
  label: string;
  baseQuantity: number;
  priceCents: number;
  compareAtCents?: number | null;
  posQuickKey?: boolean;
  isCustomAmount?: boolean;
}

let variantCounter = 0;

function variantsFor(productId: string, specs: VariantSpec[]): ProductVariantRow[] {
  return specs.map((spec, index) => {
    variantCounter += 1;
    return {
      id: `f1000000-0000-4000-8000-${String(variantCounter).padStart(12, '0')}`,
      product_id: productId,
      label: spec.label,
      base_quantity: spec.baseQuantity,
      price_cents: spec.priceCents,
      compare_at_cents: spec.compareAtCents ?? null,
      // A deterministic, scannable EAN-13-shaped code per tier.
      barcode: `6${String(variantCounter).padStart(12, '0')}`,
      is_active: true,
      is_custom_amount: spec.isCustomAmount ?? false,
      pos_quick_key: spec.posQuickKey ?? !spec.isCustomAmount,
      sort_order: index + 1,
      created_at: NOW,
      updated_at: NOW,
    };
  });
}

/** Flower ladder: the per-gram rate drops as the tier climbs. */
const FLOWER_TIERS = (gramRate: number): VariantSpec[] => [
  { label: '1g', baseQuantity: 1, priceCents: gramRate },
  { label: '3.5g Eighth', baseQuantity: 3.5, priceCents: Math.round(gramRate * 3.5 * 0.93) },
  { label: '7g Quarter', baseQuantity: 7, priceCents: Math.round(gramRate * 7 * 0.88) },
  { label: '14g Half', baseQuantity: 14, priceCents: Math.round(gramRate * 14 * 0.83) },
  { label: '28g Ounce', baseQuantity: 28, priceCents: Math.round(gramRate * 28 * 0.76) },
  // The scale tier: priced per gram, weighed to 2dp at the till.
  { label: 'Custom (scale)', baseQuantity: 1, priceCents: gramRate, isCustomAmount: true },
];

const ELIXIR_TIERS = (mlRate: number): VariantSpec[] => [
  { label: '10ml Dropper', baseQuantity: 10, priceCents: Math.round(mlRate * 10) },
  { label: '30ml Elixir', baseQuantity: 30, priceCents: Math.round(mlRate * 30 * 0.87) },
  { label: '50ml Reserve', baseQuantity: 50, priceCents: Math.round(mlRate * 50 * 0.8) },
  { label: 'Custom (syringe)', baseQuantity: 1, priceCents: mlRate, isCustomAmount: true },
];

export const SEED_VARIANTS: ProductVariantRow[] = [
  ...variantsFor(SEED_IDS.product.truffle, FLOWER_TIERS(28_000)),
  ...variantsFor(SEED_IDS.product.haze, FLOWER_TIERS(22_000)),
  ...variantsFor(SEED_IDS.product.rosin, ELIXIR_TIERS(9_500)),
  ...variantsFor(SEED_IDS.product.cbd, ELIXIR_TIERS(4_200)),
  ...variantsFor(SEED_IDS.product.hashHole, [
    { label: 'Single', baseQuantity: 1, priceCents: 45_000 },
    { label: '3-Pack', baseQuantity: 3, priceCents: 120_000 },
    { label: '5-Pack', baseQuantity: 5, priceCents: 190_000 },
  ]),
  ...variantsFor(SEED_IDS.product.truffles, [
    { label: 'Single', baseQuantity: 1, priceCents: 9_000 },
    { label: 'Box of 6', baseQuantity: 6, priceCents: 48_000 },
  ]),
];

// ---------------------------------------------------------------------------
// Master batches — the balances every sale deducts from
// ---------------------------------------------------------------------------

interface BatchSpec {
  code: string;
  productId: string;
  branchId: string;
  receivedQty: number;
  remainingQty: number;
  costPerBaseUnitCents: number;
  lowStockThreshold: number;
  thc: number | null;
  cbd: number | null;
  terpenes: Record<string, number>;
  harvestDate: string | null;
  expiryDate: string | null;
}

const BATCH_SPECS: BatchSpec[] = [
  {
    code: 'BATCH-GF-01',
    productId: SEED_IDS.product.truffle,
    branchId: SEED_IDS.branch.sandton,
    receivedQty: 620,
    remainingQty: 412.5,
    costPerBaseUnitCents: 9_800,
    lowStockThreshold: 56,
    thc: 29.4,
    cbd: 0.2,
    terpenes: { 'β-Caryophyllene': 1.42, 'd-Limonene': 1.18, 'β-Myrcene': 0.89, Linalool: 0.34 },
    harvestDate: '2026-08-12',
    expiryDate: '2027-08-12',
  },
  {
    code: 'BATCH-GF-02',
    productId: SEED_IDS.product.haze,
    branchId: SEED_IDS.branch.sandton,
    receivedQty: 480,
    remainingQty: 186.25,
    costPerBaseUnitCents: 7_400,
    lowStockThreshold: 56,
    thc: 26.8,
    cbd: 0.1,
    terpenes: { 'd-Limonene': 1.61, Terpinolene: 0.94, Ocimene: 0.52 },
    harvestDate: '2026-09-02',
    expiryDate: '2027-09-02',
  },
  {
    code: 'BATCH-EL-01',
    productId: SEED_IDS.product.rosin,
    branchId: SEED_IDS.branch.sandton,
    receivedQty: 500,
    remainingQty: 360,
    costPerBaseUnitCents: 3_100,
    lowStockThreshold: 60,
    thc: 41.2,
    cbd: 1.4,
    terpenes: { 'β-Myrcene': 2.14, Pinene: 1.02, Humulene: 0.61 },
    harvestDate: null,
    expiryDate: '2027-04-18',
  },
  {
    code: 'BATCH-EL-02',
    productId: SEED_IDS.product.cbd,
    branchId: SEED_IDS.branch.sandton,
    receivedQty: 900,
    remainingQty: 742.5,
    costPerBaseUnitCents: 1_350,
    lowStockThreshold: 90,
    thc: 0.3,
    cbd: 50,
    terpenes: { Linalool: 0.42, Bisabolol: 0.28 },
    harvestDate: null,
    expiryDate: '2027-06-30',
  },
  {
    code: 'BATCH-PR-01',
    productId: SEED_IDS.product.hashHole,
    branchId: SEED_IDS.branch.sandton,
    receivedQty: 120,
    remainingQty: 48,
    costPerBaseUnitCents: 16_500,
    lowStockThreshold: 24,
    thc: 38.6,
    cbd: 0.4,
    terpenes: { 'β-Caryophyllene': 1.88, Humulene: 0.77 },
    harvestDate: null,
    expiryDate: '2027-02-01',
  },
  {
    code: 'BATCH-ED-01',
    productId: SEED_IDS.product.truffles,
    branchId: SEED_IDS.branch.sandton,
    receivedQty: 360,
    remainingQty: 294,
    costPerBaseUnitCents: 2_600,
    lowStockThreshold: 48,
    thc: 10,
    cbd: 0,
    terpenes: { Myrcene: 0.12 },
    harvestDate: null,
    expiryDate: '2027-01-15',
  },
  // A second, older flower batch so FIFO allocation is observable.
  {
    code: 'BATCH-GF-00',
    productId: SEED_IDS.product.truffle,
    branchId: SEED_IDS.branch.sandton,
    receivedQty: 240,
    remainingQty: 18.75,
    costPerBaseUnitCents: 9_200,
    lowStockThreshold: 56,
    thc: 28.1,
    cbd: 0.2,
    terpenes: { 'β-Caryophyllene': 1.31, 'd-Limonene': 1.04 },
    harvestDate: '2026-06-04',
    expiryDate: '2027-06-04',
  },
];

export const SEED_BATCHES: MasterBatchRow[] = BATCH_SPECS.map((spec, index) => ({
  id: `a2000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  product_id: spec.productId,
  branch_id: spec.branchId,
  batch_code: spec.code,
  harvest_date: spec.harvestDate,
  production_date: spec.harvestDate,
  expiry_date: spec.expiryDate,
  lab_thc_pct: spec.thc,
  lab_cbd_pct: spec.cbd,
  lab_report_url: null,
  terpene_profile: spec.terpenes,
  cost_per_base_unit_cents: spec.costPerBaseUnitCents,
  received_base_qty: spec.receivedQty,
  remaining_base_qty: spec.remainingQty,
  reserved_base_qty: 0,
  low_stock_threshold: spec.lowStockThreshold,
  is_active: true,
  // The oldest batch is received first so FIFO picks it first.
  received_at: spec.code === 'BATCH-GF-00' ? '2026-06-10T08:00:00.000Z' : NOW,
  created_by: SEED_IDS.staff.owner,
  created_at: NOW,
  updated_at: NOW,
  // Higgsfield promo columns (migration 0005): the media pipeline fills these.
  higgsfield_job_id: null,
  higgsfield_promo_video_url: null,
  higgsfield_poster_url: null,
  higgsfield_generated_at: null,
}));

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

interface MemberSpec {
  id: string;
  code: string;
  first: string;
  last: string;
  email: string;
  phone: string;
  saId: string;
  dob: string;
  status: MemberRow['status'];
  rank: MemberRow['rank'];
  lifetimeCents: number;
  orders: number;
  creditCents: number;
  points: number;
  verified: boolean;
  approved: boolean;
  gender: string | null;
  referredBy?: string | null;
  notes?: string | null;
  suspendedReason?: string | null;
}

const MEMBER_SPECS: MemberSpec[] = [
  {
    id: SEED_IDS.member.cartel0420,
    code: 'CARTEL-0420',
    first: 'Thandiwe',
    last: 'Mokoena',
    email: 'thandiwe.mokoena@example.co.za',
    phone: '0821234567',
    saId: '8907145021083',
    dob: '1989-07-14',
    status: 'VIP',
    rank: 'CAPO',
    lifetimeCents: 1_284_500,
    orders: 37,
    creditCents: 75_000,
    points: 1_284,
    verified: true,
    approved: true,
    gender: 'MALE',
    notes: 'Founding member. Allocation priority on every Reserve drop.',
  },
  {
    id: SEED_IDS.member.cartel7777,
    code: 'CARTEL-7777',
    first: 'Sipho',
    last: 'Dlamini',
    email: 'sipho.dlamini@example.co.za',
    phone: '0739876543',
    saId: '9403025544088',
    dob: '1994-03-02',
    status: 'ACTIVE_MEMBER',
    rank: 'SOLDIER',
    lifetimeCents: 412_000,
    orders: 14,
    creditCents: 12_500,
    points: 412,
    verified: true,
    approved: true,
    gender: 'MALE',
    referredBy: 'CARTEL-0420',
  },
  {
    id: SEED_IDS.member.pending,
    code: 'CARTEL-8842',
    first: 'Ayesha',
    last: 'Patel',
    email: 'ayesha.patel@example.co.za',
    phone: '0845551212',
    saId: '0111254807089',
    dob: '2001-11-25',
    status: 'PENDING_KYC',
    rank: 'INITIATE',
    lifetimeCents: 0,
    orders: 0,
    creditCents: 0,
    points: 0,
    verified: true,
    approved: false,
    gender: 'FEMALE',
    referredBy: 'CARTEL-0420',
    notes: 'ID front and selfie uploaded, awaiting reviewer.',
  },
  {
    id: SEED_IDS.member.don,
    code: 'CARTEL-0001',
    first: 'Johan',
    last: 'van Niekerk',
    email: 'johan.vn@example.co.za',
    phone: '0828889999',
    saId: '7605195163083',
    dob: '1976-05-19',
    status: 'VIP',
    rank: 'CONSIGLIERE',
    lifetimeCents: 6_420_000,
    orders: 128,
    creditCents: 250_000,
    points: 8_940,
    verified: true,
    approved: true,
    gender: 'MALE',
    notes: 'Private vault reserve allocation. Direct line to the founder.',
  },
  {
    id: SEED_IDS.member.suspended,
    code: 'CARTEL-6613',
    first: 'Chiara',
    last: 'Rossi',
    email: 'chiara.rossi@example.com',
    phone: '0617774444',
    saId: '0306284412187',
    dob: '2003-06-28',
    status: 'SUSPENDED',
    rank: 'INITIATE',
    lifetimeCents: 86_000,
    orders: 3,
    creditCents: 0,
    points: 0,
    verified: true,
    approved: true,
    gender: 'FEMALE',
    suspendedReason: 'Chargeback dispute unresolved — membership frozen pending review.',
  },
];

export const SEED_MEMBERS: MemberRow[] = MEMBER_SPECS.map((spec) => ({
  id: spec.id,
  member_code: spec.code,
  // Deterministic pass token so the seeded QR codes are stable across reloads.
  qr_token: `CARTELPASS${spec.code.replace('CARTEL-', '')}`,
  status: spec.status,
  rank: spec.rank,
  first_name: spec.first,
  last_name: spec.last,
  email: spec.email,
  phone: spec.phone,
  id_document_type: 'SA_ID',
  sa_id_number: spec.saId,
  passport_number: null,
  passport_country: null,
  date_of_birth: spec.dob,
  nationality: 'SA_CITIZEN',
  gender: spec.gender,
  age_verified_at: spec.verified ? NOW : null,
  kyc_submitted_at: NOW,
  kyc_approved_at: spec.approved ? NOW : null,
  kyc_approved_by: spec.approved ? SEED_IDS.staff.owner : null,
  agreement_signed_at: spec.approved ? NOW : null,
  agreement_version: spec.approved ? '2026.1' : null,
  agreement_signature_path: null,
  preferred_uom: 'GRAMS',
  marketing_opt_in: true,
  home_branch_id: SEED_IDS.branch.sandton,
  lifetime_value_cents: spec.lifetimeCents,
  order_count: spec.orders,
  credit_balance_cents: spec.creditCents,
  points_balance: spec.points,
  referral_code: spec.code,
  referred_by_code: spec.referredBy ?? null,
  suspended_reason: spec.suspendedReason ?? null,
  internal_notes: spec.notes ?? null,
  last_seen_at: NOW,
  created_at: NOW,
  updated_at: NOW,
}));

// ---------------------------------------------------------------------------
// Affiliate codes & loyalty rules
// ---------------------------------------------------------------------------

export const SEED_AFFILIATE_CODES: AffiliateCodeRow[] = SEED_MEMBERS.filter(
  (member) => member.status === 'VIP' || member.status === 'ACTIVE_MEMBER',
).map((member, index) => ({
  id: `b3000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  code: member.referral_code,
  owner_member_id: member.id,
  label: `${member.first_name} ${member.last_name}`,
  // Commission climbs with rank: 5% / 7.5% / 10% / 12.5%.
  commission_bps:
    member.rank === 'CONSIGLIERE'
      ? 1_250
      : member.rank === 'CAPO'
        ? 1_000
        : member.rank === 'SOLDIER'
          ? 750
          : 500,
  click_count: member.rank === 'CAPO' ? 318 : 74,
  signup_count: member.rank === 'CAPO' ? 24 : 6,
  order_count: member.rank === 'CAPO' ? 41 : 9,
  is_active: true,
  created_at: NOW,
  updated_at: NOW,
}));

export const SEED_LOYALTY_RULES: LoyaltyRulesRow = {
  id: 'b4000000-0000-4000-8000-000000000001',
  name: 'Cartel Standard',
  is_active: true,
  // 1 point per R10 spent: 1 point per 1000 cents = 0.1 points per 100 cents.
  points_per_100_cents: 0.1,
  point_value_cents: 100,
  min_redeem_points: 10,
  // Part 2 referral/rank configuration, mirroring migration 0005 defaults so
  // reward rules stay tunable without a schema change.
  default_commission_bps: 500,
  referral_window_days: 30,
  signup_bonus_points: 0,
  referrer_bonus_points: 0,
  rank_labels: {
    INITIATE: 'ASSOCIATE',
    SOLDIER: 'SOLDIER',
    CAPO: 'CAPOREGIME',
    CONSIGLIERE: 'DON',
  },
  rank_thresholds: {
    INITIATE: 0,
    SOLDIER: 500_000,
    CAPO: 1_500_000,
    CONSIGLIERE: 5_000_000,
  },
  category_multipliers: { FLOWER: 1, HASH_EXTRACT: 1.25, ELIXIR_OIL: 1.25, PRE_ROLL: 1.5 },
  created_at: NOW,
  updated_at: NOW,
};
