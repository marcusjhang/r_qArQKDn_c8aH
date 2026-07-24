import * as React from 'react';

import { cn } from '@/lib/utils';

/** Shared initials avatar circle; pass the initials as children, forwards span attributes. */
export const Avatar = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, children, ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      'flex-none inline-flex items-center justify-center w-[22px] h-[22px] rounded-full bg-primary-weak text-primary text-[9.5px] font-bold',
      className
    )}
    {...props}
  >
    {children}
  </span>
));
Avatar.displayName = 'Avatar';
