import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * The initials "avatar" circle shared across the board card, chat thread,
 * feedback list, members list and the profile preview. Renders the app's
 * `.avatar` visual (styled in `components/hiring/hiring.css`, scoped to
 * `.ht-root`) — pass the initials as children and forward any span attributes
 * (`title`, `aria-hidden`, …) the call site needs.
 */
export const Avatar = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, children, ...props }, ref) => (
  <span ref={ref} className={cn('avatar', className)} {...props}>
    {children}
  </span>
));
Avatar.displayName = 'Avatar';
