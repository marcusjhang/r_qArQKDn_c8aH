# Frontend checklist (React 19 + Next 15 App Router + Tailwind/shadcn)

Applies to `app/**`, `components/**`, `*.css`, `tailwind.config.ts`.

This checklist has two layers: **framework-agnostic** principles (component
design, accessibility) that hold in any UI stack, and **stack-specific** rules
for this repo's React 19 / Next 15 / Tailwind setup. Apply both.

## Component design (framework-agnostic)

Component quality is the health of a frontend — most FE bugs and rework trace
back to a component doing too much or exposing a confusing API. Review every
new/changed component against these:

- **Single responsibility.** A component should have one reason to change. A
  date picker picks dates; it shouldn't also fetch data, own global state, and
  fire analytics. Warning sign: one component fetches, stores, transforms, _and_
  renders — split it.
- **Separate presentation from logic.** Prefer "dumb" presentational components
  that take data + callbacks via props, with logic lifted into hooks/services
  (here: the store, server actions, queries). Flag side effects (API calls,
  mutations) buried inside a display component. This repo extracts multi-step
  orchestration into co-located hooks — `app/login/useLoginForm.ts` owns the
  register → `signIn` → redirect flow and `components/hiring/useFeedbackDraft.ts`
  owns the drawer's draft/reset/submit state, leaving the page and `DetailDrawer`
  presentational (PR #19). Flag a component that inlines that kind of async
  orchestration or form-submit sequencing instead of a `use*` hook.
- **Composition over inheritance/config.** Build complex UI by composing small
  pieces (`children`/slots), not by piling options onto one mega-component. Keep
  base components unopinionated and compose the opinions around them.
- **Minimal, predictable props API.** Watch for "prop soup" — many booleans and
  rarely-used knobs. Fewer knobs = easier to use and harder to misuse. Group or
  split responsibility when the prop list balloons. Provide safe defaults for
  the common case.
- **Explicit contract.** A component's inputs (props), outputs (well-named
  callbacks with consistent payloads), and non-goals (e.g. "never mutates parent
  state") should be clear. Flag callbacks that pass inconsistent/surprising args.
- **State ownership is deliberate.** Decide controlled vs uncontrolled on
  purpose. Keep truly-local UI state (a tooltip toggle) inside; lift state the
  parent must orchestrate and notify via callbacks. Minimize internal state to
  maximize reuse — and there must be a single source of truth (no duplicated
  state that can drift).
- **Low coupling, high cohesion.** No cross-feature reach-ins, no deep imports
  into another module's internals, no circular dependencies. Business logic must
  not leak into shared UI primitives.
- **Reuse before rebuild.** A "generic" component must actually be generic; a new
  component that duplicates an existing one (or a `components/ui/` primitive) is
  a finding.
- **Drop-in test.** Could a teammate drop this component into a new page,
  configure it with a few props, and have it "just work"? If not, the API or the
  coupling needs work.

## Accessibility (framework-agnostic)

Baseline a11y is not optional; most of it is free if you use the platform.

- **Semantic HTML first.** Real elements for real roles: `<button>` for actions,
  `<a>` for navigation, `<nav>`/`<main>`/`<header>` landmarks, one logical
  heading progression, `<label>`-associated form fields. Flag click handlers on
  `<div>`/`<span>` that should be a `<button>`.
- **Keyboard operable.** Every interaction must work with Tab / Enter / Space /
  Escape / arrows — no mouse-only controls. Custom widgets (menus, modals, tabs)
  need explicit key handling; modals must trap focus and be escapable (no
  keyboard trap).
- **Visible focus.** Don't `outline: none` without an equally visible
  replacement (≥3:1 contrast, ≥2px). Ensure focus isn't hidden behind sticky
  headers/overlays.
- **ARIA sparingly, and correct.** Only when semantic HTML can't express it;
  keep dynamic states in sync (`aria-expanded`, `aria-selected`) and announce
  async updates via `aria-live`/focus management. Wrong ARIA is worse than none.
- **Perceivable.** Text contrast ≥4.5:1 (≥3:1 for large text), color is never
  the _sole_ signal, images have meaningful `alt` (or `alt=""` when decorative),
  and the UI stays usable at 200% zoom.

## Server vs Client Components

- **Server by default.** A component should only carry `'use client'` when it
  uses state, effects, refs, event handlers, or browser APIs. Flag a
  `'use client'` file that does none of these — it should be a Server Component.
- **Client/server boundary is a bundle boundary.** A `'use client'` module (and
  anything it imports) ships to the browser. Flag any client file that imports
  `server-only` code, `lib/db`, `lib/schema` runtime values, or a server action's
  _implementation_ details. Import server actions as functions (`import * as api
from './actions'`) — that's fine — but never import DB/Drizzle/postgres into a
  client component.
- **`import type` across the boundary.** UI types must be pulled with
  `import type` so schema/Drizzle runtime deps never enter the client bundle
  (see `lib/hiring/types.ts` for the established pattern).
- Pages/layouts under `app/**` that fetch data should do so in a Server
  Component via a `server-only` query (`lib/**/queries.ts`), then pass plain data
  to the client store — not fetch on the client.

## Data flow & state

- Mutations go **UI → store action → server action**. Flag a component that
  calls a server action directly for a mutation that the store models, or that
  mutates DB-backed state without the optimistic-then-persist pattern in
  `lib/hiring/store.ts`.
- Optimistic updates must have a **rollback path** — on a failed write the store
  `router.refresh()`es to resync. Flag optimistic UI with no error recovery.
- Client-side guards (e.g. the favorites cap, stage-name validation) must
  **mirror the server guard**, not replace it. The server is authoritative; the
  client check is only for UX. Flag a client-only guard with no server
  counterpart.
- Temporary/optimistic rows use negative ids until the server returns the real
  id; don't leak temp ids into anything persisted.

## React 19 correctness

- Hooks: complete, correct dependency arrays; `useCallback`/`useMemo` only where
  they matter (referential stability passed to children, expensive compute).
- Lists need stable `key`s (not array index when the list reorders).
- No state updates during render; no effects that could have been derived state.
- Prefer `useTransition` for async work that shouldn't block the UI (the store
  already does this) over ad-hoc loading booleans.

