import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Surface and data-display primitives: obsidian cards, gold hairline badges,
 * monospace stat readouts and section scaffolding.
 */

export function Card({
  className,
  interactive = false,
  active = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean; active?: boolean }) {
  return (
    <div
      data-active={active || undefined}
      className={cn(
        'bg-surface transition-colors duration-200',
        interactive ? 'hairline-active cursor-pointer hover:border-gold/40' : 'border border-hairline',
        active && 'border-gold',
        className,
      )}
      {...props}
    />
  );
}

export function GlassPanel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('glass-panel', className)} {...props} />;
}

const BADGE_TONES = {
  gold: 'border-gold/40 bg-gold/5 text-gold',
  mono: 'border-ash text-ash',
  live: 'border-foreground text-foreground',
  warn: 'border-foreground text-foreground',
  danger: 'border-foreground text-foreground',
} as const;

export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({
  tone = 'mono',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 border px-2 py-0.5 text-xs sm:text-sm font-mono',
        BADGE_TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

/** A monospace figure with its unit — the house style for g / ml / THC %. */
export function Stat({
  label,
  value,
  unit,
  tone = 'default',
  className,
}: {
  label: string;
  value: string | number;
  unit?: string;
  tone?: 'default' | 'gold' | 'muted';
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-0.5 sm:gap-1', className)}>
      <span className="font-mono text-xs sm:type-ui text-ash">
        {label}
      </span>
      <span
        className={cn(
          'font-mono text-lg sm:text-xl tabular-nums leading-none',
          tone === 'gold' && 'text-gold',
          tone === 'muted' && 'text-ash',
        )}
      >
        {value}
        {unit ? <span className="ml-1 text-xs sm:type-ui text-ash">{unit}</span> : null}
      </span>
    </div>
  );
}

export function Eyebrow({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('eyebrow', className)} {...props} />;
}

export function Separator({
  className,
  orientation = 'horizontal',
}: {
  className?: string;
  orientation?: 'horizontal' | 'vertical';
}) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        'bg-[color:var(--border-mono)]',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
    />
  );
}

/** Hairline rule with a centred monospace caption. */
export function CaptionRule({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <Separator className="flex-1" />
      <span className="font-mono type-ui text-ash">
        {children}
      </span>
      <Separator className="flex-1" />
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 border border-dashed border-[color:var(--border-mono)] px-6 py-16 text-center',
        className,
      )}
    >
      <p className="font-display text-lg uppercase ">{title}</p>
      <p className="max-w-sm type-ui text-ash">{description}</p>
      {action}
    </div>
  );
}

/** Full-bleed scroll section that sits above the persistent canvas. */
export function Section({
  id,
  className,
  children,
  minHeight = 'min-h-screen',
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
  minHeight?: string;
}) {
  return (
    <section id={id} className={cn('content-layer relative w-full', minHeight, className)}>
      {children}
    </section>
  );
}
