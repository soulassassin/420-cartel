'use client';

import { useEffect, useRef } from 'react';

/**
 * Counts up to `value` once, the first time it scrolls into view.
 *
 * The final value is what the server renders, so it is correct without
 * JavaScript and with reduced motion on. The width of the final value is
 * reserved, so the count never shifts the layout around it.
 */
export function CountUp({ value, duration = 1200 }: { value: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();

        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 4);
          element.textContent = String(Math.round(value * eased));
          if (progress < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    observer.observe(element);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      element.textContent = String(value);
    };
  }, [value, duration]);

  return (
    <span className="relative inline-block">
      {/* Invisible copy of the final value holds the width. */}
      <span aria-hidden="true" className="invisible">
        {value}
      </span>
      <span ref={ref} className="absolute left-0 top-0">
        {value}
      </span>
    </span>
  );
}
