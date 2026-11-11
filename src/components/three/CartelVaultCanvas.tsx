'use client';

/**
 * 420 CARTEL :: THE VAULT
 *
 * One persistent R3F canvas behind the whole landing page. It holds no React
 * state of its own — every animated value is read out of the plain mutable
 * `vaultScrollState` object that GSAP's ScrollTrigger writes to in
 * `src/app/page.tsx`. Reading a mutable object inside `useFrame` keeps the
 * scroll choreography at render framerate with zero React re-renders.
 *
 * Scene layout along -Z:
 *   z = +3.5  VaultDoorAssembly   (bulkhead, bolts, locking wheel)
 *   z =  0.0  DeconstructedJarAndBud (lid / bud core / terpene rings / glass)
 *
 * All materials and geometries are created once and disposed on unmount.
 */

import React, { Suspense, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  AdaptiveDpr,
  AdaptiveEvents,
  Float,
  Html,
  MeshTransmissionMaterial,
  Preload,
  Sparkles,
} from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import { CARTEL_COLORS, DPR_RANGE } from '@/lib/brand';
import { vaultScrollState } from '@/lib/vault-scroll-state';
import { clamp } from '@/lib/utils';

/**
 * Ceiling on the per-frame delta fed to every `MathUtils.damp` call below.
 *
 * Exponential damping is framerate-independent ONLY if it is handed the real
 * elapsed time. Clamping exists to stop the scene teleporting after a stall
 * (a tab switch, a long GC pause), but the clamp has to stay well above a
 * realistic frame time or it silently becomes a speed limit: at 10fps a 1/30s
 * cap advances the choreography at a third of wall-clock speed, and on a
 * machine falling back to a software rasteriser — or in a background tab,
 * which Chrome pins to 1Hz — the scene crawls so far behind the scroll
 * position that it reads as "the 3D never animates".
 *
 * 1/10s is high enough that anything from 10fps upward tracks the scroll
 * exactly, and low enough that resuming from a multi-second stall still eases
 * in over a few frames instead of snapping.
 */
const MAX_FRAME_DELTA = 1 / 10;

/* =====================================================================
   RENDERER CAPABILITY PROBE
   ===================================================================== */

let cachedLowPower: boolean | null = null;

/**
 * True when the browser is rasterising WebGL on the CPU instead of a GPU —
 * Microsoft Basic Render Driver (no GPU driver, or hardware acceleration
 * switched off in Chrome), SwiftShader, or Mesa's llvmpipe.
 *
 * This matters enormously: on a software rasteriser the full scene takes
 * SECONDS per frame, which is indistinguishable from "the 3D never loaded".
 * The expensive features below are switched off in that case so the vault
 * still appears, just with simpler glass and no shadows.
 */
function isLowPowerRenderer(): boolean {
  if (cachedLowPower !== null) return cachedLowPower;
  if (typeof document === 'undefined') return false;

  try {
    const probe = document.createElement('canvas');
    const gl = (probe.getContext('webgl2') ??
      probe.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) {
      cachedLowPower = true;
      return cachedLowPower;
    }
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debug
      ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL))
      : '';
    cachedLowPower =
      /swiftshader|basic render|llvmpipe|software|microsoft basic/i.test(renderer);
  } catch {
    cachedLowPower = true;
  }

  return cachedLowPower ?? false;
}

/* =====================================================================
   MATERIALS — created once, shared by every mesh, disposed on unmount
   ===================================================================== */

interface CartelMaterials {
  obsidianSteel: THREE.MeshStandardMaterial;
  matteBlack: THREE.MeshStandardMaterial;
  cartelGold: THREE.MeshStandardMaterial;
  specularGold: THREE.MeshStandardMaterial;
  organicBud: THREE.MeshStandardMaterial;
  organicBudGold: THREE.MeshStandardMaterial;
}

