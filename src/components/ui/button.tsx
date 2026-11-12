'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Every action is a ghost link: white type on black, no fill, with a 1px grey
 * underline on hover. Variant names are kept so call sites stay unchanged.
 */
const ghost =
  'bg-transparent text-foreground underline-offset-4 decoration-1 decoration-ash hover:underline';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap active:scale-[0.97] transition-[color,background-color,border-color,transform,box-shadow] duration-150 ease-out disabled:pointer-events-none disabled:text-ash [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        gold: 'border border-gold/40 bg-gold/10 text-gold hover:bg-gold/20 hover:border-gold/70 hover:shadow-gold-glow active:bg-gold/25 px-4',
        outline: 'border border-white/20 text-foreground hover:border-gold/50 hover:text-gold active:bg-white/5 px-4',
        active: 'border border-gold bg-gold/15 text-gold shadow-gold-glow px-4',
        ghost: 'bg-transparent text-ash underline-offset-4 decoration-1 decoration-ash hover:text-foreground hover:underline px-0',
        surface: 'border border-border-subtle bg-surface text-foreground hover:border-gold/40 hover:text-gold px-4',
        destructive: 'border border-red-500/40 text-red-400 hover:bg-red-500/10 hover:border-red-500 px-4',
      },
      size: {
        sm: 'h-9 text-xs sm:text-sm px-3',
        default: 'h-11 text-sm sm:type-ui px-4',
        lg: 'h-14 text-sm sm:type-ui px-6',
        // Tablet POS targets keep 64px of touch area and a white hairline.
        till: 'h-16 border border-foreground px-5 text-base sm:type-ui',
        icon: 'h-11 w-11 !px-0',
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
