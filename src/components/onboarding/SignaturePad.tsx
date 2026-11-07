'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CARTEL_COLORS } from '@/lib/brand';

/**
 * Signature capture for the digital membership agreement.
 *
 * Pointer events cover mouse, pen and touch with one code path. The canvas is
 * sized to its own device pixel ratio so a signature drawn on a tablet is not
 * a blurry upscale, and the exported PNG is flattened onto white so it stays
 * legible in a printed agreement.
 */
export function SignaturePad({
  name = 'signature',
  onChange,
}: {
  name?: string;
  onChange?: (hasSignature: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const dirtyRef = useRef(false);
  const [dataUrl, setDataUrl] = useState('');

  const prepareCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();

    canvas.width = Math.floor(rect.width * ratio);
    canvas.height = Math.floor(rect.height * ratio);

    const context = canvas.getContext('2d');
    if (!context) return;

    context.scale(ratio, ratio);
    context.lineWidth = 2.1;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = CARTEL_COLORS.goldBright;
  }, []);

  useEffect(() => {
    prepareCanvas();
    const onResize = () => {
      // Resizing clears the bitmap, so the signature must be re-taken.
      prepareCanvas();
      dirtyRef.current = false;
      setDataUrl('');
      onChange?.(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [prepareCanvas, onChange]);

  function pointFrom(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function handleDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;
    // Capture the pointer so a stroke that leaves the panel still tracks.
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const { x, y } = pointFrom(event);
    context.beginPath();
    context.moveTo(x, y);
  }

  function handleMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;
    const { x, y } = pointFrom(event);
    context.lineTo(x, y);
    context.stroke();
    dirtyRef.current = true;
  }

  function handleUp(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    commit();
  }

  /** Flatten onto white so the stored PNG prints legibly. */
  function commit() {
    const canvas = canvasRef.current;
    if (!canvas || !dirtyRef.current) return;

    const flattened = document.createElement('canvas');
    flattened.width = canvas.width;
    flattened.height = canvas.height;
    const context = flattened.getContext('2d');
    if (!context) return;

    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, flattened.width, flattened.height);
    // Re-draw the gold stroke as near-black ink for the record copy.
    context.globalCompositeOperation = 'source-over';
    context.filter = 'grayscale(1) brightness(0.15)';
    context.drawImage(canvas, 0, 0);

    setDataUrl(flattened.toDataURL('image/png'));
    onChange?.(true);
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    dirtyRef.current = false;
    setDataUrl('');
    onChange?.(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative border border-hairline bg-void">
        <canvas
          ref={canvasRef}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerLeave={handleUp}
          className="h-44 w-full touch-none"
          aria-label="Signature panel. Draw your signature using your finger, pen or mouse."
          role="img"
        />
        {/* Signature baseline. */}
        <div className="pointer-events-none absolute inset-x-6 bottom-10 h-px bg-[color:var(--border-mono)]" />
        {!dataUrl ? (
          <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center font-mono text-[0.5625rem] uppercase tracking-[0.3em] text-faint">
            Sign above
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-4">
        <p className="font-mono text-[0.5625rem] uppercase tracking-[0.22em] text-faint">
          {dataUrl ? 'Signature captured' : 'Awaiting signature'}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={!dataUrl}>
          <Eraser />
          Clear
        </Button>
      </div>

      <input type="hidden" name={name} value={dataUrl} />
    </div>
  );
}
