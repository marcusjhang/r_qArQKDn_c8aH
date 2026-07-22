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
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is not set. ' +
      'Add it to your .env.local file (see .env.example) or set it in your deployment environment.'
  );
}

export const db = drizzle(postgres(databaseUrl), { schema });