function useCartelMaterials(): CartelMaterials {
  const materials = useMemo<CartelMaterials>(() => {
    // Brushed steel: dark, metallic, anisotropic-looking via high metalness
    // against a mid roughness. Reads as machined obsidian under rim light.
    const obsidianSteel = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#1A1A1C'),
      metalness: 0.96,
      roughness: 0.34,
      envMapIntensity: 1.5,
    });

    // The bulkhead and lid shell: almost no specular return, so the gold
    // hardware is the only thing that catches the key light.
    const matteBlack = new THREE.MeshStandardMaterial({
      color: new THREE.Color(CARTEL_COLORS.void),
      metalness: 0.18,
      roughness: 0.92,
      envMapIntensity: 0.5,
    });

    // 24K gold — primary hardware.
    const cartelGold = new THREE.MeshStandardMaterial({
      color: new THREE.Color(CARTEL_COLORS.gold),
      metalness: 1,
      roughness: 0.19,
      envMapIntensity: 2.1,
    });

    // Specular gold highlight pass — bezels, ring edges, flecked calyxes.
    const specularGold = new THREE.MeshStandardMaterial({
      color: new THREE.Color(CARTEL_COLORS.goldBright),
      metalness: 1,
      roughness: 0.08,
      envMapIntensity: 2.6,
      emissive: new THREE.Color(CARTEL_COLORS.goldDeep),
      emissiveIntensity: 0.14,
    });

    // Organic calyx: dielectric, slightly waxy, with a faint subsurface-ish
    // sheen standing in for trichome frost.
    const organicBud = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#121410'),
      metalness: 0.06,
      roughness: 0.62,
      envMapIntensity: 0.85,
      flatShading: true,
    });

    const organicBudGold = new THREE.MeshStandardMaterial({
      color: new THREE.Color(CARTEL_COLORS.gold),
      metalness: 0.88,
      roughness: 0.3,
      envMapIntensity: 1.8,
      flatShading: true,
    });

    return {
      obsidianSteel,
      matteBlack,
      cartelGold,
      specularGold,
      organicBud,
      organicBudGold,
    };
  }, []);

  // NOTE: these are deliberately NOT disposed in an effect cleanup.
  // `reactStrictMode` is on, so in development React runs every effect
  // mount -> cleanup -> mount again while REUSING the same `useMemo` value.
  // An eager cleanup therefore disposes the exact materials the second mount
  // goes on to render with, forcing three to rebuild every shader program and
  // re-upload every uniform on the next frame. There is nothing to leak by
  // leaving them alone either: this canvas is a page-level singleton, and when
  // it unmounts R3F disposes the renderer, which releases all of their GPU-side
  // programs and textures anyway. Same reasoning for every shared geometry below.
  return materials;
}

/* =====================================================================
   VAULT DOOR ASSEMBLY — z = 3.5
   ===================================================================== */

/** Radial placement of the 8 locking bolts, in radians. */
const BOLT_COUNT = 8;
const BOLT_RING_RADIUS = 1.42;
const BOLT_TRAVEL = 0.46;

/** The 6 spokes of the locking wheel. */
const SPOKE_COUNT = 6;

