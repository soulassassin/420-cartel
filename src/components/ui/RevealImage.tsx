'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Image from 'next/image';
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

/** Hosts next/image is configured to resize (see `images.remotePatterns`). */
const OPTIMISABLE_HOST = /^https:\/\/([a-z0-9-]+\.supabase\.co|cdn\.higgsfield\.ai|storage\.googleapis\.com)\//i;

/**
 * Product photo that reveals once as it scrolls into view. The parent must be
 * positioned and clip it with `overflow-hidden`, so the image can fill it and
 * the 110% start scale stays inside the tile.
 *
 * It goes through next/image, so the browser gets a file sized for the slot
 * (`sizes`) in AVIF or WebP rather than the 1200px original, and anything
 * below the fold is not requested until it is scrolled near. A URL from a host
 * the optimiser is not configured for falls back to a plain lazy <img>.
 */
export function RevealImage({
  src,
  alt,
  sizes = '(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw',
  eager = false,
}: {
  src: string;
  alt: string;
  /** How wide the slot is at each breakpoint; decides which file is fetched. */
  sizes?: string;
  /** Load straight away. Only for an image that is on screen at first paint. */
  eager?: boolean;
}) {
  const { ref, inView } = useInView<HTMLImageElement>();
  const className = cn('reveal-img size-full object-cover', inView && 'is-in');

  if (src.startsWith('/') || OPTIMISABLE_HOST.test(src)) {
    return (
      <Image
        ref={ref}
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        loading={eager ? 'eager' : 'lazy'}
        className={className}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={cn(className, 'absolute inset-0')}
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
