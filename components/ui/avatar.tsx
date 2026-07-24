import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * The initials "avatar" circle shared across the board card, chat thread,
 * feedback list, members list and the profile preview. A 22px primary-weak
 * circle with bold primary-tinted initials — pass the initials as children and
 * forward any span attributes (`title`, `aria-hidden`, …) the call site needs.
 */
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
