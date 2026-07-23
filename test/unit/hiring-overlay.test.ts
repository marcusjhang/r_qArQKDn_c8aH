import { describe, it, expect } from 'vitest';
import {
  NO_OVERLAY,
  overlayReducer,
  type Overlay
} from '@/lib/hiring/overlay';

describe('overlayReducer', () => {
  it('starts closed', () => {
    expect(NO_OVERLAY).toEqual({ kind: 'none' });
  });

  it('opens the detail drawer with no focused message by default', () => {
    const next = overlayReducer(NO_OVERLAY, {
      type: 'openCandidate',
      candidateId: 7
    });
    expect(next).toEqual({
      kind: 'detail',
      candidateId: 7,
      focusMessageId: null
    });
  });

  it('opens the detail drawer with a focused message (from a notification)', () => {
    const next = overlayReducer(NO_OVERLAY, {
      type: 'openCandidate',
      candidateId: 7,
      focusMessageId: 42
    });
    expect(next).toEqual({
      kind: 'detail',
      candidateId: 7,
      focusMessageId: 42
    });
  });

  it('opens the add-candidate and new-job modals', () => {
    expect(overlayReducer(NO_OVERLAY, { type: 'openAddCandidate' })).toEqual({
      kind: 'addCandidate'
    });
    expect(overlayReducer(NO_OVERLAY, { type: 'openNewJob' })).toEqual({
      kind: 'newJob'
    });
  });

  it('closes any open overlay', () => {
    const open: Overlay = { kind: 'addCandidate' };
    expect(overlayReducer(open, { type: 'close' })).toEqual(NO_OVERLAY);
  });

  it('replaces the current overlay rather than stacking (only one at a time)', () => {
    // Opening a candidate while a modal is open swaps to the drawer — the two
    // can never be open simultaneously, which is the whole point of the union.
    const modal: Overlay = { kind: 'newJob' };
    const next = overlayReducer(modal, {
      type: 'openCandidate',
      candidateId: 3
    });
    expect(next).toEqual({
      kind: 'detail',
      candidateId: 3,
      focusMessageId: null
    });
  });
});
