---
name: pr-code-review
description: >-
  Structured, stack-aware review of the current PR / working diff. Reconstructs
  the PR's intention from its description and commit history, traces every
  changed symbol into a call graph, checks that the implementation actually
  matches the stated intention, then runs frontend, backend, and type-management
  best-practice checklists for this Next.js 15 + React 19 + Drizzle + next-auth
  stack and delegates correctness/cleanup/security to the built-in code-review,
  simplify, and security-review skills. Use when asked to review a PR, review
  the diff, or check a change before merge.
---

# PR Code Review

A repeatable review pipeline for this repository. It is **stack-aware** (see the
`references/` checklists) and it **orchestrates the built-in quality skills**
rather than re-deriving their heuristics: `code-review` and `simplify` for
correctness and cleanup, `security-review` for auth / DB / secret risks.

The output is a single review report — do **not** push commits, comment on the
PR, or apply fixes unless the user explicitly asks. Reviewing is read-only by
default.

## The stack (what "according to the stack" means here)

- **Frontend:** React 19 + Next.js 15 App Router (Turbopack). Server Components
  by default; `'use client'` only where interactivity is needed. Tailwind CSS +
  shadcn/ui primitives in `components/ui/`.
- **Backend:** Next.js server actions (`'use server'`) are the single write
  path; server-only reads via Drizzle's relational query API. Neon Postgres via
  Drizzle ORM. zod validates every action input. Auth.js (next-auth v5 beta)
  gates the whole app in `middleware.ts` / `lib/auth.ts`.
- **Types:** the Drizzle schema (`lib/schema.ts`) is the single source of truth;
  UI/domain types are _derived_ (`$inferSelect` + `Pick`), value-sets are
  single-sourced (`lib/hiring/primitives.ts`) and shared by the DB enum, the TS
  type, and the zod validator. `strict` is on.
- **Tooling:** `bun` is the package manager. There is **no lint/test script** —
  the type/build gate is `bun run build` (runs `tsc`) and formatting is
  `prettier` (config in `package.json`: single quotes, 2-space, no trailing
  commas, always-parens arrows).

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
    → store action (lib/**/store.ts, optimistic)
      → server action (lib/**/actions.ts, 'use server', zod-validated)
        → Drizzle write (lib/db, lib/schema.ts)  → revalidatePath('/')
  Server Component / page (app/**)
    → query (lib/**/queries.ts, 'server-only')
      → Drizzle relational read → typed HiringState
  Request → middleware.ts → lib/auth.ts (authorized) → route/page
  ```

- Produce a **call graph** as a small tree/edge list covering the changed nodes
  and their immediate neighbours (one hop each way). Note new edges, removed
  edges, and any node that is now unreachable (dead code) or newly reachable
  without an auth/validation hop.
- Flag anything the graph reveals: a client component importing server-only
  code, a write path that skips the zod-validated action, a query that isn't
  `server-only`, a mutation with no `revalidatePath`.

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

### Step 4 — Stack best-practice review (frontend / backend / types)

Split the changed files by area and apply the matching checklist. Read the
checklist file before reviewing that area — they hold the concrete, stack-
specific rules:

- **Frontend** (`app/**`, `components/**`, `*.css`, `tailwind.config.ts`):
  → read `references/frontend.md`
- **Backend** (`lib/**/actions.ts`, `lib/**/queries.ts`, `app/**/route.ts`,
  `app/**/actions.ts`, `middleware.ts`, `lib/auth.ts`, `lib/db.ts`, `db/**`,
  `drizzle/**`): → read `references/backend.md`
- **Types** (`lib/schema.ts`, `**/types.ts`, `**/primitives.ts`,
  `**/schemas.ts`, any `type`/`interface`/generic change): → read
  `references/type-management.md`

Record findings with `file:line`, a severity (`blocker` / `should-fix` /
`nit`), and a concrete suggested fix.

### Step 5 — Delegate code-quality to the built-in skills

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
   `middleware.ts`, `app/api/**`, server actions, `lib/db.ts`, `.env*`, or the
   allowlist. This is the backend/security lens: authz gaps, injection,
   secret leakage, missing input validation.

Fold their findings into the report under the relevant area, de-duplicating
against your Step 4 findings. Attribute each finding to the skill that raised it.

### Step 6 — Report

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

### Frontend (Step 4 + delegated)

- [blocker|should-fix|nit] file:line — finding — fix (source: checklist | code-review | simplify)

### Backend (Step 4 + delegated)

- [blocker|should-fix|nit] file:line — finding — fix (source: checklist | code-review | security-review)

### Types (Step 4)

- [blocker|should-fix|nit] file:line — finding — fix

### Verdict

Approve | Approve with nits | Request changes — <one-line rationale>.
Blockers must be empty to Approve.
```

## Notes

- Severity discipline: a `blocker` is something that is wrong or unsafe (data
  loss, auth bypass, type unsoundness, broken intention). Style preferences are
  `nit`. Don't inflate.
- Prefer citing the existing convention the change violates over asserting a
  generic "best practice" — this repo has strong, documented conventions
  (`CLAUDE.md`, the derived-types pattern, the single write path). A finding
  that "this breaks the pattern in X" is more actionable than an abstract rule.
- If the user asks to act on the review, offer `code-review --comment` (inline
  PR comments) or `code-review --fix` / `simplify` (apply to working tree).
