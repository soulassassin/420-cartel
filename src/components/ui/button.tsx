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
  'inline-flex items-center justify-center gap-2 whitespace-nowrap type-ui disabled:pointer-events-none disabled:text-ash [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        gold: ghost,
        outline: ghost,
        active: `${ghost} underline`,
        ghost: 'bg-transparent text-ash underline-offset-4 decoration-1 decoration-ash hover:text-foreground hover:underline',
        surface: ghost,
        destructive: ghost,
      },
      size: {
        sm: 'h-9 px-0',
        default: 'h-11 px-0',
        lg: 'h-14 px-0',
        // Tablet POS targets keep 64px of touch area and a white hairline.
        till: 'h-16 border border-foreground px-5',
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
