---
name: pr-code-review
description: >-
  Structured, stack-aware review of the current PR / working diff. Reconstructs
  the PR's intention from its description and commit history, traces every
  changed symbol into a call graph, checks that the implementation actually
  matches the stated intention, then runs frontend, backend, type-management,
  and testability best-practice checklists for this Next.js 15 + React 19 +
  Drizzle + next-auth stack and delegates correctness/cleanup/security to the
  built-in code-review,
  simplify, and security-review skills. Use when asked to review a PR, review
  the diff, or check a change before merge.
---

# PR Code Review

A repeatable review pipeline for this repository. It is **stack-aware** (see the
`references/` checklists) and it **orchestrates the built-in quality skills**
rather than re-deriving their heuristics: `code-review` and `simplify` for
correctness and cleanup, `security-review` for auth / DB / secret risks.

This is the **review** lens (what to flag). Its companions are the **authoring**
skills — `drizzle`, `auth`, `server-actions` — which give the how-to recipes for
the same components; the checklists here cross-link to them. See
`.claude/skills/README.md` for the skill map.

The default output is a single review report — reviewing is **read-only by
default**: do not comment on the PR, apply fixes, or push commits unless asked.
Every finding carries a **severity** (`Critical` / `High` / `Medium` / `Low`,
see **Severity scale**), and the pipeline then **verifies every medium-and-above
finding** (Step 6) before it is allowed to stand. When — and only when — the user
asks to act on the review, the gated fix-and-push step (Step 7) applies and
pushes fixes for the *verified* medium-and-above findings.

## Severity scale

Assign exactly one severity to **every** finding — the stack-checklist findings
(Step 4) and the ones delegated to `code-review` / `simplify` / `security-review`
(Step 5) alike. "Medium and above" means `Critical`, `High`, or `Medium`.

- **Critical** — data loss, auth bypass, secret leakage, injection, or a change
  that is broken/unsound and will ship a bug (e.g. type unsoundness that hides a
  real null, a write that corrupts state). Must be empty to Approve.
- **High** — a real defect or a broken stated intention: incorrect behaviour, a
  missing server-side guard/validation, a schema/seed/migration drift that
  breaks the environment, a client bundle importing server-only code.
- **Medium** — a should-fix that is not an immediate breakage: a missing
  `revalidatePath`, an un-parallelized read, a duplicated component, a
  convention violation with real maintenance cost, or a probable-but-unconfirmed
  bug.
- **Low** — nits: style, naming, dead code, formatting, minor cleanups. Never
  inflate a Low into a Medium to force it through verification, or deflate a real
  Medium to a Low to dodge it.

## The stack (what "according to the stack" means here)

- **Frontend:** React 19 + Next.js 15 App Router (Turbopack). Server Components
  by default; `'use client'` only where interactivity is needed. Tailwind CSS +
  shadcn/ui primitives in `components/ui/`.
- **Backend:** Next.js server actions (`'use server'`) are the single write
  path; server-only reads via Drizzle's relational query API. Neon Postgres via
  Drizzle ORM. zod validates every action input. Auth.js (next-auth v5 beta)
  gates the whole app in `middleware.ts` / `lib/auth.ts`. The DB is both migrated
  and **seeded** on setup (`bun run db:setup` → `db:migrate` + `db:seed`), so a
  schema change must keep the migration _and_ the seed in sync.
- **Types:** the Drizzle schema (`lib/schema.ts`) is the single source of truth;
  UI/domain types are _derived_ (`$inferSelect` + `Pick`), value-sets are
  single-sourced (`lib/hiring/primitives.ts`) and shared by the DB enum, the TS
  type, and the zod validator. `strict` is on.
- **Testability:** business rules are extracted into pure, dependency-free
  modules (`lib/hiring/helpers.ts`, `lib/registration.ts`) and I/O
  is behind injectable seams (`getBoardData(reader)` in `lib/hiring/queries.ts`)
  so the logic unit-tests without a live DB. Unit tests live in `test/unit/**`
  (Vitest), an auth smoke test in `test/e2e/**` (Playwright); `server-only` is
  aliased to an inert stub in `vitest.config.ts`.
- **Tooling:** `bun` is the package manager. The gate is **`bun run typecheck`**
  (`tsc --noEmit`), **`bun run test`** (Vitest unit suite), and
  **`bun run build`**; `bun run test:e2e` runs the Playwright smoke test.
  **`bun run detect:dead-code`** (knip, config in `knip.json`) audits for unused
  files, exports, and dependencies — run it every review (see Step 5).
  Formatting is `prettier` (config in `package.json`: single quotes, 2-space, no
  trailing commas, always-parens arrows).

