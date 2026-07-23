import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * The "✕" close control shared by the modal header and the candidate detail
 * drawer header (the `.close` button). Defaults `type="button"` (so it never
 * submits a surrounding form) and `aria-label="Close"`; both are overridable
 * via props.
 */
export const CloseButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-label="Close"
    className={cn('close', className)}
    {...props}
  >
    ✕
  </button>
));
CloseButton.displayName = 'CloseButton';
