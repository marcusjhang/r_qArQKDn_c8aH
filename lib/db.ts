import 'server-only';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export { users, type SelectUser, allowedEmails, type SelectAllowedEmail } from './schema';
export {
  jobs,
  candidates,
  feedback,
  messages,
  mentions,
  candidateStatusEnum,
  type SelectJob,
  type SelectCandidate,
  type SelectFeedback,
  type SelectMessage,
  type SelectMention
} from './schema';

// Pass the schema (incl. relations) so the db.query relational API is available.
export const db = drizzle(postgres(process.env.DATABASE_URL!), { schema });
