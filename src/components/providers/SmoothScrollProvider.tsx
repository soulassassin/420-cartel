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
 * Lenis is instantiated directly rather than through `<ReactLenis>` on purpose.
 * The React wrapper keeps its Lenis instance in component STATE and publishes
 * it through `useImperativeHandle`, so `ref.current.lenis` is still
 * `undefined` during the commit in which this provider's own effect runs — the
 * ref only fills in on the render after `setLenis`. Reading it there and
 * bailing out on a falsy value (which is what this file used to do) meant
 * `gsap.ticker` never got the raf callback. With `autoRaf: false` that is
 * fatal, not cosmetic: Lenis swallows every wheel and touch event, nothing
 * ever advances its animation, and the page stops scrolling altogether —
 * taking the entire ScrollTrigger timeline, and therefore the whole 3D vault
 * choreography, down with it.
 *
 * Honours `prefers-reduced-motion` by handing control back to native scrolling
 * instead of mounting Lenis at all.
 */

import React, { useEffect, useState } from 'react';
import Lenis from 'lenis';
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
  // `null` until the media query has been read. Starting at `false` would mean
  // a reduced-motion visitor still gets a Lenis instance built and torn down
  // again one commit later, taking a pointless ScrollTrigger.refresh with it.
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);

  useEffect(() => {
    const media = window.matchMedia(REDUCED_MOTION_QUERY);
    setReducedMotion(media.matches);

    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (reducedMotion === null) return;

    if (reducedMotion) {
      // Native scrolling is in charge. ScrollTrigger already defaults to the
      // window as its scroller, so it needs no proxy here — registering one
      // without scrollTop/getBoundingClientRect would leave it unable to read
      // the scroll position at all, and the timeline would never advance.
      ScrollTrigger.refresh();
      return;
    }

    const lenis = new Lenis({
      // autoRaf off: gsap.ticker below is the single source of frames.
      autoRaf: false,
      // `lerp` and `duration` are mutually exclusive in Lenis and lerp wins,
      // so only lerp is set — a low value for the heavy, weighted feel the
      // vault needs.
      lerp: 0.085,
      wheelMultiplier: 0.95,
      touchMultiplier: 1.6,
      smoothWheel: true,
      syncTouch: false,
      gestureOrientation: 'vertical',
      orientation: 'vertical',
    });

    // Lenis ticks on GSAP's clock. gsap.ticker hands out seconds; Lenis wants ms.
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    // Every Lenis scroll frame invalidates ScrollTrigger's cached positions.
    const onScroll = () => ScrollTrigger.update();
    lenis.on('scroll', onScroll);

    // Lenis rewrites the root element's height rules as it boots, so the
    // measurements ScrollTrigger took during the layout phase are already
    // stale. Refresh once now and once on the next frame, after Lenis' own
    // styles have landed.
    ScrollTrigger.refresh();
    const refreshFrame = requestAnimationFrame(() => ScrollTrigger.refresh());

    return () => {
      cancelAnimationFrame(refreshFrame);
      lenis.off('scroll', onScroll);
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);
      lenis.destroy();
    };
  }, [reducedMotion]);

  return <>{children}</>;
}

export default SmoothScrollProvider;
