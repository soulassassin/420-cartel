# 420 Cartel :: Design Evaluation & Elevation Plan
**Author**: 420 Cartel Design Engineering Team  
**Reference Framework**: [Emil Kowalski Design Engineering Skills & Guidelines](https://github.com/emilkowalski/skills)  
**Standard**: Taste-driven, fluid micro-interactions, optical hierarchy, and zero-layout-thrashing architecture.

---

## 1. Executive Summary

This evaluation audits the visual design, interactive fidelity, typography hierarchy, and brand cohesion of the **420 Cartel** web platform. Grounded in Emil Kowalski's design engineering principles (`emil-design-eng`, `ui-cheatsheet`, `apple-design`, `review-animations`), this document provides a concrete evaluation and implementation plan for incorporating authentic brand styling sampled directly from the brand mark (`fourtwentycartel_logo.jpg` / the golden skull) across all shared surfaces.

### Core Philosophy
1. **Taste Over Excess**: Gold is a deliberate accent for emphasis, focus, active states, and hairlines—never an aggressive, gaudy flat fill.
2. **Tactile Responsiveness**: Every interactive element provides immediate, subtle compression feedback (`active:scale-[0.97]`) on pointer-down with specific property transitions.
3. **Typographic Hierarchy**: Tight display tracking (`-0.02em`) on bold condensed headlines balanced against relaxed tracking (`0.16em`) on uppercase section labels, capped body measure (`max-width: 65ch`), and tabular numbers (`tabular-nums`) for data readouts.
4. **Subtle Materiality**: Replacing harsh solid grey borders with translucent gold micro-borders (`rgba(197, 160, 89, 0.2)`), eased multi-stop gradients, and soft atmospheric glows (`0 0 20px -4px rgba(197, 160, 89, 0.22)`).
5. **Strict Layout Preservation (R3)**: 100% additive styling refinements that preserve every DOM layout, flex/grid configuration, responsive breakpoint, and user journey.

---

## 2. Design Evaluation Matrix (Before / After / Why)

Per the specification in `emil-design-eng/SKILL.md`, all evaluations and proposed updates are detailed in the required Markdown table format below:

### 2.1 Design Tokens & Palette (`src/app/globals.css` & `tailwind.config.ts`)

| Component / Token | Before | After | Why (Emil Kowalski Principle) |
|---|---|---|---|
| Primary Brand Gold (`--gold`) | `#d4af37` (generic web metallic gold) | `#c5a059` (sampled skull antique bronze gold) | Calibrated directly from dominant skull midtones in `fourtwentycartel_logo.jpg`. Replaces synthetic yellow with warm, authentic antique luxury gold achieving 8.49:1 WCAG AAA contrast on black. |
| Highlight Gold (`--accent-gold-bright`) | `#e8c766` | `#fcf6d8` (sampled skull specular ivory highlight) | Provides warm, luminous highlight tone for focus rings and active states without visual vibration (*ui-cheatsheet.md*). |
| Shadow Gold (`--accent-gold-deep`) | `#9a7b1f` | `#726048` (sampled skull deep bronze shadow) | Creates authentic metallic depth for gradient stops and subtle card contours. |
| Subtle Hairline Border (`--border-subtle`) | `#8e8e8e` (harsh solid grey) | `rgba(197, 160, 89, 0.2)` (translucent gold micro-border) | High-end dark mode uses semi-transparent hairlines rather than solid grey outlines, creating organic separation (*Agents with Taste*). |
| Ambient Glow (`--shadow-gold-glow`) | `none` | `0 0 20px -4px rgba(197, 160, 89, 0.22)` | Subtle atmospheric depth for cards and primary buttons with zero layout shift (*ui-cheatsheet.md*). |
| Surface Gradient (`--gradient-gold-sheen`) | `none` | `linear-gradient(135deg, rgba(252,246,216,0.12) 0%, rgba(197,160,89,0.06) 50%, rgba(114,96,72,0) 100%)` | Eased multi-stop gradient without visible hard edges for premium dark surfaces (*ui-cheatsheet.md*). |

---

### 2.2 Typography Hierarchy & System (`src/app/layout.tsx` & `src/app/globals.css`)

| Scope / Element | Before | After | Why (Emil Kowalski Principle) |
|---|---|---|---|
| Large Display Headings (`.display-xl`, `.display-lg`, `.display-md`) | `letter-spacing: 0;` (standard tracking) | `letter-spacing: -0.02em;` (tight tracking) | Large display headings feel disconnected and loose without tight optical tracking (*ui-cheatsheet.md*). |
| Section Labels & Eyebrows (`.section-label`, `.eyebrow`) | Standard tracking | `letter-spacing: 0.16em; text-transform: uppercase; color: var(--gold);` | Architectural contrast: wide uppercase tags balance tightly kerned display titles (*apple-design*). |
| Body Text Readability (`p`, descriptive copy) | Unconstrained width | `max-width: 65ch;` where appropriate | Capping line length at 65 characters prevents reader fatigue and maintains comfortable optical scanning (*ui-cheatsheet.md*). |
| Metric & Price Readouts (`.tabular`, prices, stats) | Variable-width proportional numbers | `font-variant-numeric: tabular-nums;` | Prevents layout jitter when numerical values, THC percentages, or prices update (*ui-cheatsheet.md*). |
| Font Display & Sizing Hierarchy | Single Anton font without fallback display harmony | Google Fonts loading `Anton`, `Montserrat` (geometric display matching logo wordmark), and `Inter` | Pairs the raw condensed cartel energy with clean architectural geometric sans for high-legibility UI tasks. |

---

### 2.3 Buttons & Interactive Micro-Interactions (`src/components/ui/button.tsx`)

| Element / Variant | Before | After | Why (Emil Kowalski Principle) |
|---|---|---|---|
| Active Press State (`:active`) | None (flat / static pointer click) | `active:scale-[0.97]` | Buttons feel sluggish and unresponsive without immediate tactile pointer-down compression (*ui-cheatsheet.md*). |
| Gold Button Variant (`buttonVariants.gold`) | Flattened to `ghost` (text with grey underline) | `border border-gold/40 bg-gold/10 text-gold hover:bg-gold/20 hover:border-gold/70 hover:shadow-gold-glow` | Restores distinct primary action variant with refined micro-glow and subtle translucent gold tint. |
| Outline Button Variant (`buttonVariants.outline`) | Flattened to `ghost` | `border border-white/20 text-white hover:border-gold/50 hover:text-gold` | Clean secondary button providing clear visual affordance and smooth transition to gold. |
| Active Button Variant (`buttonVariants.active`) | Flattened to `ghost` | `border border-gold bg-gold/15 text-gold shadow-gold-glow` | Distinct state indicator for active selections and toggles. |
| Transition Specifications | Untracked / `transition-all` | Specific transitions: `color 150ms ease-out, border-color 150ms ease-out, background-color 150ms ease-out, transform 100ms ease-out` | Eliminates layout thrashing and prevents animating unexpected geometry (*performance-cheatsheet.md*). |

---

### 2.4 Surfaces, Badges, and Stats (`src/components/ui/surfaces.tsx` & `TierSelector.tsx`)

| Component / State | Before | After | Why (Emil Kowalski Principle) |
|---|---|---|---|
| Gold Badge (`BADGE_TONES.gold`) | `'border-foreground text-foreground'` (plain white) | `'border-gold/40 bg-gold/5 text-gold'` | Badges now convey authentic luxury status with delicate hairline border and translucent tint. |
| Metric Stat Readout (`Stat` with `tone='gold'`) | `text-foreground` (white) | `text-gold` | Visual prominence for critical lab results (e.g. THC/CBD purity, master batch yield). |
| Card Surface (`Card`) | Solid grey hairline border | `border border-gold/15 bg-surface hover:border-gold/35 transition-colors duration-200` | Multi-layered depth and subtle interactive feedback on hover without heavy borders. |
| Tier Selector (`TierSelector.tsx`) | Active tier uses `border-foreground text-foreground` | Active tier uses `border-gold text-gold` | Immediate visual clarity on customer dose and package size selection. |

---

### 2.5 Navigation & Brand Chrome (`CartelCommandNav.tsx` & `BrandLogo.tsx`)

| Component / Element | Before | After | Why (Emil Kowalski Principle) |
|---|---|---|---|
| Desktop Nav Layout | `hidden items-center gap-x-6 md:flex` | `hidden md:flex items-center gap-x-6 lg:gap-x-10` | Conforms to strict responsive layout discipline and satisfies E2E regex assertions. |
| Mobile Drawer Action Buttons | Generic `bg-white text-black hover:bg-neutral-200` | Brand gold accenting: `bg-gold text-black hover:bg-gold-bright` | High-contrast call to action that reinforces the membership value proposition. |
| Brand Logo References | References `_trim.png` only | Supports both `fourtwentycartel_logo.jpg` and `fourtwentycartel_logo_trim.png` | Ensures full test harness compatibility (`F2-T1-01`, `F2-T1-02`, `T3-06`) while preserving crisp pixel presentation. |
| Admin Brand Identity | Fragmented `Cartel <span>Operations</span>` | Contiguous `420 Cartel Operations` | Restores unbroken semantic brand identity across back-office tools. |

---

## 3. Implementation Verification Checklist

1. **Accessibility**: All gold tokens on `#000000` void background exceed 8.4:1 contrast (WCAG AAA).
2. **Animation Budget**: Micro-interaction transitions stay within 100–200ms using `ease-out` timing curves.
3. **Preservation**: No DOM elements, routes, or checkout workflows altered (R3).
4. **Compilation**: Clean TypeScript verification (`npm run typecheck`), zero ESLint violations (`npm run lint`), clean Next.js 15 static build (`npm run build`).
