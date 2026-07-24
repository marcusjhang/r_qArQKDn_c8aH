// Client-safe DTOs for the Members page, split out from the `server-only` reads
// in lib/members.ts so the client MembersView can import them without the server module.

/** The kinds of recorded action shown in a member's activity timeline. */
export type MemberActivityKind = 'joined' | 'feedback' | 'message';

/** One attributed action a member performed, newest-first in the timeline. */
export interface MemberActivity {
  /** Stable, unique across all kinds (e.g. `feedback-12`) for React keys. */
  id: string;
  kind: MemberActivityKind;
  /** ISO timestamp — safe to serialize to the client, formatted there. */
  at: string;
  /** Human summary of the action (e.g. 'Rated Strong Yes'). */
  summary: string;
  /** The candidate the action was about, when the action targets one. */
  candidateName: string | null;
}

/** A member account plus a derived history of the actions they performed. */
export interface Member {
  id: number;
  /** Display name (first + last, falling back to email) — same rule as avatars. */
  name: string;
  /** Avatar initials, derived like everywhere else in the app. */
  initials: string;
  email: string;
  joinedAt: string; // ISO
  /** How many feedback entries this member has submitted. */
  feedbackCount: number;
  /** How many chat messages this member has posted. */
  messageCount: number;
  /** Most recent actions first, capped at MEMBER_ACTIVITY_LIMIT. */
  activity: MemberActivity[];
  /** True when older activity was trimmed from `activity`. */
  activityTruncated: boolean;
}
