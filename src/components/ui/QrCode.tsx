'use client';

import { useMemo } from 'react';
import QRCode from 'qrcode';
import { cn } from '@/lib/utils';

/**
 * Deterministic inline-SVG QR code.
 *
 * `qrcode.create()` is synchronous and returns the raw bit matrix, so the code
 * is rendered as vector paths in the same paint as the rest of the card — no
 * canvas, no data URI, and no external image service that could fail or leak
 * a member code to a third party. The same component prints crisply on the
 * 80mm thermal receipt at any scale.
 */

export interface QrCodeProps {
  value: string;
  /** Rendered edge length in CSS pixels. */
  size?: number;
  /** Quiet-zone width in modules. The spec requires 4; 2 is fine on screen. */
  margin?: number;
  dark?: string;
  light?: string;
  className?: string;
  title?: string;
}

export function QrCode({
  value,
  size = 160,
  margin = 2,
  dark = '#050505',
  light = '#FFFFFF',
  className,
  title,
}: QrCodeProps) {
  const svg = useMemo(() => {
    try {
      // 'M' recovers from ~15% damage — the right trade-off for a phone screen
      // held under a counter-top scanner.
      const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
      const count = qr.modules.size;
      const data = qr.modules.data;
      const total = count + margin * 2;

      // One path for every dark module, emitted as a single `d` string.
      let path = '';
      for (let row = 0; row < count; row += 1) {
        for (let column = 0; column < count; column += 1) {
          if (data[row * count + column]) {
            path += `M${column + margin} ${row + margin}h1v1h-1z`;
          }
        }
      }
      return { path, total };
    } catch {
      return null;
    }
  }, [value, margin]);

  if (!svg) {
    return (
      <div
        role="img"
        aria-label="QR code unavailable"
        className={cn(
          'flex items-center justify-center border border-dashed border-[color:var(--border-mono)] font-mono text-[0.5rem] uppercase tracking-widest text-faint',
          className,
        )}
        style={{ width: size, height: size }}
      >
        No Code
      </div>
    );
  }

  return (
    <svg
      role="img"
      aria-label={title ?? `QR code for ${value}`}
      viewBox={`0 0 ${svg.total} ${svg.total}`}
      width={size}
      height={size}
      // Keeps module edges hard instead of antialiased to grey at small sizes.
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={svg.total} height={svg.total} fill={light} />
      <path d={svg.path} fill={dark} />
    </svg>
  );
}
