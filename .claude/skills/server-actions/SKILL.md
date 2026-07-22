---
name: server-actions
description: >-
  How to add or change a mutation in this repo — the single write path from an
  optimistic client store through a zod-validated 'use server' action to a
  Drizzle write and revalidatePath, with rollback on failure. Covers the exact
  recipe for a new mutation (zod schema → optimistic store action with temp ids
  → server action that parses, guards, transacts, and revalidates), where the
  shared pure rules live, and how failures roll back. Use whenever a task adds or
  edits a mutation in lib/hiring/actions.ts, lib/hiring/store.ts,
  lib/hiring/schemas.ts, lib/hiring/helpers.ts, or a component that triggers a
  write. For *reviewing* these changes use the pr-code-review skill
  (references/backend.md + type-management.md); for reads/schema use the drizzle
  skill — this skill is for authoring the write path.
---

# The write path (server actions)

Every mutation in this app follows one path, and the discipline is the point:
the UI stays snappy (optimistic), the server is authoritative (zod-validated),
and a failed write self-heals (resync). This is the **authoring** companion to
`pr-code-review` → `references/backend.md` (server actions) and
`references/type-management.md` (discriminated unions); reads and schema changes
belong to the **`drizzle`** skill.

## The flow

```
UI event (components/hiring/**, 'use client')
  → orchestration hook (use*.ts)        // multi-step flows only
    → store action (lib/hiring/store.ts) // optimistic: mutate local state now
      → server action (lib/hiring/actions.ts, 'use server')
        → zod .parse (lib/hiring/schemas.ts)   // boundary validation
          → Drizzle write (single stmt, or db.transaction for invariants)
            → revalidatePath('/')
  on throw → store resync() → router.refresh()  // rolls back the optimistic change
```

The store applies the change immediately, then calls the action inside
`startTransition`. If the action throws (e.g. a zod parse failure), the store's
`resync()` sets a flag and `router.refresh()`es, so fresh server props replace
the failed optimistic state. **This is why actions must `.parse` and must not
swallow errors** — the throw *is* the rollback signal.

## Recipe: add a mutation

1. **Validate at the boundary — add/extend the zod schema** in
   `lib/hiring/schemas.ts`. Reuse the scalar validators (`zId`, `zStageName`,
   `zStatus`, `zOwner`, …) and the `drizzle-zod` insert shapes
   (`candidateInsertSchema`, `feedbackInsertSchema`). Everything is built from
   the single-sourced tuples in `primitives.ts` — don't hand-list values.
2. **Add the server action** in `lib/hiring/actions.ts` (file is `'use server'`):
   - **Parse every raw arg first**: `const id = zId.parse(idRaw)` — never touch
     the DB with an unvalidated `number`/`string`. Let a parse failure throw.
   - **Reach for shared rules, don't re-inline them** — the pure helpers in
     `lib/hiring/helpers.ts` (stage ordering, `placeInStage`/`placeWithStatus`,
     the `HIRED_STAGE` constant, the `StageMutation`/`StageGuard` discriminated
     unions) are consumed by both store and action so client and server compute
     identically. Return early (`return`/`return null`) on an expected guard
     failure rather than throwing.
   - **Multi-statement invariants use `db.transaction`** — e.g. `renameStage`
     updates the job's `stages` array *and* re-points candidates in one tx.
   - **`revalidatePath('/')`** at the end so the cached board re-reads.
3. **Add the optimistic store action** in `lib/hiring/store.ts`:
   - Mutate local state immediately; wrap the persist in `startTransition`.
   - For created rows, use a **negative temp id** (`tempId.current--`) until the
     server returns the real id (e.g. `createJob` returns `number | null`,
     adopted via `onReady`). Never let a temp id reach anything persisted.
   - In the `catch`, call `resync()` — every optimistic action needs this
     rollback path.
4. **Trigger it from the component** via the store action (or an orchestration
   `use*` hook for multi-step flows). A display component must not call a server
   action directly or do its own DB write.

## Rules the write path enforces

- **Server actions are the only write path.** No ad-hoc DB writes from a
  `route.ts` or a component. `app/api/**` handlers stay thin adapters over a
  `server-only` domain service (see the **`auth`** skill's registration recipe).
- **The server is authoritative.** Client guards (favorites cap, stage-name
  validation via `canDeleteStage`/`validateStageName`) are UX mirrors of a
  server-side check, never a replacement — the action re-checks.
- **Model fallible outcomes as discriminated unions**, not `{ ok; reason? }`
  bags (see `type-management.md`): `StageMutation` / `StageGuard` carry `reason`
  only on failure, and callers narrow on the discriminant.
- **Bound params only** — `eq`/`and`/`ne`/`sql` with parameters; never
  string-interpolate input into `sql``.

## Cross-links

- Review lens: `pr-code-review` → `references/backend.md` (server actions,
  the single write path) + `references/type-management.md` (discriminated
  unions, single-source literals) + `references/frontend.md` (optimistic store,
  orchestration hooks).
- Reads, schema, migrations, transactions on new tables: the **`drizzle`** skill.
- Thin-adapter/domain-service writes for auth/registration: the **`auth`** skill.
