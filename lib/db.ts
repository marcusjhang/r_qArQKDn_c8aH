import 'server-only';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export { users, type SelectUser } from './schema';
export {
  jobs,
  candidates,
  feedback,
  candidateStatusEnum,
  type SelectJob,
  type SelectCandidate,
  type SelectFeedback
} from './schema';

// Pass the schema (incl. relations) so the db.query relational API is available.
export const db = drizzle(postgres(process.env.DATABASE_URL!), { schema });
