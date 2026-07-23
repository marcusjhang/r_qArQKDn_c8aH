// The board shell's overlay state machine.
//
// At most one overlay is ever open over the board: the candidate detail drawer,
// the add-candidate modal, or the new-job modal. The shell (`HiringApp`) used
// to model that modality as four independent pieces of `useState` — `openId`,
// `focusMessageId`, `addingCandidate`, `creatingJob` — whose 2^n combinations
// admitted impossible states (both modals "open" at once, a `focusMessageId`
// lingering with no drawer, …) and forced several `setState` calls to be kept
// in sync by hand on every open/close.
//
// Collapsing that cluster into one discriminated union makes the illegal
// combinations unrepresentable and turns every open/close into a single
// dispatch. Each transition is a pure `(state, event) => state` function,
// mirroring the board's *data* reducer (`./reducer`); the shell derives the
// per-overlay props it renders from the union. Framework-free and unit-tested
// (see test/unit/hiring-overlay.test.ts), like the other pure rules in this
// domain.

/** The single overlay currently open over the board, if any. */
export type Overlay =
  | { kind: 'none' }
  // The candidate detail drawer. `focusMessageId` is the chat message to scroll
  // to when the drawer was opened from a notification (null otherwise).
  | { kind: 'detail'; candidateId: number; focusMessageId: number | null }
  // The add-candidate modal (for the active job).
  | { kind: 'addCandidate' }
  // The new-job modal.
  | { kind: 'newJob' };

/** The transitions the shell can request on the overlay. */
export type OverlayEvent =
  | {
      type: 'openCandidate';
      candidateId: number;
      focusMessageId?: number | null;
    }
  | { type: 'openAddCandidate' }
  | { type: 'openNewJob' }
  | { type: 'close' };

/** The closed state — no overlay open. */
export const NO_OVERLAY: Overlay = { kind: 'none' };

/** Pure overlay transition: every open replaces whatever was open before. */
export function overlayReducer(state: Overlay, event: OverlayEvent): Overlay {
  switch (event.type) {
    case 'openCandidate':
      return {
        kind: 'detail',
        candidateId: event.candidateId,
        focusMessageId: event.focusMessageId ?? null
      };
    case 'openAddCandidate':
      return { kind: 'addCandidate' };
    case 'openNewJob':
      return { kind: 'newJob' };
    case 'close':
      return NO_OVERLAY;
    default:
      return state;
  }
}
