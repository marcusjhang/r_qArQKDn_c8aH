# components/hiring conventions

Client UI for the Hiring Pipeline Tracker. These are React 19 client components
rendered under the auth-gated `app/(dashboard)` route.

## Data in, mutations out

- **Types**: import DTOs and domain types from `@/lib/hiring` (the client
  barrel), which re-exports them as `import type` from the service facade. Never
  import from `@/lib/hiring/service` or `@/lib/schema` here — those are
  `server-only` and will break the client build.
- **Reads**: initial board state is fetched server-side and handed in as props;
  components read from the client store, not the database.
- **Writes**: mutate through the store actions in `lib/hiring/store.ts` (which
  apply optimistic updates to the TanStack Query board cache and call the server
  action), never by calling the `'use server'` actions directly from a
  component. See the **server-actions** skill for the store → action → rollback
  contract. The board's client state is backed by TanStack Query (provider in
  the root layout); the chat thread and notification bell use
  `useQuery`/`useMutation` too.
- **One client-state system: TanStack Query.** Server data on the client lives in
  the Query cache — the board via `lib/hiring/store.ts`, chat and notifications
  via their own `useQuery`/`useMutation`. Do not add a second client cache or
  hand-roll a new store for server data; the legacy optimistic store is being
  folded onto Query, not extended.
- **Guard every `queryFn` server action.** A `'use server'` read wired into a
  `useQuery` (`fetchBoard`, `loadThread`, `fetchNotifications`) ships its action
  id in the client bundle and is directly POST-able by an anonymous caller, so it
  MUST resolve and check the session itself (`auth()` / `callerEmail()`) exactly
  like the write actions. A read action with no session gate is an authentication
  bypass.

## Structure

- `HiringApp.tsx` wires the store provider; `Board.tsx` / `StageColumn.tsx` /
  `CandidateCard.tsx` render the pipeline; `DetailDrawer.tsx` + `Detail*.tsx`
  render the candidate detail; `*Modal`/`*Form` handle creation.
- Reusable stateful behavior lives in `hooks/` (`useBoardDnd`, `useInlineEdit`);
  local form-draft state in colocated `use*.ts` files.
- Primitives come from `components/ui/`. Alongside the shadcn Tailwind
  components (`button`, `card`, `input`), it also holds the shared building
  blocks for the app's own look: `Avatar` (the initials circle), `FormError`
  (the conditional error text — renders nothing when the message is falsy), and
  `CloseButton` (the close control). Reuse these instead of re-hand-writing the
  markup; they're shared across hiring, settings and members. Everything is
  styled with Tailwind utilities over the CSS-variable design tokens defined in
  `app/globals.css` (mapped in `tailwind.config.ts`) — there is no separate
  stylesheet.

Keep decision logic (validation, placement, sorting) in `lib/hiring/helpers.ts`
so it stays testable — components should stay presentational. For the frontend
review checklist see the **pr-code-review** skill (`references/frontend.md`).
