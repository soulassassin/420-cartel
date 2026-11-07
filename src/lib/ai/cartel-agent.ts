import {
  ToolLoopAgent,
  gateway,
  isStepCount,
  tool,
  type InferAgentUIMessage,
} from 'ai';
import { z } from 'zod';
import {
  SEED_BATCHES,
  SEED_DELIVERY_ZONES,
  SEED_PRODUCTS,
  SEED_VARIANTS,
  DEFAULT_BRANCH_ID,
} from '@/lib/demo/fixtures';
import { formatCents } from '@/lib/money';
import { vipPriceCents } from '@/lib/pricing';
import { LEGAL_AGE, parseSaId } from '@/lib/sa-id';
import { UOM_SYMBOL, roundBaseQty } from '@/lib/uom';
import { buildPromoReelPrompt } from '@/lib/higgsfield/prompt';
import type { ProductCategory, StrainType } from '@/types/database';

/**
 * 420 CARTEL :: AI Vault Sommelier & Operations Agent
 *
 * Built with the Vercel AI SDK (`ToolLoopAgent`) and routed through the Vercel
 * AI Gateway (`gateway('anthropic/claude-sonnet-5.5')`).
 *
 * Exposes four typed tools over the Sandton Vault domain:
 *  - `searchReserveCatalogue`: query flower (g), elixirs (ml), pre-rolls & edibles (units)
 *  - `checkDeliveryRadius`: Haversine distance & zone fee from Sandton Vault
 *  - `verifySaIdEligibility`: 13-digit South African ID Luhn + 18+ age verification
 *  - `composeHiggsfieldPrompt`: 9:16 luxury obsidian-and-gold promo video prompt builder
 */

export function executeSearchReserveCatalogue(input: {
  category?: ProductCategory;
  strain?: StrainType;
  query?: string;
}) {
  const needle = input.query?.trim().toLowerCase() ?? '';

  const matches = SEED_PRODUCTS.filter((product) => {
    if (!product.is_active) return false;
    if (input.category && product.category !== input.category) return false;
    if (input.strain && product.strain !== input.strain) return false;
    if (!needle) return true;
    return (
      product.name.toLowerCase().includes(needle) ||
      (product.short_tagline ?? '').toLowerCase().includes(needle) ||
      product.terpene_tags.some((t) => t.toLowerCase().includes(needle))
    );
  });

  return {
    branch: 'Sandton Vault & Lounge (JHB)',
    count: matches.length,
    allocations: matches.map((product) => {
      const batches = SEED_BATCHES.filter(
        (b) => b.product_id === product.id && b.branch_id === DEFAULT_BRANCH_ID && b.is_active,
      );
      const availableBaseQty = roundBaseQty(
        batches.reduce((sum, b) => sum + (b.remaining_base_qty - b.reserved_base_qty), 0),
        product.base_uom,
      );
      const tiers = SEED_VARIANTS.filter(
        (v) => v.product_id === product.id && v.is_active && !v.is_custom_amount,
      ).map((v) => ({
        label: v.label,
        deducts: `${v.base_quantity}${UOM_SYMBOL[product.base_uom]}`,
        memberPrice: formatCents(v.price_cents),
        vipPrice: formatCents(vipPriceCents(v)),
      }));

      return {
        sku: product.sku,
        name: product.name,
        category: product.category,
        strain: product.strain,
        thcPct: product.thc_pct,
        cbdPct: product.cbd_pct,
        terpenes: product.terpene_tags,
        vaultAvailable: `${availableBaseQty} ${UOM_SYMBOL[product.base_uom]}`,
        leadBatch: batches[0]?.batch_code ?? 'NONE',
        tiers,
      };
    }),
  };
}

export function executeCheckDeliveryRadius(input: {
  suburb: string;
  lat: number;
  lng: number;
  orderSubtotalRand?: number;
}) {
  const sandtonHub = { lat: -26.1076, lng: 28.0567 };
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(input.lat - sandtonHub.lat);
  const dLng = toRad(input.lng - sandtonHub.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(sandtonHub.lat)) *
      Math.cos(toRad(input.lat)) *
      Math.sin(dLng / 2) ** 2;
  const distanceKm = Math.round(2 * R * Math.asin(Math.sqrt(a)) * 100) / 100;

  const zone = SEED_DELIVERY_ZONES.filter((z) => z.is_active)
    .sort((x, y) => x.priority - y.priority)
    .find((z) => z.max_radius_km !== null && distanceKm <= z.max_radius_km);

  if (!zone) {
    return {
      deliverable: false,
      suburb: input.suburb,
      distanceKm,
      message: `${input.suburb} (${distanceKm} km) is outside the 25 km Johannesburg private courier radius. Click & Collect at the Sandton Vault is available.`,
    };
  }

  const subtotalCents = Math.round((input.orderSubtotalRand ?? 0) * 100);
  const qualifiesFree =
    zone.free_over_cents !== null && subtotalCents >= zone.free_over_cents;

  return {
    deliverable: true,
    suburb: input.suburb,
    zoneName: zone.name,
    distanceKm,
    etaMinutes: zone.eta_minutes,
    courierFee: qualifiesFree ? 'COMPLIMENTARY ( R0.00 )' : formatCents(zone.fee_cents),
    minimumOrder: formatCents(zone.min_order_cents),
    freeDeliveryThreshold: zone.free_over_cents ? formatCents(zone.free_over_cents) : null,
  };
}

