'use client';

import { Button } from '@/components/ui/button';
import { deleteUser, updateUserRole } from '../actions';
import { useTransition } from 'react';

export function DeleteButton({
  type,
  id,
  label
}: {
  type: 'user' | 'product';
  id: number;
  label: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      className="text-red-400 hover:text-red-300 hover:bg-red-950/50 h-7 px-2 text-xs"
      onClick={() => {
        if (!confirm(`Delete ${type} "${label}"?`)) return;
        startTransition(() => {
          if (type === 'user') deleteUser(id);
        });
      }}
    >
      {pending ? '...' : 'Delete'}
    </Button>
  );
}

export function RoleToggle({
  userId,
  currentRole
}: {
  userId: number;
  currentRole: string;
}) {
  const [pending, startTransition] = useTransition();
  const nextRole = currentRole === 'admin' ? 'user' : 'admin';

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      className="text-slate-400 hover:text-slate-200 hover:bg-slate-800 h-7 px-2 text-xs"
      onClick={() => {
        startTransition(() => {
          updateUserRole(userId, nextRole);
        });
      }}
    >
      {pending ? '...' : `Make ${nextRole}`}
    </Button>
  );
}
