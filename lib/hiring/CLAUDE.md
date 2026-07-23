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
- **Writes** go through the `'use server'` actions in `actions.ts`, each parsing
  input with a zod schema from `schemas.ts` (`server-only`) before touching the
  DB, then calling `revalidatePath`. See the **server-actions** skill for the
  full optimistic-store → action → revalidate → rollback recipe.
- **Client state** is backed by **TanStack Query** (`QueryClientProvider` in the
  root layout). Server truth lives in the query cache, seeded from RSC props via
  `initialData`. `store.ts` (`useHiringStore`) holds the board cache and applies
  optimistic updates by running the pure `reducer.ts` events straight into the
  cache (`setQueryData`), with temp-id reconciliation for creates; a failed write
  resyncs by invalidating the board query (refetch via the `fetchBoard` action in
  `board-query.ts`). Query keys are centralized in `query-keys.ts`. Client code
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
- `cache.ts` = `BOARD_TAGS` used by `service.ts` (`unstable_cache`) and the
  `revalidate*` calls in `actions.ts`. `seed.ts` = demo data.

## Chat sub-module (`chat/`)

The per-applicant discussion thread and its mention-notification inbox live
together under `chat/` — the one cohesive cluster in this domain, split by
concern behind a barrel:

- `chat/logic.ts` (`server-only`) — the barrel: re-exports the thread and
  notification surface (and the default `drizzleChatStore`) so callers import
  one module and the internal split stays invisible.
- `chat/messages.ts` (`server-only`) — the per-candidate thread
  (`loadThreadWith`, `postMessageWith`).
- `chat/notifications.ts` (`server-only`) — the mention-inbox read/writes
  (mark/dismiss/`getNotificationsWith`).
- `chat/shaping.ts` (`server-only`) — the shared `toChatMessage` shaper,
  `currentUserId` identity resolution, and the body/mention validators.
- `chat/store.ts` (`server-only`) — the injectable `ChatStore` data seam
  (mirrors `service.ts`'s `BoardReader`); `db` is imported lazily per method so
  the logic stays unit-testable without a database. Default export is the
  Drizzle-backed `drizzleChatStore`.
- `chat/actions.ts` (`'use server'`) — thin adapters that resolve the caller's
  email from the session and delegate to the logic with the production store.
- `chat/queries.ts` (`server-only`) — the server-component read for the inbox.

The logic never imports `@/lib/auth`: identity is passed in as an `email`, so
the seam stays unit-testable. There is **no** `chat/index.ts` barrel: the folder
mixes `server-only` (logic/messages/notifications/shaping/store/queries) and
`'use server'` (actions) modules, so — like the top-level `index.ts` — those
must not be funnelled through one entry point. Import the specific module
(`@/lib/hiring/chat/logic`, `.../chat/actions`, `.../chat/queries`).

## Barrel (`index.ts`)

Re-exports only client-safe modules (`config`, `helpers`, `types`, `store`).
`service/`/`schemas.ts` are excluded (`server-only`) and `actions/` is imported
directly by the store to avoid a cycle — keep it that way.

For schema/read details see the **drizzle** skill; for the write path see the
**server-actions** skill.