## Styling (Tailwind + shadcn)

- Use Tailwind utilities and the shadcn primitives in `components/ui/`; use the
  `cn()` helper (`lib/utils.ts`) to merge conditional classes rather than string
  concatenation.
- Don't reintroduce a bespoke component when a `components/ui/` primitive exists.
- Keep design tokens in `tailwind.config.ts` / CSS variables — flag hard-coded
  colors/spacing that duplicate existing tokens.
- Prefer semantic, accessible markup: buttons are `<button>`, inputs have
  labels, interactive elements are keyboard-reachable, images have `alt`.

## Copy & microcopy

User-facing strings added or changed in the diff (button labels, headings,
placeholders, empty/error/toast messages, tooltips) are in scope. Review the
literal text, not just the markup around it.

- **Keep it short.** Prefer the shortest string that still reads clearly. Flag
  an overly long label or message: a button that reads like a sentence, a toast
  that runs on, a heading padded with filler. Trim to the essential words.
- **Don't explain.** UI copy names the action or state; it does not justify,
  narrate, or teach. Flag strings that explain *why* or walk the user through
  reasoning ("We do this because...", "This will...") instead of just stating
  the thing. Move any genuinely needed guidance to docs/help, not the control
  label.
- **No em-dashes.** Do not use the em-dash (`—`) in user-facing copy. Flag any
  added string containing one and rewrite with a period, comma, or colon, or by
  splitting the sentence.
- **Icons over emoji.** Prefer a `lucide-react` icon over an emoji in the UI. An
  icon inherits `currentColor`, sizes with the text, and renders consistently
  across platforms (see `components/hiring/ProfileLinks.tsx`, which imports
  `Github` / `Linkedin` from `lucide-react`). Flag emoji added to labels,
  headings, buttons, or messages and suggest the matching lucide icon; keep
  emoji only where it is genuinely the content (e.g. user-entered text).

## General

- No `console.log` left in shipped UI; no dead props or unused imports.
- Loading and empty states handled, not just the happy path.
- Follow the prettier config (single quotes, 2-space, no trailing commas).