function VaultDoorAssembly({ materials }: { materials: CartelMaterials }) {
  const pivotRef = useRef<THREE.Group>(null);
  const wheelRef = useRef<THREE.Group>(null);
  const boltRefs = useRef<Array<THREE.Mesh | null>>([]);

  const boltGeometry = useMemo(
    () => new THREE.CylinderGeometry(0.085, 0.085, 0.62, 18),
    [],
  );
  const spokeGeometry = useMemo(
    () => new THREE.BoxGeometry(0.075, 0.6, 0.075),
    [],
  );

  const boltAngles = useMemo(
    () =>
      Array.from(
        { length: BOLT_COUNT },
        (_, index) => (index / BOLT_COUNT) * Math.PI * 2,
      ),
    [],
  );

  const spokeAngles = useMemo(
    () =>
      Array.from(
        { length: SPOKE_COUNT },
        (_, index) => (index / SPOKE_COUNT) * Math.PI * 2,
      ),
    [],
  );

  useFrame((_state, delta) => {
    const dt = Math.min(delta, MAX_FRAME_DELTA);

    // The wheel spins three full turns before the bolts release.
    if (wheelRef.current) {
      wheelRef.current.rotation.z = THREE.MathUtils.damp(
        wheelRef.current.rotation.z,
        vaultScrollState.vaultWheelRotation,
        6,
        dt,
      );
    }

    // Bolts retract inward along their own local Y toward the door centre.
    const retract = clamp(vaultScrollState.vaultBoltsRetract, 0, 1);
    for (const bolt of boltRefs.current) {
      if (!bolt) continue;
      bolt.position.y = THREE.MathUtils.damp(
        bolt.position.y,
        BOLT_RING_RADIUS - retract * BOLT_TRAVEL,
        7,
        dt,
      );
    }

    // Negative angle: the door is left-hinged, so it swings toward the viewer
    // on the -Y axis of the pivot group.
    if (pivotRef.current) {
      pivotRef.current.rotation.y = THREE.MathUtils.damp(
        pivotRef.current.rotation.y,
        -vaultScrollState.vaultDoorOpenAngle,
        4.5,
        dt,
      );
    }
  });

  return (
    <group position={[0, 0, 3.5]}>
      {/* ---- Stationary bulkhead -------------------------------------- */}
      {/* Outer matte-black torus frame the door seats into. */}
      <mesh material={materials.matteBlack} rotation={[0, 0, 0]}>
        <torusGeometry args={[2.05, 0.3, 24, 72]} />
      </mesh>

      {/* Gold inner bezel ring — the only bright edge when the door is shut. */}
      <mesh material={materials.cartelGold} position={[0, 0, 0.04]}>
        <torusGeometry args={[1.82, 0.055, 18, 72]} />
      </mesh>

      {/* Specular gold pinstripe just inside the bezel. */}
      <mesh material={materials.specularGold} position={[0, 0, 0.08]}>
        <torusGeometry args={[1.7, 0.016, 12, 72]} />
      </mesh>

      {/* Recessed black void behind the door, so the open doorway reads dark. */}
      <mesh material={materials.matteBlack} position={[0, 0, -0.55]}>
        <cylinderGeometry
          args={[1.8, 1.8, 1.1, 48, 1, true]}
        />
      </mesh>

      {/* ---- Left-hinged door leaf ------------------------------------ */}
      <group ref={pivotRef} position={[-1.85, 0, 0]}>
        {/* Offset the slab back onto the bulkhead centre, so the group pivots
            around the hinge at x = -1.85 rather than the slab's own axis. */}
        <group position={[1.85, 0, 0]}>
          {/* Heavy brushed-steel slab. */}
          <mesh material={materials.obsidianSteel} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[1.76, 1.76, 0.42, 64]} />
          </mesh>

          {/* Concentric machined grooves across the slab face. */}
          {[1.5, 1.2, 0.9].map((radius) => (
            <mesh
              key={radius}
              material={materials.obsidianSteel}
              position={[0, 0, 0.23]}
            >
              <torusGeometry args={[radius, 0.012, 8, 64]} />
            </mesh>
          ))}

          {/* 8 radial 24K gold locking bolts. Each bolt is rotated about Z to
              its station, then driven along local +Y by the retract value. */}
          {boltAngles.map((angle, index) => (
            <group key={angle} rotation={[0, 0, angle]} position={[0, 0, 0.12]}>
              <mesh
                ref={(node) => {
                  boltRefs.current[index] = node;
                }}
                geometry={boltGeometry}
                material={materials.cartelGold}
                position={[0, BOLT_RING_RADIUS, 0]}
              />
              {/* Bolt housing stays put while the bolt slides out of it. */}
              <mesh material={materials.matteBlack} position={[0, 1.08, 0]}>
                <cylinderGeometry args={[0.13, 0.13, 0.3, 16]} />
              </mesh>
            </group>
          ))}

          {/* 6-spoke gold locking wheel, mounted proud of the slab face. */}
          <group ref={wheelRef} position={[0, 0, 0.3]}>
            <mesh material={materials.cartelGold}>
              <torusGeometry args={[0.58, 0.058, 16, 48]} />
            </mesh>
            <mesh material={materials.specularGold}>
              <cylinderGeometry args={[0.15, 0.15, 0.2, 24]} />
            </mesh>
            {spokeAngles.map((angle) => (
              <mesh
                key={angle}
                geometry={spokeGeometry}
                material={materials.cartelGold}
                position={[Math.cos(angle) * 0.29, Math.sin(angle) * 0.29, 0]}
                rotation={[0, 0, angle - Math.PI / 2]}
              />
            ))}
            {/* Knurled grip knobs at each spoke tip. */}
            {spokeAngles.map((angle) => (
              <mesh
                key={`knob-${angle}`}
                material={materials.specularGold}
                position={[Math.cos(angle) * 0.58, Math.sin(angle) * 0.58, 0]}
              >
                <sphereGeometry args={[0.072, 16, 12]} />
              </mesh>
            ))}
          </group>
        </group>
      </group>
    </group>
  );
}

/* =====================================================================
   DECONSTRUCTED JAR + BUD — origin
   ===================================================================== */

