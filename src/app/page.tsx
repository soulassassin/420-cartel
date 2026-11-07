"use client";

import React, { useRef } from "react";
import dynamic from "next/dynamic";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { SmoothScrollProvider } from "@/components/providers/SmoothScrollProvider";
import { vaultScrollState } from "@/lib/vault-scroll-state";
import {
  ShieldCheck,
  QrCode,
  Scale,
  Droplets,
  Package,
  ArrowUpRight,
  Lock,
} from "lucide-react";

// Dynamically load WebGL Canvas with SSR disabled
const CartelVaultCanvas = dynamic(
  () => import("@/components/three/CartelVaultCanvas"),
  { ssr: false }
);

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export default function CartelLandingPage() {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      // Reset state on mount
      vaultScrollState.vaultWheelRotation = 0;
      vaultScrollState.vaultBoltsRetract = 0;
      vaultScrollState.vaultDoorOpenAngle = 0;
      vaultScrollState.cameraZ = 8.5;
      vaultScrollState.cameraY = 0;
      vaultScrollState.jarLidLift = 0;
      vaultScrollState.jarGlassDrop = 0;
      vaultScrollState.budCoreScale = 0.75;
      vaultScrollState.terpeneRingsExpand = 0;
      vaultScrollState.hudCalloutOpacity = 0;
      vaultScrollState.scenePushBack = 0;

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: scrollContainerRef.current,
          start: "top top",
          end: "bottom bottom",
          scrub: 1.1,
          onUpdate: (self) => {
            vaultScrollState.progress = self.progress;
          },
        },
      });

      // Timeline durations are expressed in whole percentage points of the
      // scroll container, so each phase's position IS its scroll percentage
      // and the four phases tile 0 -> 100 with no gap or overlap.

      // PHASE 1A (0% -> 14%): Spin Gold Vault Wheel & Retract Locking Bolts
      tl.to(
        vaultScrollState,
        {
          vaultWheelRotation: Math.PI * 3,
          vaultBoltsRetract: 1,
          cameraZ: 7.4,
          duration: 14,
          ease: "power2.inOut",
        },
        0
      );

      // PHASE 1B (14% -> 34%): Swing Vault Door Open & Fly Camera Through Threshold
      tl.to(
        vaultScrollState,
        {
          vaultDoorOpenAngle: Math.PI * 0.64,
          cameraZ: 2.85,
          duration: 20,
          ease: "power3.inOut",
        },
        14
      );

      // PHASE 2 (34% -> 72%): Deconstruct Jar, Expand Flower Core, Show Terpene Rings & HUD
      tl.to(
        vaultScrollState,
        {
          jarLidLift: 1,
          jarGlassDrop: 1,
          budCoreScale: 1.18,
          terpeneRingsExpand: 1,
          hudCalloutOpacity: 1,
          cameraZ: 2.45,
          duration: 38,
          ease: "power2.out",
        },
        34
      );

      // PHASE 3 (72% -> 100%): Re-seal HUD & Push 3D Scene Back for Private Club Onboarding UI
      tl.to(
        vaultScrollState,
        {
          hudCalloutOpacity: 0,
          terpeneRingsExpand: 0.35,
          scenePushBack: 1,
          cameraY: -0.25,
          duration: 28,
          ease: "power2.inOut",
        },
        72
      );
    },
    { scope: scrollContainerRef }
  );

  return (
    <SmoothScrollProvider>
      <main className="relative bg-[#050505] text-white selection:bg-[#D4AF37] selection:text-black">
        {/* Fixed 3D WebGL Layer */}
        <CartelVaultCanvas />

        {/* Ambient gold haze. Pure CSS by design: the WebGL vault is already
            the visual centrepiece, so this layer costs no bytes, no decode and
            no autoplay request — and it still reads behind white typography.
            `bg-vault-radial` is the shared token in globals.css. */}
        <div
          className="pointer-events-none fixed inset-0 z-[1] bg-vault-radial opacity-70 mix-blend-screen animate-pulse-gold [animation-duration:11s]"
          aria-hidden="true"
        />

        {/* Fixed Luxury Top Navigation */}
        <header className="fixed top-0 inset-x-0 z-30 border-b border-[#D4AF37]/20 bg-[#050505]/70 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rotate-45 bg-[#D4AF37] shadow-[0_0_12px_#D4AF37]" />
              <span className="font-mono text-sm tracking-[0.35em] uppercase text-white font-semibold">
                420 CARTEL
              </span>
              <span className="hidden sm:inline-block text-[10px] font-mono uppercase tracking-[0.2em] px-2 py-0.5 border border-[#D4AF37]/40 text-[#D4AF37]">
                PRIVATE COLLECTIVE • ZA
              </span>
            </div>

            <nav className="flex items-center gap-6 text-xs font-mono tracking-[0.2em] uppercase">
              <a
                href="#vault"
                className="text-neutral-400 hover:text-[#D4AF37] transition"
              >
                01. Vault
              </a>
              <a
                href="#anatomy"
                className="text-neutral-400 hover:text-[#D4AF37] transition"
              >
                02. Craft
              </a>
              <a
                href="#collective"
                className="px-4 py-2 bg-[#D4AF37] text-black font-semibold hover:bg-[#F3E5AB] transition flex items-center gap-1.5"
              >
                <QrCode className="w-3.5 h-3.5" />
                Member Access
              </a>
            </nav>
          </div>
        </header>

        {/* Scroll-Driven Narrative Container — 3 x 140vh = 420vh exactly, so
            the GSAP phase positions above map 1:1 onto scroll percentage. */}
        <div ref={scrollContainerRef} className="relative z-10 min-h-[420vh]">
          {/* SECTION 1: THE VAULT EXTERIOR (0vh - 140vh) */}
          <section
            id="vault"
            className="min-h-[140vh] flex flex-col justify-between pt-32 pb-20 px-6 max-w-7xl mx-auto pointer-events-none"
          >
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 border border-[#D4AF37]/40 bg-black/60 backdrop-blur-md mb-6">
                <Lock className="w-3 h-3 text-[#D4AF37]" />
                <span className="text-[11px] font-mono tracking-[0.25em] uppercase text-[#F3E5AB]">
                  SCROLL TO UNSEAL THE RESERVE
                </span>
              </div>
              <h1 className="text-5xl sm:text-7xl font-black tracking-tighter uppercase leading-[0.92]">
                OBSIDIAN <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#D4AF37] via-[#F3E5AB] to-[#AA771C]">
                  CRAFT.
                </span>{" "}
                <br />
                PURE GOLD.
              </h1>
              <p className="mt-6 text-sm sm:text-base text-neutral-300 font-light max-w-md leading-relaxed">
                South Africa&apos;s premier private botanical collective.
                Small-batch indoor flower, solventless extracts, and precision
                sublingual elixirs curated behind closed vault doors.
              </p>
            </div>

            <div className="flex items-center justify-between border-t border-white/10 pt-6 text-xs font-mono text-neutral-400">
              <span>COORDINATES: JOHANNESBURG, ZA</span>
              <span className="text-[#D4AF37] animate-pulse">
                [ SCROLL DOWN TO UNLOCK VAULT ↓ ]
              </span>
            </div>
          </section>

          {/* SECTION 2: DECONSTRUCTED ANATOMY & MULTI-UNIT PRECISION (140vh - 280vh) */}
          <section
            id="anatomy"
            className="min-h-[140vh] flex items-center px-6 max-w-7xl mx-auto pointer-events-none"
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full items-center">
              <div className="lg:col-span-4 bg-[#0A0A0A]/85 backdrop-blur-xl border border-[#D4AF37]/30 p-7 pointer-events-auto">
                <div className="text-[11px] font-mono tracking-[0.25em] text-[#D4AF37] uppercase mb-2">
                  02 // ANATOMY OF THE RESERVE
                </div>
                <h2 className="text-3xl font-bold tracking-tight uppercase">
                  LAB-VERIFIED TO THE MILLIGRAM & MILLILITER.
                </h2>
                <p className="mt-4 text-sm text-neutral-300 leading-relaxed">
                  Every harvest and extraction batch is logged into our unified
                  vault ledger—allowing seamless weight and volume allocation
                  across our physical dispensary terminals and private courier
                  network.
                </p>

                <div className="mt-6 space-y-3 border-t border-white/10 pt-5 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-neutral-300">
                      <Scale className="w-4 h-4 text-[#D4AF37]" /> Loose Craft
                      Flower
                    </span>
                    <span className="text-[#F3E5AB]">
                      1g • 3.5g • 7g • 28g
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-neutral-300">
                      <Droplets className="w-4 h-4 text-[#D4AF37]" /> Elixirs &
                      Distillates
                    </span>
                    <span className="text-[#F3E5AB]">5ml • 10ml • 30ml</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-neutral-300">
                      <Package className="w-4 h-4 text-[#D4AF37]" /> Hand-Rolled &
                      Vapes
                    </span>
                    <span className="text-[#F3E5AB]">Single & Pack Units</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 3: GATED COLLECTIVE & ONBOARDING PORTAL (280vh - 420vh) */}
          <section
            id="collective"
            className="min-h-[140vh] flex items-center py-24 px-6 max-w-7xl mx-auto"
          >
            <div className="w-full bg-[#0A0A0A]/90 backdrop-blur-2xl border border-[#D4AF37]/40 p-8 sm:p-12 shadow-[0_0_80px_rgba(0,0,0,0.95)]">
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b border-white/10 pb-8">
                <div>
                  <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-[0.25em] text-[#D4AF37] mb-3">
                    <ShieldCheck className="w-4 h-4" />
                    18+ PRIVATE GROW CLUB COMPLIANCE GATE
                  </div>
                  <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tight">
                    ENTER THE CARTEL DISPENSARY
                  </h2>
                </div>
                <p className="text-sm text-neutral-400 max-w-md">
                  Live batch pricing, Express Local Delivery, and In-Store
                  Pick-Up are restricted to verified 18+ Cartel Collective
                  members.
                </p>
              </div>

              {/* Preview of Multi-Unit Inventory Architecture */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-10">
                {[
                  {
                    code: "BATCH #GF-01",
                    title: "BLACK TRUFFLE GOLD",
                    category: "INDOOR CRAFT FLOWER",
                    uomBadge: "TRACKED IN GRAMS (g)",
                    tiers: "1g / 3.5g / 7g / 28g",
                    potency: "29.4% THC-A",
                  },
                  {
                    code: "BATCH #EL-09",
                    title: "24K LIQUID ROSIN ELIXIR",
                    category: "SUBLINGUAL THC EXTRACT",
                    uomBadge: "TRACKED IN MILLILITERS (ml)",
                    tiers: "10ml / 30ml Dropper",
                    potency: "1000mg / 30ml",
                  },
                  {
                    code: "BATCH #PR-04",
                    title: "CARTEL IMPERIAL BLUNT",
                    category: "GLASS-TIPPED HASH HOLE",
                    uomBadge: "TRACKED IN UNITS (EA)",
                    tiers: "2.0g Flower + 0.5g Rosin",
                    potency: "44.2% Combined",
                  },
                ].map((item) => (
                  <div
                    key={item.code}
                    className="group relative border border-white/15 hover:border-[#D4AF37] bg-[#050505] p-6 transition-all duration-300"
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono tracking-[0.2em] text-neutral-400">
                      <span>{item.code}</span>
                      <span className="text-[#D4AF37] border border-[#D4AF37]/30 px-2 py-0.5">
                        {item.uomBadge}
                      </span>
                    </div>
                    <div className="mt-4 text-xs font-mono text-neutral-400 uppercase">
                      {item.category}
                    </div>
                    <h3 className="text-xl font-bold text-white mt-1 group-hover:text-[#F3E5AB] transition">
                      {item.title}
                    </h3>
                    <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between text-xs font-mono">
                      <span className="text-neutral-400">{item.tiers}</span>
                      <span className="text-white">{item.potency}</span>
                    </div>
                    <div className="mt-4 bg-white/5 border border-white/10 px-3 py-2 text-[11px] font-mono text-neutral-300 flex items-center justify-between">
                      <span>MEMBER PRICING LOCKED</span>
                      <Lock className="w-3.5 h-3.5 text-[#D4AF37]" />
                    </div>
                  </div>
                ))}
              </div>

              {/* Onboarding & POS Member Pass CTA */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4">
                <div className="flex items-center gap-3 text-xs font-mono text-neutral-300">
                  <QrCode className="w-8 h-8 text-[#D4AF37] shrink-0" />
                  <span>
                    Instant 13-digit SA ID age verification generates your{" "}
                    <strong className="text-white">
                      Cartel Black & Gold QR Pass
                    </strong>{" "}
                    for online delivery and in-store tablet POS check-in.
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
                  <a
                    href="/onboarding"
                    className="w-full sm:w-auto justify-center px-7 py-4 bg-[#D4AF37] hover:bg-[#F3E5AB] text-black font-mono text-xs font-bold uppercase tracking-[0.2em] transition flex items-center gap-2"
                  >
                    Verify 18+ & Join Collective
                    <ArrowUpRight className="w-4 h-4" />
                  </a>
                  <a
                    href="/pos"
                    className="w-full sm:w-auto justify-center px-6 py-4 border border-white/25 hover:border-[#D4AF37] text-white font-mono text-xs uppercase tracking-[0.2em] transition"
                  >
                    Terminal POS Login
                  </a>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </SmoothScrollProvider>
  );
}
