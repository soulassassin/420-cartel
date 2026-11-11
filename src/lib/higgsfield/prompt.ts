import { HIGGSFIELD_VISUAL_FORMULA } from '@/lib/brand';
import { UOM_SYMBOL } from '@/lib/uom';
import type { BaseUom, ProductCategory, StrainType } from '@/types/database';

/**
 * Prompt construction for the Higgsfield media pipeline.
 *
 * Every request is the product's own subject line followed by the fixed 420
 * Cartel visual formula, so generated reels grade identically to the WebGL
 * scenes. The formula is appended last and never edited per product.
 */

/** Subject direction per catalogue category. */
const CATEGORY_SUBJECT: Record<ProductCategory, string> = {
  FLOWER:
    'a single cured cannabis flower bud suspended mid-air, frost-thick trichomes catching the light like crushed glass',
  HASH_EXTRACT:
    'a glistening slab of hash rosin being lifted on a dab tool, viscous strands stretching and catching the light',
  ELIXIR_OIL:
    'a matte black apothecary dropper bottle, a single amber oil droplet falling in slow motion from the pipette',
  DISTILLATE:
    'a glass distillate syringe in a gloved hand, golden resin pressing slowly through the barrel',
  PRE_ROLL:
    'a precision-rolled cone resting on a brushed black steel block, a thin ribbon of smoke curling upward',
  EDIBLE:
    'a single dark confection on obsidian stone, dusted edges catching a narrow shaft of light',
  VAPE: 'a machined black vaporizer standing upright, a slow vapour plume drifting across the frame',
  MERCH:
    'heavyweight black streetwear fabric in slow motion, gold embroidery grazed by a travelling highlight',
  ACCESSORY:
    'a precision machined black accessory rotating slowly on a mirrored obsidian plinth',
};

const STRAIN_MOOD: Record<StrainType, string> = {
  INDICA: 'heavy, sedate, deep-shadow mood with slow falling particulate',
  SATIVA: 'bright, electric, high-energy mood with crisp specular sparkle',
  HYBRID: 'balanced mood, equal parts deep shadow and bright specular edge',
  CBD: 'clinical, calm, surgical-clean mood with even soft falloff',
  NOT_APPLICABLE: 'restrained editorial product mood',
};

export interface PromoReelPromptInput {
  productName: string;
  category: ProductCategory;
  baseUom: BaseUom;
  strain: StrainType;
  terpeneTags: string[];
  thcPct: number | null;
  cbdPct: number | null;
  /** Shown on screen as a monospace stat card, e.g. "3.5 g". */
  featuredTier?: { baseQty: number; uom: BaseUom } | null;
}

/**
 * Builds the full prompt: subject, strain mood, terpene notes, on-screen stat
 * overlay, then the immutable 420 Cartel visual formula.
 */
export function buildPromoReelPrompt(input: PromoReelPromptInput): string {
  const segments: string[] = [];

  segments.push(
    `420 Cartel promotional product reel for "${input.productName}" — ${CATEGORY_SUBJECT[input.category]}.`,
  );

  segments.push(`Mood: ${STRAIN_MOOD[input.strain]}.`);

  if (input.terpeneTags && input.terpeneTags.length > 0) {
    const terpenes = input.terpeneTags.filter((tag) => tag.trim().length > 0).slice(0, 4);
    if (terpenes.length > 0) {
      segments.push(
        `Terpene character to suggest visually: ${terpenes.join(', ')} — render as faint coloured-free ` +
          'aromatic vapour trails that stay within the monochrome and gold palette.',
      );
    }
  }

  const stats: string[] = [];
  if (input.thcPct !== null) stats.push(`THC ${input.thcPct.toFixed(1)}%`);
  if (input.cbdPct !== null) stats.push(`CBD ${input.cbdPct.toFixed(1)}%`);
  if (input.featuredTier) {
    stats.push(`${input.featuredTier.baseQty}${UOM_SYMBOL[input.featuredTier.uom]}`);
  }
  if (stats.length > 0) {
    segments.push(
      `Leave clean negative space in the lower third for a monospace stat overlay reading: ${stats.join(' · ')}.`,
    );
  }

  segments.push(
    'Strictly no text, no fake logos, no watermarks, no distorted human hands, ' +
      'no cartoonish elements, no consumption imagery, and no underage imagery in frame.',
  );

  segments.push(HIGGSFIELD_VISUAL_FORMULA);

  return segments.join(' ');
}

/** Atmospheric loops used as section backdrops and the mobile canvas fallback. */
export type BackdropKind = 'SMOKE' | 'TRICHOME' | 'VAULT_DUST' | 'GOLD_PARTICULATE';

const BACKDROP_SUBJECT: Record<BackdropKind, string> = {
  SMOKE:
    'abstract slow-motion smoke plume unfurling through a single hard shaft of light in a pitch-black void',
  TRICHOME:
    'extreme macro drift across a field of cannabis trichome heads, glassy stalks refracting a narrow gold rim light',
  VAULT_DUST:
    'fine dust motes drifting inside a sealed black steel vault, one blade of warm light cutting across brushed metal',
  GOLD_PARTICULATE:
    'suspended metallic gold particulate turning slowly in a void, each flake catching a sharp specular highlight',
};

export function buildBackdropPrompt(kind: BackdropKind): string {
  return [
    `420 Cartel atmospheric backdrop loop — ${BACKDROP_SUBJECT[kind]}.`,
    'Seamlessly loopable, no cuts, no camera shake, extremely slow continuous motion.',
    'No subject enters or leaves frame; the composition must hold as a background behind white typography.',
    'No text, no logos, no people.',
    HIGGSFIELD_VISUAL_FORMULA,
  ].join(' ');
}

/** Default generation parameters for each job kind. */
export const REEL_PARAMS = {
  PROMO_REEL: { aspect_ratio: '9:16', duration_seconds: 6, fps: 30, motion: 'slow_orbit' },
  BACKDROP_LOOP: { aspect_ratio: '16:9', duration_seconds: 10, fps: 30, motion: 'drift' },
} as const;

export type MediaJobKind = keyof typeof REEL_PARAMS;
