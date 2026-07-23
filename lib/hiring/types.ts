// UI/domain type surface for the Hiring Pipeline Tracker.
//
// The DTO interfaces are OWNED by the hiring service facade (./service), which
// projects them from the Drizzle schema and guards them against drift. They are
// re-exported here — via `export type`, so nothing from the `server-only`
// service module is pulled into the client bundle at runtime — giving client
// code (components, store, config, helpers) a stable, framework-free import.

export type {
  User,
  Source,
  SeniorityBand,
  StageSla,
  Feedback,
  Candidate,
  Job,
  HiringState,
  Status,
  RatingValue
} from './service';

/* ---------- Chat / mentions / notifications ---------- */

/** One @-mention embedded in a message (the tagged user, for highlighting). */
interface MessageMention {
  userId: number;
  name: string;
}

/** A single chat message on a candidate's discussion thread. */
export interface ChatMessage {
  id: number;
  candidateId: number;
  authorId: number;
  authorName: string;
  authorInitials: string;
  body: string;
  createdAt: string; // ISO string — safe to pass to the client
  mentions: MessageMention[];
}

/** An unread/recent mention shown in the current account's notification inbox. */
export interface Notification {
  id: number; // the mention id
  messageId: number;
  candidateId: number;
  candidateName: string;
  jobId: number;
  authorName: string;
  body: string;
  createdAt: string; // ISO string
  read: boolean;
}
