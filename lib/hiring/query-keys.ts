// Central registry of TanStack Query keys for the hiring module, so reads and the mutations that invalidate them can't drift. Client-safe (no server imports).

export const hiringKeys = {
  /** The whole board (jobs + candidates + users/sources/bands). */
  board: ['hiring', 'board'] as const,
  /** The signed-in user's mention notification inbox. */
  notifications: ['hiring', 'notifications'] as const,
  /** One candidate's discussion thread. */
  chat: (candidateId: number) => ['hiring', 'chat', candidateId] as const
} as const;
