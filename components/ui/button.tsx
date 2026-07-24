import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// Design-system button (Tailwind design tokens). Used across the whole app —
// the shadcn-styled surfaces (auth pages, dashboard error boundary) via the
// default variants, and the board's own look via the `app`/`appPrimary`
// variants below.
const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:
          'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

// App-native button vocabulary for the hiring UI: `app` is the neutral bordered
// button, `appPrimary` the filled primary. Their look is the former `.btn` /
// `.btn.primary` design, now expressed directly in Tailwind utilities against
// the shared theme tokens so the whole app is a single Tailwind design system.
const APP_BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-[7px] text-[13px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';
const appButtonVariants = {
  app: `${APP_BUTTON_BASE} border border-border-strong bg-surface text-foreground hover:bg-surface-2`,
  appPrimary: `${APP_BUTTON_BASE} border border-primary bg-primary text-primary-foreground hover:brightness-105`
} as const;

type DesignVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
type AppVariant = keyof typeof appButtonVariants;

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    Omit<VariantProps<typeof buttonVariants>, 'variant'> {
  /** Design-system variant, or an app-native hiring-shell variant. */
  variant?: DesignVariant | AppVariant;
  asChild?: boolean;
  formAction?: any;
}

function isAppVariant(
  variant: ButtonProps['variant']
): variant is AppVariant {
  return variant === 'app' || variant === 'appPrimary';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    const classes = isAppVariant(variant)
      ? cn(appButtonVariants[variant], className)
      : cn(buttonVariants({ variant, size, className }));
    return <Comp className={classes} ref={ref} {...props} />;
  }
);
Button.displayName = 'Button';

export { Button };
