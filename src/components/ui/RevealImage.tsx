'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** True once the element has scrolled into view. Fires a single time. */
function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, inView };
}

/**
 * Product photo that reveals once as it scrolls into view. The parent must
 * clip it with `overflow-hidden` so the 110% start scale stays inside the tile.
 */
export function RevealImage({ src, alt }: { src: string; alt: string }) {
  const { ref, inView } = useInView<HTMLImageElement>();

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt={alt}
      className={cn('reveal-img size-full object-cover', inView && 'is-in')}
    />
  );
}

/**
 * Fades a block of content up once as it scrolls into view. Pass `delay` (ms)
 * to stagger siblings, e.g. `delay={index * 120}` across a row of cards.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={cn('reveal', inView && 'is-in', className)}
      style={delay ? ({ '--reveal-delay': `${delay}ms` } as CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}
