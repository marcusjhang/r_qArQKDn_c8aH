// The board shell's overlay state machine: one discriminated union for the at-most-one open overlay (detail drawer / add-candidate / new-job / import), so illegal combinations are unrepresentable and every open/close is a single pure dispatch.

/** The single overlay currently open over the board, if any. */
export type Overlay =
  | { kind: 'none' }
  // The candidate detail drawer; `focusMessageId` is the message to scroll to when opened from a notification (null otherwise).
  | { kind: 'detail'; candidateId: number; focusMessageId: number | null }
  // The add-candidate modal (for the active job).
  | { kind: 'addCandidate' }
  // The new-job modal.
  | { kind: 'newJob' }
  // The CSV import dialog.
  | { kind: 'import' };

/** The transitions the shell can request on the overlay. */
export type OverlayEvent =
  | {
      type: 'openCandidate';
      candidateId: number;
      focusMessageId?: number | null;
    }
  | { type: 'openAddCandidate' }
  | { type: 'openNewJob' }
  | { type: 'openImport' }
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
    case 'openImport':
      return { kind: 'import' };
    case 'close':
      return NO_OVERLAY;
    default:
      return state;
  }
}