## Inputs

Figure out the review target, in this order:

1. If a PR number/URL is given (or `gh pr view` succeeds on the current branch),
   use it: `gh pr view --json title,body,commits,files` and
   `gh pr diff`.
2. Otherwise review the working diff against the base branch (`main`):
   `git diff main...HEAD` (committed) and `git status` / `git diff` (uncommitted).

Never review files you have not read in this session — open each changed file.

## Pipeline

Work through the steps in order. Keep a running note of findings; emit the
report (see **Output**) at the end.

### Step 1 — Extract intention

Reconstruct what the change is _supposed_ to do, from evidence, not guesses:

- **PR description**: the title, the summary, any "what/why", checklists, linked
  task (e.g. a Lightsprint `MARCUS-…` link), and any explicit non-goals.
- **Commit history**: `git log --oneline --no-merges main..HEAD` and read each
  message body. Commits often reveal sub-intentions the PR summary omits
  (bugfix bundled into a feature, a revert, a refactor step).
- Write a short **intention statement**: a bulleted list of the concrete
  behaviours/outcomes the author claims. Mark each as `explicit` (stated) or
  `inferred` (you deduced it). If the PR body is empty, say so — an empty
  description is itself a finding.

### Step 2 — Trace the code & build a call graph

For every changed symbol (exported function, component, server action, route
handler, query, schema table), trace how it is reached and what it reaches:

- Find callers and callees with `grep`/Grep across the repo (respect the `@/lib`
  and `@/components` path aliases). Follow the stack's real data flow:

  ```
  UI event (components/**, 'use client')
    → orchestration hook (components/**/use*.ts, app/**/use*.ts)
      → store action (lib/**/store.ts, optimistic; pure rules from helpers.ts)
        → server action (lib/**/actions.ts, 'use server', zod-validated)
          → Drizzle write (lib/db, lib/schema.ts)  → revalidatePath('/')
  Server Component / page (app/**)
    → query (lib/**/queries.ts, 'server-only', reads via injected reader)
      → Drizzle relational read → typed HiringState
  HTTP route (app/api/**/route.ts, thin adapter)
    → domain service (lib/registration.ts, 'server-only', returns discriminated result)
      → Drizzle write → NextResponse(status)
  Request → middleware.ts → lib/auth.ts (authorized) → route/page
  ```

- Produce a **call graph** as a small tree/edge list covering the changed nodes
  and their immediate neighbours (one hop each way). Note new edges, removed
  edges, and any node that is now unreachable (dead code) or newly reachable
  without an auth/validation hop.
- Flag anything the graph reveals: a client component importing server-only
  code, a write path that skips the zod-validated action, a query that isn't
  `server-only`, a mutation with no `revalidatePath`.
- **Schema is a node too.** If the diff touches `lib/schema.ts`, follow its edges
  to the migration (`drizzle/**`) and the seed (`db/seed.ts` +
  `lib/hiring/seed.ts`) — a schema change that doesn't reach both is drift.
  The DB is seeded on every boot (`bun run db:setup`), so a stale seed breaks
  the environment, not just the migration. See `references/backend.md`.

### Step 3 — Verify intention matches implementation

Cross the intention statement (Step 1) against the call graph and diff (Step 2):

- **Covered** — each explicit intention has corresponding code. Point to the
  file:line that satisfies it.
- **Missing** — an intention with no implementation (claimed but not done).
- **Unstated / scope creep** — code changes with no matching intention (a
  behaviour change hiding in a "refactor", an unrelated file touched). These are
  the highest-value findings.
- **Contradicted** — code that does the opposite of, or undermines, a stated
  goal.

State the intention-match verdict plainly: `matches`, `partial`, or `diverges`.

### Step 4 — Stack best-practice review (frontend / backend / types / testability)

Split the changed files by area and apply the matching checklist. Read the
checklist file before reviewing that area. Each checklist has two layers —
**framework-agnostic** principles (component design & accessibility for
frontend; API/service design for backend) that apply in any stack, plus the
**stack-specific** rules for this repo — apply both:

- **Frontend** (`app/**`, `components/**`, `*.css`, `tailwind.config.ts`):
  → read `references/frontend.md`
- **Backend** (`lib/**/actions.ts`, `lib/**/queries.ts`, `app/**/route.ts`,
  `app/**/actions.ts`, `middleware.ts`, `lib/auth.ts`, `lib/db.ts`, `db/**`
  (incl. `db/seed.ts`), `lib/**/seed.ts`, `drizzle/**`): → read
  `references/backend.md`
- **Types** (`lib/schema.ts`, `**/types.ts`, `**/primitives.ts`,
  `**/schemas.ts`, any `type`/`interface`/generic change): → read
  `references/type-management.md`
