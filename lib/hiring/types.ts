// Core domain types for the Hiring Pipeline Tracker.
// Kept free of any framework/DB imports so the model stays portable.

export type RatingValue = 1 | 2 | 3 | 4;

export type Status = 'active' | 'onhold' | 'rejected' | 'hired';

export interface Founder {
  id: string;
  name: string;
  initials: string;
}

export interface Feedback {
  /** Founder id of the interviewer who left this entry. */
  by: string;
  /** 4-point verdict rating (1 = Strong No … 4 = Strong Yes). */
  v: RatingValue;
  note: string;
}

export interface Candidate {
  id: number;
  /** Job id the candidate belongs to. */
  job: string;
  name: string;
  /** Current stage name (must be one of the owning job's stages). */
  stage: string;
  /** Owner founder id — the single accountable person. */
  owner: string;
  source: string;
  status: Status;
  feedback: Feedback[];
}

export interface Job {
  id: string;
  title: string;
  /** Ordered, per-job stage list. Fully editable at runtime. */
  stages: string[];
}

export interface HiringState {
  jobs: Job[];
  candidates: Candidate[];
  /** Next candidate id to hand out on quick-add. */
  nextId: number;
}
