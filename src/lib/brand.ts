/**
 * 420 CARTEL :: brand constants shared by CSS, Three.js and Higgsfield prompts.
 * CSS consumes these through globals.css custom properties; WebGL materials and
 * lights consume the hex values directly, so both stay in lockstep here.
 */

/**
 * These feed the WebGL scene and the Higgsfield prompt formula, so they track
 * the EDITORIAL shell's values — that is the only shell with 3D in it.
 *
 * `void` is true black now rather than #050505: the reference canvas is
 * #000000, and a scene fogged to a near-black that does not match the page
 * behind it leaves a visible rectangle where the canvas ends.
 */
export const CARTEL_COLORS = {
  void: '#000000',
  surface: '#000000',
  elevated: '#0A0A0A',
  textPrimary: '#FFFFFF',
  /** Ash grey: metadata and anything that must recede behind the headline. */
  textMuted: '#8E8E8E',
  gold: '#C5A059',
  goldBright: '#FCF6D8',
  goldDeep: '#726048',
} as const;

export type CartelColor = keyof typeof CARTEL_COLORS;

/** Scroll choreography stage boundaries (fractions of total page scroll). */
export const SCROLL_STAGES = {
  vault: { start: 0, end: 0.3 },
  anatomy: { start: 0.3, end: 0.7 },
  collective: { start: 0.7, end: 1 },
} as const;

export type ScrollStage = keyof typeof SCROLL_STAGES;

/** Camera rail keyframes, in world units, for the three scroll stages. */
export const CAMERA_RAIL = [
  { at: 0.0, position: [0, 0.15, 7.4], target: [0, 0, 0], fov: 38 },
  { at: 0.3, position: [0, 0.05, 2.1], target: [0, 0, -1], fov: 44 },
  { at: 0.5, position: [1.5, 0.35, 2.6], target: [0, 0, -1.2], fov: 40 },
  { at: 0.7, position: [0, 0.1, 4.2], target: [0, -0.1, -1], fov: 36 },
  { at: 1.0, position: [0, -0.4, 6.0], target: [0, -0.6, -1], fov: 34 },
] as const;

/** Device-pixel-ratio ceiling, kept low enough for 10-13" tablets. */
export const DPR_RANGE: [number, number] = [1, 1.5];

/**
 * The 420 Cartel visual prompt formula. Every Higgsfield request appends this
 * so generated media is indistinguishable in grade from the WebGL scenes.
 */
export const HIGGSFIELD_VISUAL_FORMULA =
  'Ultra-cinematic macro commercial shot, deep obsidian black void background (#000000), ' +
  'dramatic rim lighting with warm 24k metallic gold (#D4AF37) dust particulate and sharp specular highlights, ' +
  'high-contrast monochrome grading with selective warm amber and 24k gold accents, ' +
  'slow-motion 120fps camera orbit, luxury streetwear private social club aesthetic, ' +
  'extreme botanical macro detail, shot on ARRI Alexa 65 Macro lens.';

export const MEMBERSHIP_AGREEMENT_VERSION = '2026.1';

export const CARTEL_COPY = {
  gateCta: 'Join the Cartel',
  gateSubtitle: 'Private Member Onboarding',
  ageGateTitle: 'Adults Only. 18+',
} as const;
