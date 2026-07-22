import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  users,
  jobs,
  candidates,
  feedback,
  allowedEmails,
  sources,
  seniorityBands
} from '../lib/schema';
import { count, eq } from 'drizzle-orm';
import { hash } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import {
  SEED_JOBS,
  SEED_CANDIDATES,
  SEED_SOURCES,
  SEED_SENIORITY_BANDS
} from '../lib/hiring/seed';

const SEED_ALLOWED_EMAILS = [
  'benchan@lightsprint.ai',
  'benong@lightsprint.ai',
  'henghonglee@lightsprint.ai',
  'marcusajh0802@gmail.com'
];

// Login accounts created on seed. See resolvePassword below for how each
// account's password is chosen — there is deliberately NO hardcoded default.
// Names are stored as discrete first/last parts (editable from /settings); the
// display name and avatar initials (first word + last word) are derived from
// them — e.g. "Ben Ong" → BO, "Heng Hong Lee" → HL.
const SEED_ACCOUNTS = [
  { email: 'marcusajh0802@gmail.com', firstName: 'Marcus', lastName: 'Ang' },
  { email: 'benong@lightsprint.ai', firstName: 'Ben', lastName: 'Ong' },
  { email: 'benchan@lightsprint.ai', firstName: 'Benedict', lastName: 'Chan' },
  { email: 'henghonglee@lightsprint.ai', firstName: 'Heng Hong', lastName: 'Lee' }
];

// Real, named company accounts. These must never be seeded with a guessable or
// logged password, so seeding them requires SEED_PASSWORD to be set explicitly.
const REAL_ACCOUNT_DOMAIN = '@lightsprint.ai';

/**
 * Choose the plaintext password for a newly-created seed account. Fail-closed,
 * with no hardcoded default:
 *   - If SEED_PASSWORD is set, every new account uses it.
 *   - Otherwise, real @lightsprint.ai accounts throw (set SEED_PASSWORD), while
 *     demo accounts get a random per-account password that is printed ONCE so
 *     local/demo seeding still works without a shared literal.
 * Only called when inserting a new account — existing accounts keep their
 * current password (a re-seed must not clobber a password that was changed).
 */