const CALYX_COUNT = 42;
/** Golden angle — 137.507…°, the phyllotaxis divergence angle. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

interface CalyxNode {
  position: [number, number, number];
  scale: [number, number, number];
  rotation: [number, number, number];
  isGold: boolean;
}

/**
 * Dense golden-angle phyllotaxis cluster shaped into a tapered cola.
 * Fully deterministic — no Math.random — so the silhouette is identical on
 * every mount and nothing shifts between server and client.
 */
function buildCalyxCluster(): CalyxNode[] {
  const nodes: CalyxNode[] = [];

  for (let index = 0; index < CALYX_COUNT; index += 1) {
    const t = index / (CALYX_COUNT - 1);
    const theta = index * GOLDEN_ANGLE;

    // Cola profile: narrow at the crown, widest at ~60% height, tucked at base.
    const radius = 0.44 * Math.sin(Math.PI * (0.2 + 0.72 * t)) + 0.035;
    const height = 0.82 - t * 1.6;

    // Deterministic per-node jitter from the index itself.
    const wobble = Math.sin(index * 12.9898) * 0.5;
    const nodeScale = 0.2 - t * 0.055 + wobble * 0.018;

    nodes.push({
      position: [
        Math.cos(theta) * radius,
        height,
        Math.sin(theta) * radius,
      ],
      scale: [nodeScale, nodeScale * 1.42, nodeScale],
      rotation: [
        wobble * 0.8,
        theta,
        Math.cos(index * 7.233) * 0.45,
      ],
      // Every 5th calyx is flecked in 24K gold.
      isGold: index % 5 === 0,
    });
  }

  return nodes;
}

function BudCore({ materials }: { materials: CartelMaterials }) {
  const lowPower = useMemo(isLowPowerRenderer, []);
  const coreRef = useRef<THREE.Group>(null);
  const hudPrimaryRef = useRef<HTMLDivElement>(null);
  const hudSecondaryRef = useRef<HTMLDivElement>(null);

  // drei's <Html> portals into `portal ?? events.connected ?? canvas parent`,
  // and `events.connected` is whatever the Canvas was given as `eventSource` —
  // here, document.body. Portaling there would absolutely position the HUDs
  // against the initial containing block of a 420vh document instead of the
  // canvas, so they would sit far off-screen and scroll away from the bud they
  // annotate. Pin them to the canvas' own wrapper, which R3F already styles
  // `position: relative` at exactly the canvas' size.
  const canvasWrapper = useThree((state) => state.gl.domElement.parentElement);
  const hudPortal = useMemo(
    () => ({ current: canvasWrapper as HTMLElement }),
    [canvasWrapper],
  );

  const nodes = useMemo(buildCalyxCluster, []);

  // One low-poly icosahedron shared by all 42 calyxes — flat-shaded, it reads
  // as a faceted organic bract rather than a sphere.
  const calyxGeometry = useMemo(() => new THREE.IcosahedronGeometry(1, 1), []);

  useFrame((_state, delta) => {
    const dt = Math.min(delta, MAX_FRAME_DELTA);

    if (coreRef.current) {
      const target = vaultScrollState.budCoreScale;
      const next = THREE.MathUtils.damp(coreRef.current.scale.x, target, 4, dt);
      coreRef.current.scale.setScalar(next);
      coreRef.current.rotation.y += dt * 0.22;
    }

    // Opacity is written straight to the DOM: putting it in React state would
    // re-render the tree every frame.
    const opacity = clamp(vaultScrollState.hudCalloutOpacity, 0, 1).toFixed(3);
    if (hudPrimaryRef.current) {
      hudPrimaryRef.current.style.opacity = opacity;
    }
    if (hudSecondaryRef.current) {
      hudSecondaryRef.current.style.opacity = opacity;
    }
  });

  return (
    <Float speed={1.35} rotationIntensity={0.28} floatIntensity={0.55} floatingRange={[-0.07, 0.07]}>
      <group ref={coreRef} scale={0.75}>
        {/* Inner mass so the cluster never reads as hollow from any angle. */}
        <mesh material={materials.organicBud} position={[0, 0.02, 0]}>
          <sphereGeometry args={[0.3, 20, 16]} />
        </mesh>

        {nodes.map((node, index) => (
          <mesh
            key={index}
            geometry={calyxGeometry}
            material={node.isGold ? materials.organicBudGold : materials.organicBud}
            position={node.position}
            scale={node.scale}
            rotation={node.rotation}
          />
        ))}

        {/* Golden trichome dust. */}
        <Sparkles
          count={lowPower ? 18 : 70}
          scale={[1.5, 2.3, 1.5]}
          size={2.4}
          speed={0.32}
          opacity={0.85}
          noise={0.6}
          color={CARTEL_COLORS.goldBright}
        />

        {/* ---- Floating lab telemetry HUDs --------------------------- */}
        {/* distanceFactor is a screen-scale multiplier: drei divides it by
            `2 * tan(fov/2) * distance`, so at the anatomy stage (fov 42, camera
            ~2.5 units out) a factor of 6 blew these panels up to roughly 3x,
            swallowing the bud they annotate. ~2.2 renders them at about 1:1,
            which is the size the 11px mono type was drawn for. */}
        <Html
          portal={hudPortal}
          position={[1.12, 0.52, 0]}
          distanceFactor={2.2}
          center
          zIndexRange={[12, 10]}
          wrapperClass="pointer-events-none"
        >
          <div
            ref={hudPrimaryRef}
            style={{ opacity: 0 }}
            className="w-[260px] select-none border border-gold/45 bg-void/85 px-4 py-3 font-mono text-[11px] leading-relaxed tracking-[0.12em] text-white shadow-gold-glow backdrop-blur-sm transition-opacity duration-150"
          >
            <div className="mb-1 flex items-center gap-2 text-gold">
              <span className="inline-block h-1.5 w-1.5 rotate-45 bg-gold" />
              <span className="tracking-[0.3em]">ASSAY</span>
            </div>
            BATCH #420-JHB • 29.4% THC-A • Tracked in g / ml
          </div>
        </Html>

        <Html
          portal={hudPortal}
          position={[-1.18, -0.62, 0.1]}
          distanceFactor={2.2}
          center
          zIndexRange={[12, 10]}
          wrapperClass="pointer-events-none"
        >
          <div
            ref={hudSecondaryRef}
            style={{ opacity: 0 }}
            className="w-[290px] select-none border border-gold/45 bg-void/85 px-4 py-3 font-mono text-[11px] leading-relaxed tracking-[0.12em] text-white shadow-gold-glow backdrop-blur-sm transition-opacity duration-150"
          >
            <div className="mb-1 flex items-center gap-2 text-gold">
              <span className="inline-block h-1.5 w-1.5 rotate-45 bg-gold" />
              <span className="tracking-[0.3em]">GC/MS</span>
            </div>
            TERPENE MATRIX: β-Caryophyllene 1.42%, d-Limonene 1.18%, β-Myrcene 0.89%
          </div>
        </Html>
      </group>
    </Float>
  );
}

