---
name: 3d-luxury-webgl
description: Build high-FPS, scroll-driven 3D WebGL experiences using React Three Fiber, Three.js, GSAP ScrollTrigger, and Lenis in a monochrome and gold aesthetic.
---
# 3D Luxury WebGL & Scroll Choreography Skill

## Aesthetic Rules (420 Cartel Brand)
- **Palette:** Strict monochrome base (`#050505` matte black, `#0F0F0F` obsidian surface, `#FFFFFF` stark white typography) with metallic gold accents (`#D4AF37` primary gold, `#AA771C` deep gold shadow, `#F3E5AB` specular highlight).
- **Lighting:** Use dramatic chiaroscuro studio lighting—high-contrast rim lights and warm gold point lights (`#D4AF37`) grazing dark metallic and organic textures.
- **Typography:** Brutalist, wide-tracked uppercase sans-serif headers paired with clean monospace for weights (`g`, `ml`, `THC %`, `Terpenes`).

## Technical Architecture
1. **Smooth Scroll Sync:** Always wrap the root layout in `<ReactLenis root>` and sync Lenis ticks with `gsap.ticker`.
2. **Canvas Isolation:** Mount a single persistent `<Canvas>` (`position: fixed; inset: 0; pointer-events: none; z-index: 0`) behind HTML scroll sections (`z-index: 10`).
3. **Scroll Choreography:**
   - Section 1 (Hero): The **Cartel Vault Door** (matte black brushed steel with `#D4AF37` gold locking mechanisms) unlocks and swings open as `scrollProgress` moves from `0.0` to `0.25`.
   - Section 2 (Anatomy): Camera pushes through the vault into a floating, rotating **3D Cannabis Bud / Luxury Jar** that separates into layers (trichomes, terpene rings, lab stats) from `0.25` to `0.65`.
   - Section 3 (Catalogue Transition): Camera settles into a subtle ambient backdrop as the gated store UI rises into view.
4. **Performance Guardrails:**
   - Use `drei` `<AdaptiveDpr pixelated />`, `<AdaptiveEvents />`, and `<Preload all />`.
   - Compress all `.glb` models with Draco (`useGLTF.preload`).
   - Dispose of geometries/materials on unmount and cap devicePixelRatio at `[1, 1.5]` for tablet compatibility.