function resolvePassword(email: string): { password: string; logged: boolean } {
  const configured = process.env.SEED_PASSWORD;
  if (configured) {
    return { password: configured, logged: false };
  }
  if (email.toLowerCase().endsWith(REAL_ACCOUNT_DOMAIN)) {
    throw new Error(
      `SEED_PASSWORD is not set. Refusing to seed the real account ${email} ` +
        `with a default password. Set SEED_PASSWORD to a strong value and re-run ` +
        `(see SECURITY.md).`
    );
  }
  // Demo account: generate a strong random password so seeding still works
  // without a shared literal. Printed once below; not stored in plaintext.
  return { password: randomBytes(18).toString('base64url'), logged: true };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  const client = postgres(process.env.DATABASE_URL);
  const db = drizzle(client);

  // Seed login accounts. Idempotent and non-destructive: a new account is
  // inserted with a password chosen by resolvePassword; an existing account
  // keeps its current password (never reset on re-seed) and only has its
  // display name refreshed.
  for (const acc of SEED_ACCOUNTS) {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, acc.email))
      .limit(1);
    if (existing) {
      await db
        .update(users)
        .set({
          firstName: acc.firstName,
          lastName: acc.lastName
        })
        .where(eq(users.email, acc.email));
      console.log(`Updated login account ${acc.email} (password preserved).`);
    } else {
      const { password, logged } = resolvePassword(acc.email);
      const passwordHash = await hash(password, 12);
      await db.insert(users).values({
        firstName: acc.firstName,
        lastName: acc.lastName,
        email: acc.email,
        passwordHash
      });
      if (logged) {
        console.log(
          `Seeded login account ${acc.email} with generated password: ${password}\n` +
            `  (shown once — save it now; set SEED_PASSWORD to choose your own)`
        );
      } else {
        console.log(`Seeded login account ${acc.email}.`);
      }
    }
  }

  // Seed the signup allowlist (idempotent via the unique email constraint).
  for (const email of SEED_ALLOWED_EMAILS) {
    await db.insert(allowedEmails).values({ email }).onConflictDoNothing();
  }
  console.log(`Ensured ${SEED_ALLOWED_EMAILS.length} allowlisted emails.`);

  // Seed the candidate sources (idempotent via the unique name constraint).
  // Always ensured — the source picklist is read from this table, so it must
  // hold the canonical options even when the hiring pipeline seed is skipped.
  for (const name of SEED_SOURCES) {
    await db.insert(sources).values({ name }).onConflictDoNothing();
  }
  console.log(`Ensured ${SEED_SOURCES.length} candidate sources.`);

  // Seed the seniority bands (idempotent via the unique min_years constraint).
  // The board reads this table for the years-of-experience → label mapping, so
  // ensure the defaults exist even when the pipeline seed below is skipped.
  for (const band of SEED_SENIORITY_BANDS) {
    await db
      .insert(seniorityBands)
      .values({ label: band.label, minYears: band.minYears })
      .onConflictDoNothing();
  }
  console.log(`Ensured ${SEED_SENIORITY_BANDS.length} seniority bands.`);

  // Seed the hiring pipeline (jobs → candidates → feedback), idempotently.
  const [{ value: jobCount }] = await db
    .select({ value: count() })
    .from(jobs);
  if (jobCount > 0) {
    console.log(`Skipping hiring seed: jobs table already has ${jobCount} rows.`);
  } else {
    console.log('Seeding hiring pipeline...');
    // Owner / feedback authors are seed-referenced by email; resolve each to
    // the account's serial id (the accounts were just created/updated above).
    const userRows = await db
      .select({ id: users.id, email: users.email })
      .from(users);
    const userIdByEmail = new Map(userRows.map((u) => [u.email, u.id]));
    const resolveUser = (email: string): number => {
      const id = userIdByEmail.get(email);
      if (id === undefined) {
        throw new Error(`Seed references unknown user email: ${email}`);
      }
      return id;
    };
    // Candidates reference their source by name; resolve to the sources.id.
    const sourceRows = await db
      .select({ id: sources.id, name: sources.name })
      .from(sources);
    const sourceIdByName = new Map(sourceRows.map((s) => [s.name, s.id]));
    const resolveSource = (name: string): number => {
      const id = sourceIdByName.get(name);
      if (id === undefined) {
        throw new Error(`Seed references unknown source: ${name}`);
      }
      return id;
    };
    // Insert jobs and map each seed slug to its generated id.
    const slugToId = new Map<string, number>();
    for (let i = 0; i < SEED_JOBS.length; i++) {
      const j = SEED_JOBS[i];
      const [row] = await db
        .insert(jobs)
        .values({ title: j.title, stages: j.stages, position: i })
        .returning({ id: jobs.id });
      slugToId.set(j.slug, row.id);
    }

    let candidateCount = 0;
    let feedbackCount = 0;
    for (const c of SEED_CANDIDATES) {
      const jobId = slugToId.get(c.job);
      if (jobId === undefined) continue;
      const [row] = await db
        .insert(candidates)
        .values({
          jobId,
          name: c.name,
          stage: c.stage,
          owner: resolveUser(c.owner),
          source: resolveSource(c.source),
          yearsExperience: c.yearsExperience,
          status: c.status,
          starred: c.starred ?? false
        })
        .returning({ id: candidates.id });
      candidateCount++;
      if (c.feedback.length) {
        await db.insert(feedback).values(
          c.feedback.map((f) => ({
            candidateId: row.id,
            byUser: resolveUser(f.by),
            rating: f.v,
            note: f.note
          }))
        );
        feedbackCount += c.feedback.length;
      }
    }
    console.log(
      `Seeded ${slugToId.size} jobs, ${candidateCount} candidates, ${feedbackCount} feedback entries.`
    );
  }

  await client.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