/** Intersecting gold torus rings that bloom outward as the terpenes "read". */
function TerpeneOrbitRings({ materials }: { materials: CartelMaterials }) {
  const groupRef = useRef<THREE.Group>(null);
  const ringRefs = useRef<Array<THREE.Mesh | null>>([]);

  const rings = useMemo(
    () => [
      { radius: 1.05, tube: 0.008, tilt: [Math.PI / 2, 0, 0], gold: true, spin: 0.16 },
      { radius: 1.32, tube: 0.006, tilt: [Math.PI / 2.35, 0.42, 0], gold: false, spin: -0.11 },
      { radius: 1.58, tube: 0.0055, tilt: [Math.PI / 1.72, -0.35, 0.2], gold: true, spin: 0.08 },
      { radius: 1.84, tube: 0.0045, tilt: [Math.PI / 2.8, 0.9, -0.15], gold: false, spin: -0.06 },
    ],
    [],
  );

  useFrame((_state, delta) => {
    const dt = Math.min(delta, MAX_FRAME_DELTA);
    const expand = clamp(vaultScrollState.terpeneRingsExpand, 0, 1);

    if (groupRef.current) {
      // Collapsed to a tight disc at 0, full orbit at 1.
      const target = 0.18 + expand * 0.82;
      const next = THREE.MathUtils.damp(groupRef.current.scale.x, target, 3.4, dt);
      groupRef.current.scale.setScalar(next);
    }

    ringRefs.current.forEach((ring, index) => {
      if (!ring) return;
      ring.rotation.z += dt * (rings[index]?.spin ?? 0.1);
    });
  });

  return (
    <group ref={groupRef} scale={0.18}>
      {rings.map((ring, index) => (
        <mesh
          key={ring.radius}
          ref={(node) => {
            ringRefs.current[index] = node;
          }}
          material={ring.gold ? materials.cartelGold : materials.specularGold}
          rotation={ring.tilt as [number, number, number]}
        >
          <torusGeometry args={[ring.radius, ring.tube, 8, 96]} />
        </mesh>
      ))}
    </group>
  );
}

