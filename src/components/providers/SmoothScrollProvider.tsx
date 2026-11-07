'use client';

/**
 * 420 CARTEL :: Smooth scroll spine
 *
 * Lenis owns the scroll position; GSAP's ScrollTrigger reads it. If the two
 * run on independent clocks the vault choreography judders, so Lenis is driven
 * off `gsap.ticker` and `ScrollTrigger.update` is fired from Lenis' own scroll
 * event. That makes every scroll-linked value in `vaultScrollState` resolve on
 * the same frame as the paint that uses it.
 *
 * Honours `prefers-reduced-motion` by handing control back to native scrolling
 * instead of mounting Lenis at all.
 */

import React, { useEffect, useRef, useState } from 'react';
import { ReactLenis, type LenisRef } from 'lenis/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

export interface SmoothScrollProviderProps {
  children: React.ReactNode;
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function SmoothScrollProvider({ children }: SmoothScrollProviderProps) {
  const lenisRef = useRef<LenisRef>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(REDUCED_MOTION_QUERY);
    setReducedMotion(media.matches);

    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      // Native scrolling is in charge; ScrollTrigger listens to the window.
      ScrollTrigger.scrollerProxy(document.body, {});
      ScrollTrigger.refresh();
      return;
    }

    const lenis = lenisRef.current?.lenis;
    if (!lenis) return;

    // Lenis ticks on GSAP's clock. gsap.ticker hands out seconds; Lenis wants ms.
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    // Every Lenis scroll frame invalidates ScrollTrigger's cached positions.
    const onScroll = () => ScrollTrigger.update();
    lenis.on('scroll', onScroll);

    ScrollTrigger.refresh();

    return () => {
      lenis.off('scroll', onScroll);
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);
    };
  }, [reducedMotion]);

  if (reducedMotion) {
    return <>{children}</>;
  }

  return (
    <ReactLenis
      root
      ref={lenisRef}
      options={{
        // autoRaf off: gsap.ticker above is the single source of frames.
        autoRaf: false,
        duration: 1.15,
        lerp: 0.085,
        wheelMultiplier: 0.95,
        touchMultiplier: 1.6,
        smoothWheel: true,
        syncTouch: false,
        gestureOrientation: 'vertical',
        orientation: 'vertical',
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      }}
    >
      {children}
    </ReactLenis>
  );
}

export default SmoothScrollProvider;
