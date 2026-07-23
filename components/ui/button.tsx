import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// Design-system button (Tailwind design tokens). Rendered outside the hiring
// shell — e.g. the auth pages (/login, /change-password) and the dashboard
// error boundary — which paint on the shadcn theme rather than inside
// `.ht-root`.
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

// App-native button vocabulary for the hiring shell (rendered inside
// `.ht-root`). These map to the `.ht-root .btn` / `.btn.primary` rules in
// components/hiring/hiring.css, so the existing visual design is preserved
// exactly — this centralizes the `btn` / `btn primary` class strings that were
// otherwise copy-pasted across the hiring, members and settings components.
// They deliberately emit ONLY the shell classes (no design-system base), so the
// shell CSS owns their look and geometry.
const appButtonVariants = {
  app: 'btn',
  appPrimary: 'btn primary'
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
