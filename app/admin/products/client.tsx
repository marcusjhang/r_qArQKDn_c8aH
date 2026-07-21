'use client';

import { Button } from '@/components/ui/button';
import { deleteProduct } from '../actions';
import { useTransition } from 'react';

export function ProductDeleteButton({
  id,
  name
}: {
  id: number;
  name: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      className="text-red-400 hover:text-red-300 hover:bg-red-950/50 h-7 px-2 text-xs"
      onClick={() => {
        if (!confirm(`Delete product "${name}"?`)) return;
        startTransition(() => {
          deleteProduct(id);
        });
      }}
    >
      {pending ? '...' : 'Delete'}
    </Button>
  );
}
