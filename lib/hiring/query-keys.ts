// Central registry of TanStack Query keys for the hiring module.
//
// One place to author the cache keys so the queries that read a slice and the
// mutations that invalidate it can never drift apart. Client-safe (no server
// imports): the store, the chat thread hook, and the notification bell all
// import from here.

export const hiringKeys = {
  /** The whole board (jobs + candidates + users/sources/bands). */
  board: ['hiring', 'board'] as const,
  /** The signed-in user's mention notification inbox. */
  notifications: ['hiring', 'notifications'] as const,
  /** One candidate's discussion thread. */
  chat: (candidateId: number) => ['hiring', 'chat', candidateId] as const
} as const;
