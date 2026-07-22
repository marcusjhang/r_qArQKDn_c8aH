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
- **Client state** lives in `store.ts` + `reducer.ts` — optimistic updates with
  temp ids, rolled back if the server action rejects. Client code imports from
  the `index.ts` barrel (`@/lib/hiring`), never from `service.ts`/`schemas.ts`.

## Where logic goes

- Pure, framework-free rules (status/stage placement, stage-array edits,
  validation, filter/sort) live in `helpers.ts` and are unit-tested. Put new
  business rules there — not inline in `actions.ts`, `store.ts`, or components —
  so they stay testable and shared across layers.
- `primitives.ts` = the `Status` / `RatingValue` literal unions and their
  arrays; `config.ts` = `FOUNDERS`, `SOURCES`, and other static config. zod
  schemas and DTOs are built from these single sources — extend the source, not
  a duplicate list.
- `cache.ts` = `BOARD_TAGS` used by `service.ts` (`unstable_cache`) and the
  `revalidate*` calls in `actions.ts`. `seed.ts` = demo data.

## Barrel (`index.ts`)

Re-exports only client-safe modules (`config`, `helpers`, `types`, `store`).
`service.ts`/`schemas.ts` are excluded (`server-only`) and `actions.ts` is
imported directly by the store to avoid a cycle — keep it that way.

For schema/read details see the **drizzle** skill; for the write path see the
**server-actions** skill.
