'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Brutalist luxury button. Sharp corners, wide tracking, and a 1px gold
 * hairline that ignites on hover — never a pill, never a soft shadow.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-mono text-[0.6875rem] uppercase tracking-[0.22em] transition-all duration-300 ease-cartel disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:shadow-gold-focus [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // The primary call to action: solid gold, black type.
        gold: 'bg-gold text-void hover:bg-gold-bright active:translate-y-px',
        // The default: black surface, gold hairline on hover.
        outline:
          'border border-[color:var(--border-mono)] bg-transparent text-foreground hover:border-gold hover:text-gold',
        // Already-active / selected state in a group.
        active: 'border border-gold bg-gold/10 text-gold shadow-gold-hairline',
        ghost: 'bg-transparent text-muted-foreground hover:text-gold',
        surface:
          'border border-hairline bg-surface text-foreground hover:border-gold hover:bg-elevated',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/85',
      },
      size: {
        sm: 'h-9 px-4',
        default: 'h-11 px-6',
        lg: 'h-14 px-9 text-[0.75rem] tracking-[0.26em]',
        // Tablet POS targets: never below 56px of touch area.
        till: 'h-16 px-5 text-[0.8125rem]',
        icon: 'h-11 w-11 px-0',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'outline', size: 'default', block: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, asChild = false, ...props }, ref) => {
    const Component = asChild ? Slot : 'button';
    return (
      <Component
        ref={ref}
        className={cn(buttonVariants({ variant, size, block }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