- **Testability** (`test/**`, `vitest.config.ts`, `playwright.config.ts`, and
  **any** change to business rules in `lib/**/helpers.ts`,
  `lib/registration.ts`, or a query/action — a logic change is in scope here
  even when no test file is touched): → read `references/testability.md`

Record findings with `file:line`, a **severity** from the **Severity scale**
(`Critical` / `High` / `Medium` / `Low`), and a concrete suggested fix. Every
finding gets a severity — no unlabelled findings.

### Step 5 — Delegate code-quality to the built-in skills + tools

Do not hand-roll correctness or cleanup analysis — invoke the purpose-built
skills, scoped **separately** to frontend and backend so each pass stays
focused:

1. **`code-review`** — correctness bugs + reuse/simplification/efficiency. Run
   it (default effort `medium`; use `high` when the diff touches auth, the DB
   write path, or types). If the tooling supports scoping, run it once over the
   frontend paths and once over the backend paths so findings are attributed to
   the right area.
2. **`simplify`** — quality-only pass for reuse/altitude cleanups on the changed
   code (no bug hunting). Useful for the FE components and the store.
3. **`security-review`** — run whenever the diff touches `lib/auth.ts`,
   `middleware.ts`, `app/api/**`, server actions, `lib/db.ts`, `.env*`,
   `.gitignore`, or the allowlist. This is the backend/security lens: authz
   gaps, injection, secret leakage, missing input validation. When any of these
   change, also read `SECURITY.md` and check the diff against the documented
   policy — the auth model (whole app gated in `middleware.ts` / `lib/auth.ts`,
   only `/login` public), secret management (secrets only in git-ignored `.env`,
   `.env.example` holds placeholders only, rotate anything ever committed), and
   the default-seed-password warning. Flag any change that contradicts
   `SECURITY.md`, and flag `SECURITY.md` itself going stale when the code it
   describes changes (e.g. the matcher exclusions or the env-var list drift out
   of sync with `.env.example`).
4. **`knip`** (mechanical, not a skill) — **always run** `bun run detect:dead-code`.
   It audits the whole repo for unused files, exports, and dependencies and
   exits non-zero on any finding, so treat its output as the source for the
   **Dead code** part of the backend checklist. Two rules:
   - **Attribute to the diff, not the backlog.** knip reports pre-existing dead
     code too; only the entries the PR *introduces or newly orphans* (a now-unused
     export left behind by a refactor, a dependency added but unused, a file no
     longer imported) are findings against this PR. A new unused export/file is
     typically `Medium`; a newly-added-but-unused dependency is `Medium`. Note
     pre-existing findings the diff didn't cause as `Low` / out-of-scope, and
     don't gate the PR on the backlog. If a run is clean of new items, say so.
   - **Removal over ignoring.** A genuinely-unused item should be deleted (and any
     dependency it pulled in `bun remove`d), per `README.md` → *Dead Code &
     Dependency Audit*. Only when an item is a deliberate public API / framework
     contract / config-only tool should it be silenced in `knip.json`
     (`ignore` / `ignoreDependencies` / `ignoreBinaries`) or with a `// @public`
     tag — **with a reason**. Flag a diff that grows `knip.json`'s ignores to
     hide real dead code instead of removing it.

Fold their findings into the report under the relevant area, de-duplicating
against your Step 4 findings. Attribute each finding to the skill / tool that
raised it.
**Assign each delegated finding a severity from the same Severity scale** — the
built-in skills use their own wording (e.g. `code-review` effort tiers,
`security-review` risk levels), so map every one onto `Critical` / `High` /
`Medium` / `Low` yourself. A delegated finding with no severity is not done.

### Step 6 — Verify every medium-and-above finding

Before the report can stand, take **every** finding rated `Medium`, `High`, or
`Critical` (from Step 4 and Step 5 alike) and adversarially verify it — a review
that reports false positives at these severities is worse than useless. Low
findings are exempt (they are cheap to skim and never gate or get pushed).

For each medium-and-above finding:

- **Re-open the cited `file:line`** and confirm the code actually says what the
  finding claims. A stale line number or a misquoted snippet ⇒ `false-positive`.
- **Walk the call graph (Step 2)** to confirm the problem is reachable and the
  claimed consequence is real — e.g. a "missing `revalidatePath`" is only real if
  the action mutates DB-backed state that a cached page reads; a "missing zod
  parse" is only real if the arg is actually caller-controlled and unvalidated
  upstream. Try to **refute** the finding, not confirm it.
- **Check it isn't already handled** elsewhere (a server guard the client
  mirrors, a DB `CHECK`/`notNull`, an upstream parse, an existing test).
