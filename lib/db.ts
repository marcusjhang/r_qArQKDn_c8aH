import 'server-only';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export { users, type SelectUser, allowedEmails, type SelectAllowedEmail } from './schema';
export {
  jobs,
  candidates,
  feedback,
  candidateStatusEnum,
  type SelectJob,
  type SelectCandidate,
  type SelectFeedback
} from './schema';
export {
  interviewerSettings,
  interviewerAvailability,
  availabilityExceptions,
  interviews,
  interviewPanel,
  bookingTokens,
  emailOutbox,
  notifications,
  type SelectInterviewerSettings,
  type SelectInterviewerAvailability,
  type SelectAvailabilityException,
  type SelectInterview,
  type SelectInterviewPanel,
  type SelectBookingToken,
  type SelectEmailOutbox,
  type SelectNotification
} from './schema';

// Pass the schema (incl. relations) so the db.query relational API is available.
export const db = drizzle(postgres(process.env.DATABASE_URL!), { schema });
