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

## Structure

- `HiringApp.tsx` wires the store provider; `Board.tsx` / `StageColumn.tsx` /
  `CandidateCard.tsx` render the pipeline; `DetailDrawer.tsx` + `Detail*.tsx`
  render the candidate detail; `*Modal`/`*Form` handle creation.
- Reusable stateful behavior lives in `hooks/` (`useBoardDnd`, `useInlineEdit`);
  local form-draft state in colocated `use*.ts` files.
- Primitives come from `components/ui/` (shadcn). Styles: Tailwind plus the
  scoped `hiring.css`.

Keep decision logic (validation, placement, sorting) in `lib/hiring/helpers.ts`
so it stays testable — components should stay presentational. For the frontend
review checklist see the **pr-code-review** skill (`references/frontend.md`).
