'use client';

import { useEffect, useRef } from 'react';

/**
 * Looping video of a whole cannabis plant, buds to hanging roots, on black.
 * The first and last frames are the same photo, so the loop is seamless.
 *
 * Only the leaves and branches move; the stem and roots stay still. It plays
 * even with reduced motion on, since it is a gentle in-place leaf flutter
 * with no camera or whole-plant movement.
 */
export function PlantLoop({ className }: { className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // React does not render the `muted` attribute into server HTML, so Chrome
  // can refuse to autoplay. Set it on the element and start playback here.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    void video.play().catch(() => {});
  }, []);

  return (
    <video
      ref={videoRef}
      aria-hidden="true"
      className={className}
      src="/products/plant.mp4?v=2"
      poster="/products/plant-poster.webp?v=2"
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
    />
  );
}
