// Cache tags for the board's server-side Data Cache.
//
// The board renders on a single route (`/`) — there is no per-job URL segment
// to scope a `revalidatePath` against — so instead of a cache-wide
// `revalidatePath('/')`, the two reads in `queries.ts` are cached under these
// tags and each write in `actions.ts` invalidates only the tag(s) whose rows it
// actually changed. Because the server actions are the single write path for
// the board (see `actions.ts`), tag invalidation fully covers every mutation.

export const BOARD_TAGS = {
  jobs: 'board:jobs',
  candidates: 'board:candidates'
} as const;
