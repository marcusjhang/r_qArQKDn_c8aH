# lib/hiring conventions

The hiring domain. Reads and writes cross clearly separated boundaries — respect
which side each module lives on. Files are grouped into feature sub-directories;
the `@/lib/hiring` barrel (and `@/lib/hiring/helpers`) hide that layout from
consumers, so import from the barrel and only reach into a sub-module when you
need a `server-only` / `'use server'` module the barrel can't re-export.

## Layout

- `core/` — the server-side board core: `service.ts` (read facade),
  `actions.ts` (write path), `schemas.ts` (zod validators), `cache.ts` (tags).
- `store/` — client optimistic state: `store.ts` (the `useHiringStore` hook) +
  `reducer.ts` (the pure state machine).
- `chat/` — the per-applicant chat + mention inbox: `actions.ts` (`'use server'`
  adapters), `logic.ts` (injectable read/write logic), `store.ts` (the
  `ChatStore` seam), `queries.ts` (the server-component notification read).
- `model/` — framework-free foundation: `primitives.ts`, `types.ts`,
  `config.ts`, `seed.ts`.
- `helpers/` — the pure business rules, split by concern (`users`, `mentions`,
  `candidate`, `stages`, `board-view`) behind a barrel (`index.ts`) so
  `@/lib/hiring/helpers` stays one import path.

## Read / write / client boundaries

- **Reads** go through the `core/service.ts` facade (`import 'server-only'`). It
  owns the UI-shaped DTOs (`Job`, `Candidate`, `Feedback`, `HiringState`) and
  projects them from the Drizzle rows with a compile-time conformance guard, so
  the DTOs never drift from the schema. Reads are expressed against an injectable
  `BoardReader` (production default is Drizzle-backed; tests pass an in-memory
  fake). No ORM types cross this line.
- **Writes** go through the `'use server'` actions in `core/actions.ts`, each
  parsing input with a zod schema from `core/schemas.ts` (`server-only`) before
  touching the DB, then calling `revalidateTag`. See the **server-actions** skill
  for the full optimistic-store → action → revalidate → rollback recipe.
- **Client state** lives in `store/store.ts` + `store/reducer.ts` — optimistic
  updates with temp ids, rolled back if the server action rejects. Client code
  imports from the `index.ts` barrel (`@/lib/hiring`), never from
  `core/service.ts` / `core/schemas.ts`.

## Where logic goes

- Pure, framework-free rules (status/stage placement, stage-array edits,
  validation, filter/sort) live in `helpers/` and are unit-tested. Put a new
  business rule in the `helpers/` module it belongs to — not inline in
  `core/actions.ts`, `store/store.ts`, or components — so it stays testable and
  shared across layers.
- `model/primitives.ts` = the `Status` / `RatingValue` literal unions and their
  arrays; `model/config.ts` = the rating scale, status labels, seniority bands,
  and default-stages template. zod schemas and DTOs are built from these single
  sources — extend the source, not a duplicate list.
- `core/cache.ts` = `BOARD_TAGS` used by `core/service.ts` (`unstable_cache`)
  and the `revalidate*` calls in `core/actions.ts`. `model/seed.ts` = demo data.

## Barrel (`index.ts`)

Re-exports only client-safe modules (`model/config`, `helpers`, `model/types`,
`store/store`). `core/service.ts` / `core/schemas.ts` are excluded
(`server-only`) and `core/actions.ts` (`'use server'`) is imported directly by
the store to avoid a cycle — keep it that way.

For schema/read details see the **drizzle** skill; for the write path see the
**server-actions** skill.
