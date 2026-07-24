import * as React from 'react';

import { cn } from '@/lib/utils';

export interface FormErrorProps {
  /** The message to show; when falsy the component renders nothing. */
  message?: string | null | false;
  className?: string;
}

/** Inline form-error text; renders nothing when there is no message. */
export function FormError({ message, className }: FormErrorProps) {
  if (!message) return null;
  return (
    <div className={cn('text-xs text-sno', className)}>{message}</div>
  );
}