- Mark the finding `verified` (the problem is real, at the stated severity — or
  re-grade it if verification changed your mind) or `false-positive` (drop it
  from the actionable set, but keep a one-line note of what you checked).

Only `verified` medium-and-above findings remain actionable and feed the verdict
and the optional Step 7. If you could not verify a finding (couldn't run the
code, needs a migration, etc.), mark it `needs-verification` rather than
asserting it — do not silently upgrade an unverified guess.

### Step 7 — (Gated) fix and push the verified medium-and-above findings

**Skip this step unless the user explicitly asked to act on / apply / push the
review.** The default review ends at Step 8.

When asked, scope the fixes to the **`verified` `Medium` / `High` / `Critical`**
findings only (never the `Low` / `false-positive` / `needs-verification` ones):

- Apply the fixes to the working tree — reuse `code-review --fix` / `simplify`
  where a delegated finding produced the fix, and follow this repo's conventions
  (prettier config, the single write path, derived types) for hand-edits.
- Re-run the full gate — **`bun run typecheck`, `bun run test`, and
  `bun run build`** — and confirm all three are green before committing. If the
  fix changed business logic, add/adjust the unit test that covers it (see
  `references/testability.md`) rather than leaving the suite behind. If a fix
  touches `lib/schema.ts`, run `bun run db:setup` per the backend checklist. If a
  fix removed code, re-run **`bun run detect:dead-code`** to confirm it didn't
  strand a now-unused export or dependency (and clean up any it did).
- Commit on the current branch with a message that references the findings
  addressed, then push (`git push -u origin HEAD`). Do **not** open or merge a PR
  unless that was also requested.
- Report back which verified findings were fixed-and-pushed and which were left
  (with the reason: `Low`, `false-positive`, `needs-verification`, or "declined").

### Step 8 — Report

Emit the report in the format below.

## Output

```markdown
## PR Review: <title / branch>

### Intention (Step 1–3)

- **Stated:** <bulleted intention statement, explicit vs inferred>
- **Commits:** <n commits — notable sub-intentions>
- **Match verdict:** matches | partial | diverges
  - Covered: …
  - Missing: …
  - Scope creep / unstated: …

### Call graph (Step 2)

<tree or edge list of changed nodes + one-hop neighbours; note new/removed/dead edges>

Every finding line carries a severity and — for medium-and-above — a Step 6
verification status (`verified` / `false-positive` / `needs-verification`).
`Low` findings need no status.

### Frontend (Step 4 + delegated)

- [Critical|High|Medium|Low] file:line — finding — fix (source: checklist | code-review | simplify) — [verified|false-positive|needs-verification]

### Backend (Step 4 + delegated)

- [Critical|High|Medium|Low] file:line — finding — fix (source: checklist | code-review | security-review) — [verified|false-positive|needs-verification]

### Types (Step 4)

- [Critical|High|Medium|Low] file:line — finding — fix — [verified|false-positive|needs-verification]

### Verdict

Approve | Approve with nits | Request changes — <one-line rationale>.
Approve requires no `verified` `Critical` or `High` findings; count only
`verified` findings — `false-positive`s do not gate. Note any
`needs-verification` items explicitly.

<!-- Present only when Step 7 ran (user asked to act on the review). -->
### Actions taken (Step 7)

- Fixed & pushed: <verified medium-and-above findings addressed> — <commit / build status>
- Left: <finding — reason: Low | false-positive | needs-verification | declined>
```

## Notes

- Severity discipline: use the **Severity scale** above. `Critical`/`High` are
  things that are wrong or unsafe (data loss, auth bypass, type unsoundness,
  broken intention); `Medium` is a genuine should-fix; style preferences are
  `Low`. Don't inflate — and don't deflate a real issue to dodge the Step 6
  verification pass. Every finding, including delegated ones, gets a severity.
- Verification discipline: never let an unverified `Medium`+ finding stand as
  fact. Step 6 exists because a confidently-wrong high-severity finding erodes
  trust in the whole review. Refute first; downgrade or drop what you can't
  confirm rather than shipping a guess.
- Prefer citing the existing convention the change violates over asserting a
  generic "best practice" — this repo has strong, documented conventions
  (`CLAUDE.md`, the derived-types pattern, the single write path). A finding
  that "this breaks the pattern in X" is more actionable than an abstract rule.
- If the user asks to act on the review, run the gated Step 7 (fix + push the
  verified medium-and-above findings). You can also offer `code-review --comment`
  (inline PR comments) or `code-review --fix` / `simplify` (apply to working
  tree) as the mechanism for individual fixes.
