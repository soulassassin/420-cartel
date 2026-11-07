'use client';

import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

/**
 * Form primitives: clinical-precision inputs on matte black, with a gold
 * hairline that only appears on focus. Labels are monospace eyebrows.
 */

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      'font-mono text-[0.625rem] uppercase tracking-[0.28em] text-muted-foreground',
      className,
    )}
    {...props}
  />
));
Label.displayName = 'Label';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'h-12 w-full border border-[color:var(--border-mono)] bg-surface px-4 text-base text-foreground transition-colors duration-300 ease-cartel',
        'placeholder:text-faint focus:border-gold focus:outline-none focus:shadow-gold-focus',
        'disabled:cursor-not-allowed disabled:opacity-40',
        'aria-[invalid=true]:border-destructive',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'min-h-24 w-full resize-y border border-[color:var(--border-mono)] bg-surface px-4 py-3 text-base text-foreground transition-colors duration-300 ease-cartel',
      'placeholder:text-faint focus:border-gold focus:outline-none focus:shadow-gold-focus',
      'cartel-scroll',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

/** Monospace numeric input for weights, volumes and money. */
export const NumericInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { suffix?: string }
>(({ className, suffix, ...props }, ref) => (
  <div className="relative">
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={cn(
        'h-12 w-full border border-[color:var(--border-mono)] bg-surface px-4 text-right font-mono text-lg tabular-nums text-foreground transition-colors duration-300 ease-cartel',
        'placeholder:text-faint focus:border-gold focus:outline-none focus:shadow-gold-focus',
        suffix ? 'pr-12' : '',
        className,
      )}
      {...props}
    />
    {suffix ? (
      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-mono text-sm text-gold">
        {suffix}
      </span>
    ) : null}
  </div>
));
NumericInput.displayName = 'NumericInput';

export interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={htmlFor}>
          {label}
          {required ? <span className="ml-1 text-gold">*</span> : null}
        </Label>
        {hint && !error ? (
          <span className="font-mono text-[0.625rem] text-faint">{hint}</span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p role="alert" className="font-mono text-[0.6875rem] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