function DeconstructedJarAndBud({ materials }: { materials: CartelMaterials }) {
  const lowPower = useMemo(isLowPowerRenderer, []);
  const lidRef = useRef<THREE.Group>(null);
  const glassRef = useRef<THREE.Group>(null);

  // Knurling: a ring of fine vertical ribs around the lid skirt.
  const knurlGeometry = useMemo(() => new THREE.BoxGeometry(0.018, 0.17, 0.018), []);

  const knurlAngles = useMemo(
    () => Array.from({ length: 56 }, (_, index) => (index / 56) * Math.PI * 2),
    [],
  );

  useFrame((_state, delta) => {
    const dt = Math.min(delta, MAX_FRAME_DELTA);

    // Lid lifts clear of the jar mouth and counter-rotates as it unthreads.
    if (lidRef.current) {
      const lift = clamp(vaultScrollState.jarLidLift, 0, 1);
      lidRef.current.position.y = THREE.MathUtils.damp(
        lidRef.current.position.y,
        1.42 + lift * 1.15,
        3.6,
        dt,
      );
      lidRef.current.rotation.y = THREE.MathUtils.damp(
        lidRef.current.rotation.y,
        lift * Math.PI * 1.75,
        3.6,
        dt,
      );
    }

    // Smoked glass body drops away, leaving the bud suspended mid-air.
    if (glassRef.current) {
      const drop = clamp(vaultScrollState.jarGlassDrop, 0, 1);
      glassRef.current.position.y = THREE.MathUtils.damp(
        glassRef.current.position.y,
        -0.52 - drop * 1.95,
        3.2,
        dt,
      );
    }
  });

  return (
    <group position={[0, 0, 0]}>
      {/* ---- Top lid: knurled obsidian shell with 24K gold crown ------ */}
      <group ref={lidRef} position={[0, 1.42, 0]}>
        <mesh material={materials.matteBlack}>
          <cylinderGeometry args={[0.72, 0.72, 0.26, 56]} />
        </mesh>
        {/* Gold crown inlay. */}
        <mesh material={materials.cartelGold} position={[0, 0.145, 0]}>
          <cylinderGeometry args={[0.6, 0.6, 0.035, 56]} />
        </mesh>
        <mesh material={materials.specularGold} position={[0, 0.17, 0]}>
          <torusGeometry args={[0.6, 0.016, 12, 64]} />
        </mesh>
        {/* Gold threaded collar that mates with the jar mouth. */}
        <mesh material={materials.cartelGold} position={[0, -0.16, 0]}>
          <cylinderGeometry args={[0.64, 0.64, 0.09, 48]} />
        </mesh>
        {/* Knurled grip ribs. */}
        {knurlAngles.map((angle) => (
          <mesh
            key={angle}
            geometry={knurlGeometry}
            material={materials.obsidianSteel}
            position={[Math.cos(angle) * 0.722, 0, Math.sin(angle) * 0.722]}
            rotation={[0, -angle, 0]}
          />
        ))}
      </group>

      {/* ---- Centre: reserve bud core + expanding terpene orbits ------ */}
      <BudCore materials={materials} />
      <TerpeneOrbitRings materials={materials} />

      {/* ---- Bottom: smoked glass jar body + weighted gold base ------- */}
      <group ref={glassRef} position={[0, -0.52, 0]}>
        <mesh>
          <cylinderGeometry args={[0.7, 0.7, 1.72, 64, 1, true]} />
          {lowPower ? (
            /* MeshTransmissionMaterial re-renders the scene into a buffer every
               frame — far too costly without a GPU. This approximates the same
               smoked glass with a single cheap transparent pass. */
            <meshPhysicalMaterial
              color="#1C1A14"
              roughness={0.18}
              metalness={0}
              transparent
              opacity={0.42}
              transmission={0}
              side={THREE.DoubleSide}
            />
          ) : (
            <MeshTransmissionMaterial
              transmission={0.82}
              thickness={0.42}
              roughness={0.14}
              ior={1.52}
              chromaticAberration={0.035}
              anisotropicBlur={0.3}
              distortion={0.12}
              distortionScale={0.25}
              temporalDistortion={0.04}
              attenuationDistance={0.6}
              attenuationColor="#14110A"
              color="#1C1A14"
              background={new THREE.Color('#050505')}
              backside
              resolution={256}
              samples={6}
            />
          )}
        </mesh>

        {/* Glass mouth lip. */}
        <mesh material={materials.obsidianSteel} position={[0, 0.86, 0]}>
          <torusGeometry args={[0.7, 0.028, 10, 56]} />
        </mesh>

        {/* Weighted 24K gold base ring and plate. */}
        <mesh material={materials.cartelGold} position={[0, -0.84, 0]}>
          <cylinderGeometry args={[0.74, 0.78, 0.14, 56]} />
        </mesh>
        <mesh material={materials.specularGold} position={[0, -0.76, 0]}>
          <torusGeometry args={[0.745, 0.015, 10, 56]} />
        </mesh>
        <mesh material={materials.matteBlack} position={[0, -0.93, 0]}>
          <cylinderGeometry args={[0.7, 0.7, 0.04, 48]} />
        </mesh>
      </group>
    </group>
  );
}

