# Skills

Two kinds of skill live here, and they work as a pair.

## Skill map

| Skill | Kind | Covers | Pairs with |
| --- | --- | --- | --- |
| `pr-code-review` | **Review** — what to flag | The whole diff, via per-area checklists in `references/`: frontend, backend, type-management, testability | all authoring skills below |
| `drizzle` | **Authoring** — how to build it | Data layer: schema, migrations, seed, reads | `backend.md` (DB), `type-management.md` |
| `auth` | **Authoring** | The login gate, middleware matcher, allowlist/registration, secrets | `backend.md` (Auth & API routes), `SECURITY.md` |
| `server-actions` | **Authoring** | The single write path: optimistic TanStack Query store → zod action → Drizzle write → resync-on-failure | `backend.md` (server actions), `type-management.md` |

- **Review vs authoring.** `pr-code-review` is the *reviewer's* lens — it lists
  what to flag. The authoring skills are the *builder's* lens — step-by-step
  recipes for getting a change right in this repo. They cross-link, and where
  they overlap they must **agree**: if a rule changes, update both.

## Conventions (follow these when adding a skill)

1. **Only add an authoring skill where it earns its place** — i.e. it adds
   procedural / recipe value beyond a review checklist. Frontend and testing are
   deliberately *not* separate skills because `references/frontend.md` and
   `references/testability.md` are already how-to enough; a skill would just
   restate them.
2. **One component per authoring skill**, named for the component (`drizzle`,
   `auth`, `server-actions`).
3. **Cross-link both ways** — the authoring skill points at its `pr-code-review`
   reference, and that reference points back at the skill (see the `>` blockquote
   pointers in `references/*.md`).
4. **Frontmatter**: `name` + a trigger-oriented `description: >-` ("Use whenever
   a task touches …"). Dense, imperative prose; cite real repo files/symbols and
   **verify they exist** before asserting them.
5. `SKILL.md` alone is fine; add a `references/` folder only when the skill grows
   large enough to warrant progressive disclosure (as `pr-code-review` did).

Skills are committed to the repo (not `~/.claude/skills`) so they are versioned
alongside the code they describe and survive sandbox rebuilds.
