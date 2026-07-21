# Frontend checklist (React 19 + Next 15 App Router + Tailwind/shadcn)

Applies to `app/**`, `components/**`, `*.css`, `tailwind.config.ts`.

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

## General

- No `console.log` left in shipped UI; no dead props or unused imports.
- Loading and empty states handled, not just the happy path.
- Follow the prettier config (single quotes, 2-space, no trailing commas).
