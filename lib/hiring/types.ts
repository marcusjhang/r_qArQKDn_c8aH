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
  Feedback,
  Candidate,
  Job,
  HiringState,
  Status,
  RatingValue
} from './service';
