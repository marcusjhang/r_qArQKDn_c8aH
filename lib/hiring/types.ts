// UI/domain type surface for the hiring tracker. The DTOs are owned by ./service; re-exported here via `export type` so the `server-only` module never reaches the client bundle.

export type {
  User,
  Source,
  SeniorityBand,
  Feedback,
  Candidate,
  Job,
  HiringState,
  Status,
  RatingValue,
  TraitScores
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
