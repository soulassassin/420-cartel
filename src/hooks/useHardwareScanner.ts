'use client';

import { useEffect, useRef } from 'react';

/**
 * 420 CARTEL :: global hardware scanner listener (Module 5)
 *
 * A USB or Bluetooth 2D scanner is a keyboard. It types a whole code in a few
 * milliseconds and finishes with Enter, which is exactly how we tell it apart
 * from a budtender typing: a human cannot sustain sub-35ms gaps between every
 * keystroke of an 8+ character code.
 *
 * The listener is global (document-level, capture phase) so the cashier never
 * has to focus a field first — scan a member pass or a product barcode at any
 * point in the ticket and it lands.
 *
 * Two code shapes are routed differently:
 *   CARTEL-XXXX or a bare UUID  -> member pass, attach the profile
 *   anything else               -> product barcode, add to the ticket
 *
 * Typing into an input is never hijacked: a burst that begins inside a text
 * field is left alone unless it is unmistakably a scan, because the cashier may
 * well be typing a member's phone number into the lookup box.
 */

/** A member pass: the printed code, or the opaque QR token (a UUID). */
const MEMBER_CODE_PATTERN = /^CARTEL-[A-Z0-9-]{3,20}$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ScanKind = 'MEMBER' | 'PRODUCT';

export interface ScanEvent {
  kind: ScanKind;
  /** The decoded payload, trimmed and upper-cased for member codes. */
  value: string;
  /** Mean gap between keystrokes, in ms — useful for a diagnostics readout. */
  averageGapMs: number;
  /** True when the burst started while a text input had focus. */
  fromInput: boolean;
}

export interface HardwareScannerOptions {
  /** Max gap between keystrokes for the burst to count as a scan. */
  maxKeystrokeGapMs?: number;
  /** Shortest payload treated as a scan. Guards against stray Enter presses. */
  minLength?: number;
  /** Set false to suspend the listener (e.g. while a modal owns the keyboard). */
  enabled?: boolean;
  onScan: (event: ScanEvent) => void;
  /** Called when a burst looks like a scan but is too short to use. */
  onReject?: (buffer: string) => void;
}

export function classifyScan(value: string): ScanKind {
  const trimmed = value.trim();
  return MEMBER_CODE_PATTERN.test(trimmed) || UUID_PATTERN.test(trimmed)
    ? 'MEMBER'
    : 'PRODUCT';
}

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;

  const type = (target as HTMLInputElement).type;
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range'].includes(type);
}

export function useHardwareScanner(options: HardwareScannerOptions): void {
  const {
    maxKeystrokeGapMs = 35,
    minLength = 4,
    enabled = true,
    onScan,
    onReject,
  } = options;

  // Handlers live in refs so the listener is attached once, not per render —
  // a re-attach mid-scan would split one burst across two buffers.
  const onScanRef = useRef(onScan);
  const onRejectRef = useRef(onReject);

  useEffect(() => {
    onScanRef.current = onScan;
    onRejectRef.current = onReject;
  }, [onScan, onReject]);

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;

    let buffer = '';
    let lastKeyAt = 0;
    let gapTotal = 0;
    let gapCount = 0;
    let startedInInput = false;

    const reset = () => {
      buffer = '';
      gapTotal = 0;
      gapCount = 0;
      startedInInput = false;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      // A scanner sends no modifiers. A human shortcut (Ctrl+P) is not a scan.
      if (event.ctrlKey || event.metaKey || event.altKey) {
        reset();
        return;
      }

      const now = event.timeStamp || performance.now();
      const gap = lastKeyAt === 0 ? Number.POSITIVE_INFINITY : now - lastKeyAt;
      lastKeyAt = now;

      if (event.key === 'Enter') {
        const payload = buffer.trim();
        const fast = gapCount > 0 && gapTotal / gapCount <= maxKeystrokeGapMs;

        // Enter on a human-typed form field must still submit the form.
        if (!fast || payload.length < minLength) {
          if (fast && payload.length > 0) onRejectRef.current?.(payload);
          reset();
          return;
        }

        const kind = classifyScan(payload);

        // The scan is ours: stop the Enter from also submitting a form.
        event.preventDefault();
        event.stopPropagation();

        onScanRef.current({
          kind,
          value: kind === 'MEMBER' ? payload.toUpperCase() : payload,
          averageGapMs: Math.round(gapTotal / gapCount),
          fromInput: startedInInput,
        });

        reset();
        return;
      }

      // Only printable single characters form a code.
      if (event.key.length !== 1) {
        if (event.key !== 'Shift') reset();
        return;
      }

      // Too slow: this is a person typing. Start a fresh buffer from this key.
      if (gap > maxKeystrokeGapMs) {
        buffer = event.key;
        gapTotal = 0;
        gapCount = 0;
        startedInInput = isTextEntry(event.target);
        return;
      }

      if (buffer.length === 0) startedInInput = isTextEntry(event.target);
      buffer += event.key;
      gapTotal += gap;
      gapCount += 1;
    };

    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [enabled, maxKeystrokeGapMs, minLength]);
}

export default useHardwareScanner;