/* =====================================================================
   CAMERA + CHIAROSCURO LIGHTING
   ===================================================================== */

const CAMERA_Z_NEAR = 2.45;
const CAMERA_Z_FAR = 8.5;

/**
 * The environment map, built entirely on the GPU from three's own
 * RoomEnvironment through PMREMGenerator.
 *
 * A material at metalness 1 shows almost nothing but its reflections, so the
 * gold hardware is invisible without an environment. Two obvious ways to
 * supply one are both wrong here:
 *
 *   - `<Environment preset="…" />` streams an HDRI from a CDN, so the vault
 *     goes black whenever that fetch is slow, proxied or offline.
 *   - `<Environment>` with Lightformer children renders them through a
 *     SEPARATE React root, which under React 19 throws "Attempted to
 *     synchronously unmount a root while React was already rendering" and
 *     leaves the env map never generated — black metal again.
 *
 * PMREM avoids both: pure three.js, no network, no React reconciler involved.
 * It runs once on mount and disposes everything it allocated.
 */
function StudioEnvironment({ intensity = 1 }: { intensity?: number }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useLayoutEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);

    scene.environment = target.texture;
    scene.environmentIntensity = intensity;

    return () => {
      scene.environment = null;
      target.dispose();
      pmrem.dispose();
      // RoomEnvironment builds real meshes; free them too.
      room.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const material = object.material;
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material.dispose();
        }
      });
    };
  }, [gl, scene, intensity]);

  return null;
}

