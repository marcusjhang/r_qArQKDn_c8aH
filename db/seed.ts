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
  seniorityBands,
  stageSlas
} from '../lib/schema';
import { count, eq } from 'drizzle-orm';
import { hash } from 'bcryptjs';
import {
  SEED_JOBS,
  SEED_CANDIDATES,
  SEED_SOURCES,
  SEED_SENIORITY_BANDS,
  SEED_STAGE_SLAS
} from '../lib/hiring/seed';

const SEED_ALLOWED_EMAILS = [
  'benchan@lightsprint.ai',
  'benong@lightsprint.ai',
  'henghonglee@lightsprint.ai',
  'marcusajh0802@gmail.com'
];

// Login accounts created on seed. Override the shared password via SEED_PASSWORD.
// One account per allowlisted user; all share the same seeded password.
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'password';
// Names are stored as discrete first/last parts (editable from /settings); the
// display name and avatar initials (first word + last word) are derived from
// them — e.g. "Ben Ong" → BO, "Heng Hong Lee" → HL.
const SEED_ACCOUNTS = [
  { email: 'marcusajh0802@gmail.com', firstName: 'Marcus', lastName: 'Ang' },
  { email: 'benong@lightsprint.ai', firstName: 'Ben', lastName: 'Ong' },
  { email: 'benchan@lightsprint.ai', firstName: 'Benedict', lastName: 'Chan' },
  { email: 'henghonglee@lightsprint.ai', firstName: 'Heng Hong', lastName: 'Lee' }
];

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  const client = postgres(process.env.DATABASE_URL);
  const db = drizzle(client);

  // Seed login accounts (idempotent: create, or reset password if present).
  // Every account is created/reset to the shared default password, so each one
  // must change it on first login — mustChangePassword is set true here and
  // cleared by the /change-password flow (see lib/auth.ts + SECURITY.md).
  const passwordHash = await hash(SEED_PASSWORD, 12);
  for (const acc of SEED_ACCOUNTS) {
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, acc.email))
      .limit(1);
    if (existing) {
      // Re-seeding resets the account back to the default password, so require
      // a change again even if the user had already picked their own.
      await db
        .update(users)
        .set({
          passwordHash,
          firstName: acc.firstName,
          lastName: acc.lastName,
          mustChangePassword: true
        })
        .where(eq(users.email, acc.email));
      console.log(`Updated login account ${acc.email}.`);
    } else {
      await db.insert(users).values({
        firstName: acc.firstName,
        lastName: acc.lastName,
        email: acc.email,
        passwordHash,
        mustChangePassword: true
      });
      console.log(`Seeded login account ${acc.email}.`);
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

  // Seed the stage time-limits (idempotent via the unique lower(stage) index).
  // The board reads this table for the "warn after N days" mapping, so ensure
  // the defaults exist even when the pipeline seed below is skipped.
  for (const sla of SEED_STAGE_SLAS) {
    await db
      .insert(stageSlas)
      .values({ stage: sla.stage, maxDays: sla.maxDays })
      .onConflictDoNothing();
  }
  console.log(`Ensured ${SEED_STAGE_SLAS.length} stage time-limits.`);

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
      // Backdate the stage clock so the demo shows a realistic mix of fresh and
      // stalled applicants. Omitted daysInStage → let the column default (now).
      const stageEnteredAt =
        c.daysInStage != null
          ? new Date(Date.now() - c.daysInStage * 86_400_000)
          : undefined;
      const [row] = await db
        .insert(candidates)
        .values({
          jobId,
          name: c.name,
          stage: c.stage,
          ...(stageEnteredAt ? { stageEnteredAt } : {}),
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
