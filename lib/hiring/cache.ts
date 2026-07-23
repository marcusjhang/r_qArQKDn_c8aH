// Cache tags for the board's server-side Data Cache.
//
// The board renders on a single route (`/`) — there is no per-job URL segment
// to scope a `revalidatePath` against — so instead of a cache-wide
// `revalidatePath('/')`, every read in the service reader (`service/reader.ts`)
// is cached under one of these tags and each mutation invalidates only the
// tag(s) whose rows it
// actually changed. The tags cover two write surfaces:
//
//   • `jobs` / `candidates` — the board's own rows, written exclusively through
//     the server actions in `actions.ts`, which revalidate the matching tag.
//   • `users` / `sources` / `bands` — the lookup tables the pickers read from.
//     `sources` and `bands` are written only from `/settings`
//     (`app/(dashboard)/settings/actions.ts`); `users` (the owner/interviewer
//     list) is written from that same profile form and from the registration
//     path (`app/api/register`). Each of those sites revalidates the matching
//     tag here.
//
// Because those are the only write paths for the board's data, per-tag
// invalidation fully covers every mutation without a cache-wide
// `revalidatePath('/')`. No TTL is needed — a cache entry only goes stale when
// one of these sites changes its rows, and each does the invalidation.

export const BOARD_TAGS = {
  jobs: 'board:jobs',
  candidates: 'board:candidates',
  users: 'board:users',
  sources: 'board:sources',
  bands: 'board:bands'
} as const;
