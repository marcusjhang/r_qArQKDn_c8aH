# lib/hiring conventions

The hiring domain. Reads and writes cross clearly separated boundaries — respect
which side each module lives on.

## Read / write / client boundaries

- **Reads** go through the `service.ts` facade (`import 'server-only'`). It owns
  the UI-shaped DTOs (`Job`, `Candidate`, `Feedback`, `HiringState`) and projects
  them from the Drizzle rows with a compile-time conformance guard, so the DTOs
  never drift from the schema. Reads are expressed against an injectable
  `BoardReader` (production default is Drizzle-backed; tests pass an in-memory
  fake). No ORM types cross this line.
- **Writes** go through the `'use server'` actions in `actions/**` (split by
  entity behind `actions/index.ts`), each parsing input with a zod schema from
  `schemas.ts` (`server-only`) before touching the DB. They do **not** revalidate
  any server cache — the board is uncached and TanStack Query is the client's
  only cache, so the store resyncs itself on a failed write. See the
  **server-actions** skill for the full optimistic-store → action →
  resync-on-failure recipe.
- **Client state** is backed by **TanStack Query** (`QueryClientProvider` in the
  root layout). Server truth lives in the query cache, seeded from RSC props via
  `initialData`. `store.ts` (`useHiringStore`) holds the board cache and applies
  optimistic updates by running the pure `reducer.ts` events straight into the
  cache (`setQueryData`), with temp-id reconciliation for creates; a failed write
  resyncs by invalidating the board query (refetch via the `fetchBoard` action in
  `board-query.ts`). The optimistic-sync mechanics — temp-id counter, the
  reconcile queue (`whenReconciled`/`flushPending`), the single persist
  `useMutation`, and `resync` — are factored out of the store into `sync.ts`
  (`useOptimisticSync`), so `store.ts` stays the cache wiring plus the action
  definitions. Query keys are centralized in `query-keys.ts`. Client code
  imports from the `index.ts` barrel (`@/lib/hiring`), never from
  `service.ts`/`schemas.ts`. The chat thread (`useChatThread`) and the
  notification bell use `useQuery`/`useMutation` the same way.

## Where logic goes

- Pure, framework-free rules (status/stage placement, stage-array edits,
  validation, filter/sort, board-view derivations) live in `helpers/` (split by
  concern — users, profile-urls, mentions, seniority, candidate-draft,
  candidate-status, stages, board-view — behind the `helpers/index.ts` barrel)
  and are unit-tested. Put new business rules in the matching module — not
  inline in an action, `store.ts`, or a component — so they stay testable and
  shared across layers.
- `primitives.ts` = the `Status` / `RatingValue` literal unions and their
  arrays; `config.ts` = `FOUNDERS`, `SOURCES`, and other static config. zod
  schemas and DTOs are built from these single sources — extend the source, not
  a duplicate list.
- `seed.ts` = demo data. The board's reads are deliberately uncached (no
  server-side Data Cache / `unstable_cache`): TanStack Query is the single
  caching layer, so actions mutate Postgres and never `revalidateTag`.
- Chat logic is split by concern behind the `chat-logic.ts` barrel:
  `chat-messages.ts` (the per-candidate thread — `loadThreadWith`,
  `postMessageWith`), `chat-notifications.ts` (the mention inbox read/writes),
  and `chat-shaping.ts` (the shared `toChatMessage` shaper, `currentUserId`, and
  the body/mention validators). All are `server-only` and expressed against the
  injectable `ChatStore` seam (`chat-store.ts`); the `'use server'` adapters live
  in `chat-actions.ts` and the server read in `chat-queries.ts`. Callers import
  from `@/lib/hiring/chat-logic`, unchanged by the split.

## Barrel (`index.ts`)

Re-exports only client-safe modules (`config`, `helpers`, `types`, `store`).
`service/`/`schemas.ts` are excluded (`server-only`) and `actions/` is imported
directly by the store to avoid a cycle — keep it that way.

For schema/read details see the **drizzle** skill; for the write path see the
**server-actions** skill.
