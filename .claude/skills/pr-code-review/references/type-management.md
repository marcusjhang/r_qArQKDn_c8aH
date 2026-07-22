# Type-management checklist

This repo treats types with unusual discipline. The DB schema is the single
source of truth and everything else is _derived_ from it. Reviews must protect
that property — most type findings here are about **drift** and **soundness**,
not style.

Applies to `lib/schema.ts`, `**/types.ts`, `**/primitives.ts`, `**/schemas.ts`,
and any `type`/`interface`/generic change anywhere.

## Single source of truth: the Drizzle schema

- Table row types come from `typeof table.$inferSelect` (see `SelectJob`,
  `SelectCandidate`, `SelectFeedback` in `lib/schema.ts`). **UI/domain types must
  be derived** from those via `Pick`/`Omit` (see `lib/hiring/types.ts`) — no
  hand-authored field types that restate columns. Flag a new interface that
  duplicates DB fields by hand; it can drift from the DB.
- Derived UI types use `import type` only, so the schema's Drizzle/postgres
  runtime never reaches the client bundle. Flag a value import where a type
  import would do.

## Single-sourced value-sets (enum ↔ TS ↔ zod)

- Fixed value-sets are defined **once** as a `const` tuple in
  `lib/hiring/primitives.ts` (`STATUSES`, `RATING_VALUES`) and consumed three
  ways so they can't diverge:
  - the DB enum / CHECK (`pgEnum('candidate_status', STATUSES)`, the rating
    `check`),
  - the TS type (`type Status = (typeof STATUSES)[number]`),
  - the zod validator (`lib/hiring/schemas.ts`).
- When reviewing a new/changed value-set: confirm all three consume the same
  tuple. Flag a status/enum value added in one place (e.g. the zod schema) but
  not the tuple — that is exactly the drift this pattern exists to prevent, and
  it usually also needs a **migration** for the DB enum.
- `$type<RatingValue>()` on a column pins the TS type; a DB `CHECK` must back it
  at runtime. Flag a `$type<…>()` narrower than what the column/CHECK actually
  allows.

## Soundness (strict mode is on)

- **No `any`** — reach for `unknown` + a zod parse, or a precise type. Flag `any`
  (explicit or implicit) introduced by the change.
- **No unsafe casts.** `as SomeType` and `as unknown as T` bypass the checker;
  in this codebase query results should be typed _by construction_ (columns
  allowlist), not cast. Flag casts used to silence an error rather than fix it.
- **No non-null `!`** to hide a genuinely nullable value — handle it (`?? null`,
  optional chaining, early return). Destructured `[row]` from a Drizzle select
  is possibly `undefined`; that must be handled.
- Function signatures: prefer precise unions and literal types (`1 | -1`,
  `Status`) over `number`/`string` where the domain is finite — the existing
  actions and store already do this.
- Runtime boundaries (server action args, API `request.json()`, env) are
  `unknown` until validated — parse with zod before use; don't assert a type
  onto unparsed input.

## Model outcomes as discriminated unions, not optional-field bags

PRs #18 and #19 replaced loose `{ ok: boolean; reason?: string }` result bags
with discriminated unions so the failure fields only exist on failure and the
compiler forces callers to narrow:

- A function that can succeed or fail should return a **discriminated union**
  keyed on a literal — `StageMutation` / `StageGuard` (`lib/hiring/helpers.ts`)
  and `RegisterResult` (`{ ok: true } | { ok: false; error; status }` in
  `lib/registration.ts`). Flag a result type that carries `reason?`/`error?` as
  optional fields alongside `ok`, so a "success" can still smuggle an error
  string and callers can read fields that shouldn't exist in that state.
- Callers must **narrow on the discriminant** before touching state-specific
  fields (e.g. `Board.tsx` narrows `StageGuard` for the delete reason). Flag code
  that reads `result.reason` without first checking `result.ok === false`.

## Single-source domain literals as named constants

- A domain literal that couples layers (the `'Hired'` stage↔status coupling)
  belongs in **one named constant** — `HIRED_STAGE` in `lib/hiring/helpers.ts`
  replaced a bare `'Hired'` string repeated in four places (PR #18). Flag the
  same magic string/number repeated across store, actions, and components where a
  shared constant (or the existing `primitives.ts` tuple) should be the source.

## Drift smells to grep for in a diff

- A field added to a table but not surfaced in the derived UI type (or vice
  versa).
- A new enum value in the zod schema or UI type without the corresponding
  tuple + migration.
- `as`, `any`, `!`, `@ts-ignore`, `@ts-expect-error` newly introduced.
- A UI type importing from the DB layer as a _value_ rather than `import type`.
