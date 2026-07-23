# lib/hiring conventions

The hiring domain. Reads and writes cross clearly separated boundaries — respect
which side each module lives on.

## Read / write / client boundaries

- **Reads** go through the `service/` facade (`import 'server-only'`, entry
  `service/index.ts`). It owns the UI-shaped DTOs (`Job`, `Candidate`,
  `Feedback`, `HiringState`, in `service/dtos.ts`) and projects them from the
  Drizzle rows with a compile-time conformance guard, so the DTOs never drift
  from the schema. Reads are expressed against an injectable `BoardReader`
  (production default `service/reader.ts` is Drizzle-backed; tests pass an
  in-memory fake). No ORM types cross this line.
- **Writes** go through the `'use server'` actions in `actions/` (split by
  entity — `jobs.ts` / `candidates.ts` / `feedback.ts` / `stages.ts`, barreled
  by `actions/index.ts`; shared server-only helpers in `actions/support.ts`),
  each parsing input with a zod schema from `schemas.ts` (`server-only`) before
  touching the DB, then calling `revalidateTag`. See the **server-actions**
  skill for the full optimistic-store → action → revalidate → rollback recipe.
- **Client state** lives in `store.ts` + `reducer.ts` — optimistic updates with
  temp ids, rolled back if the server action rejects. Client code imports from
  the `index.ts` barrel (`@/lib/hiring`), never from `service/`/`schemas.ts`.

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

## Barrel (`index.ts`)

Re-exports only client-safe modules (`config`, `helpers`, `types`, `store`).
`service/`/`schemas.ts` are excluded (`server-only`) and `actions/` is imported
directly by the store to avoid a cycle — keep it that way.

For schema/read details see the **drizzle** skill; for the write path see the
**server-actions** skill.
