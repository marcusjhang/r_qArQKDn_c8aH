import * as React from 'react';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * The "✕" close control shared by the modal header and the candidate detail
 * drawer header (a round 30px button). Defaults `type="button"` (so it never
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
    className={cn(
      'inline-flex items-center justify-center flex-none w-[30px] h-[30px] rounded-full bg-surface-2 text-muted-foreground hover:bg-border hover:text-foreground',
      className
    )}
    {...props}
  >
    <X size={16} aria-hidden />
  </button>
));
CloseButton.displayName = 'CloseButton';