export function executeVerifySaIdEligibility(input: { saIdNumber: string }) {
  const parsed = parseSaId(input.saIdNumber);
  if (!parsed.valid) {
    return {
      valid: false,
      eligibleForMembership: false,
      reason: parsed.reason,
      message: parsed.message,
    };
  }
  return {
    valid: true,
    eligibleForMembership: parsed.isOfLegalAge,
    dateOfBirth: parsed.dateOfBirth,
    ageYears: parsed.age,
    legalMinimumAge: LEGAL_AGE,
    citizenship: parsed.citizenship,
    luhnChecksum: 'PASSED',
  };
}

export function executeComposeHiggsfieldPrompt(input: { productSkuOrName: string }) {
  const needle = input.productSkuOrName.trim().toLowerCase();
  const product =
    SEED_PRODUCTS.find(
      (p) =>
        p.sku.toLowerCase() === needle ||
        p.name.toLowerCase().includes(needle),
    ) ?? SEED_PRODUCTS[0];

  if (!product) {
    return { productName: 'Unknown', prompt: '', aspectRatio: '9:16' };
  }

  const prompt = buildPromoReelPrompt({
    productName: product.name,
    category: product.category,
    baseUom: product.base_uom,
    strain: product.strain,
    terpeneTags: product.terpene_tags,
    thcPct: product.thc_pct,
    cbdPct: product.cbd_pct,
  });

  return {
    productName: product.name,
    sku: product.sku,
    aspectRatio: '9:16',
    durationSeconds: 6,
    prompt,
  };
}

export const cartelSommelierAgent = new ToolLoopAgent({
  model: gateway('anthropic/claude-sonnet-5.5'),
  stopWhen: isStepCount(6),
  instructions: `You are the 420 Cartel Vault Sommelier & Private Collective Concierge in Sandton, Johannesburg, South Africa.

Your role and constraints:
- Guide verified 18+ collective members through small-batch indoor craft flower (measured in grams, g), solventless extracts, sublingual elixirs (measured in millilitres, ml), hash-hole pre-rolls, and edibles (measured in units).
- Always quote prices in South African Rand (ZAR / R) and cite live master batch codes and remaining vault balances using the searchReserveCatalogue tool.
- Use checkDeliveryRadius when asked about courier delivery to Johannesburg suburbs (e.g. Sandton -26.1052, 28.056; Rosebank -26.1467, 28.0416; Bryanston -26.0521, 28.0214; Midrand/Waterfall -26.0122, 28.1058).
- Use verifySaIdEligibility when asked to check a 13-digit South African ID number for Luhn checksum validity and 18+ age compliance.
- Use composeHiggsfieldPrompt when asked to generate a 9:16 luxury obsidian-and-gold Higgsfield AI promo video prompt for a product.
- Maintain a refined, discreet, brutalist-luxury tone ("Obsidian & 24K Gold"). Never encourage underage or public consumption.`,
  tools: {
    searchReserveCatalogue: tool({
      description:
        'Search the live 420 Cartel Sandton Vault catalogue by category, strain, or terpene/product keyword. Returns master batch balances (g, ml, units) and ZAR tier prices.',
      inputSchema: z.object({
        category: z
          .enum(['FLOWER', 'ELIXIR_OIL', 'PRE_ROLL', 'EDIBLE', 'HASH_EXTRACT'])
          .optional()
          .describe('Optional product category filter'),
        strain: z
          .enum(['INDICA', 'SATIVA', 'HYBRID', 'CBD'])
          .optional()
          .describe('Optional cannabis strain type filter'),
        query: z
          .string()
          .optional()
          .describe('Product name, terpene (e.g. Limonene, Myrcene, Caryophyllene), or SKU keyword'),
      }),
      execute: async (input) => executeSearchReserveCatalogue(input),
    }),

    checkDeliveryRadius: tool({
      description:
        'Resolve Johannesburg delivery zone, Haversine distance (km) from the Sandton Vault, ETA, and ZAR courier fee for a suburb and coordinates.',
      inputSchema: z.object({
        suburb: z.string().describe('Johannesburg suburb name, e.g. Sandton, Rosebank, Bryanston, Waterfall'),
        lat: z.number().describe('Latitude in decimal degrees (e.g. -26.1052 for Sandton)'),
        lng: z.number().describe('Longitude in decimal degrees (e.g. 28.056 for Sandton)'),
        orderSubtotalRand: z
          .number()
          .optional()
          .describe('Optional order subtotal in ZAR to check free-delivery qualification'),
      }),
      execute: async (input) => executeCheckDeliveryRadius(input),
    }),

    verifySaIdEligibility: tool({
      description:
        'Validate a 13-digit South African ID number using the Luhn mod-10 checksum and extract date of birth and 18+ legal age status.',
      inputSchema: z.object({
        saIdNumber: z.string().describe('13-digit South African ID number'),
      }),
      execute: async (input) => executeVerifySaIdEligibility(input),
    }),

    composeHiggsfieldPrompt: tool({
      description:
        'Compose a 9:16 Higgsfield AI luxury promotional video prompt for a 420 Cartel product.',
      inputSchema: z.object({
        productSkuOrName: z.string().describe('Product name or SKU, e.g. Sovereign Reserve'),
      }),
      execute: async (input) => executeComposeHiggsfieldPrompt(input),
    }),
  },
});

export type CartelAgentUIMessage = InferAgentUIMessage<typeof cartelSommelierAgent>;