function SceneCameraAndLighting() {
  const keyLightRef = useRef<THREE.SpotLight>(null);
  const rimLightRef = useRef<THREE.SpotLight>(null);
  const keyTarget = useMemo(() => new THREE.Object3D(), []);
  const rimTarget = useMemo(() => new THREE.Object3D(), []);

  // Spotlights need an explicit target in the scene graph to aim at.
  useLayoutEffect(() => {
    if (keyLightRef.current) keyLightRef.current.target = keyTarget;
    if (rimLightRef.current) rimLightRef.current.target = rimTarget;
  }, [keyTarget, rimTarget]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, MAX_FRAME_DELTA);
    const { camera, pointer } = state;

    // Dolly: GSAP writes the target into vaultScrollState; we only damp to it.
    const targetZ = clamp(vaultScrollState.cameraZ, CAMERA_Z_NEAR, CAMERA_Z_FAR);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, targetZ, 3.2, dt);

    // Subtle pointer parallax, layered on top of the scripted camera Y.
    const parallaxX = pointer.x * 0.26;
    const parallaxY = vaultScrollState.cameraY + pointer.y * 0.16;

    camera.position.x = THREE.MathUtils.damp(camera.position.x, parallaxX, 2.4, dt);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, parallaxY, 2.4, dt);

    camera.lookAt(0, vaultScrollState.cameraY * 0.5, 0);
  });

  return (
    <>
      {/* Near-black ambient floor: the scene is lit almost entirely by spots. */}
      <ambientLight intensity={0.085} color="#6E6E78" />
      <hemisphereLight args={['#2A2A33', '#000000', 0.16]} />

      <primitive object={keyTarget} position={[0, 0, 0]} />
      <primitive object={rimTarget} position={[0, 0.3, 1.2]} />

      {/* Warm 24K gold key — high and camera-left, hard falloff. */}
      <spotLight
        ref={keyLightRef}
        position={[-4.2, 5.4, 4.6]}
        angle={0.52}
        penumbra={0.78}
        intensity={185}
        distance={28}
        decay={2}
        color={CARTEL_COLORS.goldBright}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0005}
      />

      {/* Stark white rim from behind — separates the silhouette from the void. */}
      <spotLight
        ref={rimLightRef}
        position={[3.8, 1.6, -5.2]}
        angle={0.68}
        penumbra={0.92}
        intensity={120}
        distance={26}
        decay={2}
        color={CARTEL_COLORS.textPrimary}
      />

      {/* Gold glow from inside the vault, visible once the door swings open. */}
      <pointLight
        position={[0, 0, 2.1]}
        intensity={11}
        distance={9}
        decay={2}
        color={CARTEL_COLORS.gold}
      />

      {/* Low gold kicker that grazes the jar's gold base ring. */}
      <pointLight
        position={[0, -2.3, 1.4]}
        intensity={5}
        distance={6}
        decay={2}
        color={CARTEL_COLORS.goldDeep}
      />

      {/* A metal with metalness 1 shows almost nothing but its reflections, so
          the gold hardware NEEDS an environment to be visible at all. This one
          is built in-scene from lightformers and rendered to a cube target —
          no HDRI, no CDN fetch, nothing to fail offline or behind a proxy.
          It doubles as art direction: a warm gold key, a cold white rim and a
          low gold bounce, inside a near-black surround that keeps the blacks
          crushed instead of lifting the whole scene to grey. */}
      <StudioEnvironment intensity={0.9} />
      <AdaptiveDpr pixelated />
      <AdaptiveEvents />
      <Preload all />
    </>
  );
}

/* =====================================================================
   SCENE ROOT — applies the Phase 3 push-back
   ===================================================================== */

function VaultScene() {
  const materials = useCartelMaterials();
  const rootRef = useRef<THREE.Group>(null);

  useFrame((_state, delta) => {
    const dt = Math.min(delta, MAX_FRAME_DELTA);
    if (!rootRef.current) return;

    // Phase 3 retires the whole assembly behind the member-gate UI.
    const push = clamp(vaultScrollState.scenePushBack, 0, 1);
    rootRef.current.position.z = THREE.MathUtils.damp(
      rootRef.current.position.z,
      -push * 2.6,
      3,
      dt,
    );
    rootRef.current.position.y = THREE.MathUtils.damp(
      rootRef.current.position.y,
      -push * 0.45,
      3,
      dt,
    );
  });

  return (
    <>
      <SceneCameraAndLighting />
      <group ref={rootRef}>
        <VaultDoorAssembly materials={materials} />
        <DeconstructedJarAndBud materials={materials} />
      </group>
      {/* Vignette floor catching the gold key light. */}
      <mesh position={[0, -3.1, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[9, 48]} />
        <meshStandardMaterial
          color="#070707"
          roughness={0.88}
          metalness={0.3}
          envMapIntensity={0.3}
        />
      </mesh>
    </>
  );
}

/* =====================================================================
   CANVAS
   ===================================================================== */

export function CartelVaultCanvas() {
  const lowPower = useMemo(isLowPowerRenderer, []);

  return (
    <div className="canvas-layer" aria-hidden="true">
      <Canvas
        // Capped DPR keeps 10-13" POS tablets above 40fps; pinned to 1 with no
        // GPU, where every extra pixel is rasterised on the CPU.
        dpr={lowPower ? ([1, 1] as [number, number]) : DPR_RANGE}
        camera={{ position: [0, 0, CAMERA_Z_FAR], fov: 42, near: 0.1, far: 120 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
          stencil: false,
          depth: true,
        }}
        shadows={lowPower ? false : "soft"}
        // The HTML content layer owns all interaction; the canvas never
        // intercepts a click. Pointer coords still arrive for parallax.
        eventSource={typeof document !== 'undefined' ? document.body : undefined}
        eventPrefix="client"
        onCreated={({ gl, scene }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          scene.fog = new THREE.FogExp2('#050505', 0.055);
        }}
      >
        <Suspense fallback={null}>
          <VaultScene />
        </Suspense>
      </Canvas>
    </div>
  );
}

export default CartelVaultCanvas;
