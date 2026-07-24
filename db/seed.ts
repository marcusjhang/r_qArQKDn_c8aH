import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  users,
  jobs,
  candidates,
  feedback,
  messages,
  mentions,
  allowedEmails,
  sources,
  seniorityBands,
  pipelineSettings
} from '../lib/schema';
import { count, eq } from 'drizzle-orm';
import { hash } from 'bcryptjs';
import {
  SEED_JOBS,
  SEED_CANDIDATES,
  SEED_MESSAGES,
  SEED_SOURCES,
  SEED_SENIORITY_BANDS
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
// Names are stored as discrete first/last parts; display name and initials are
// derived from them (e.g. "Ben Ong" → BO, "Heng Hong Lee" → HL).
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

  // Seed login accounts idempotently. New accounts get the shared default
  // password and mustChangePassword=true; existing accounts keep their own
  // password/flag (only the display name is synced) so a redeploy never reverts
  // a user's password. To force a reset, delete the row first.
  const passwordHash = await hash(SEED_PASSWORD, 12);
  for (const acc of SEED_ACCOUNTS) {
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, acc.email))
      .limit(1);
    if (existing) {
      // Sync the display name only; preserve the account's password + flag.
      await db
        .update(users)
        .set({ firstName: acc.firstName, lastName: acc.lastName })
        .where(eq(users.email, acc.email));
      console.log(`Login account ${acc.email} exists; left credentials as-is.`);
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
  // Always ensured — the source picklist reads this table even when the
  // pipeline seed below is skipped.
  for (const name of SEED_SOURCES) {
    await db.insert(sources).values({ name }).onConflictDoNothing();
  }
  console.log(`Ensured ${SEED_SOURCES.length} candidate sources.`);

  // Seed the seniority bands (idempotent via the unique min_years constraint).
  // The board reads this table for the years → label mapping.
  for (const band of SEED_SENIORITY_BANDS) {
    await db
      .insert(seniorityBands)
      .values({ label: band.label, minYears: band.minYears })
      .onConflictDoNothing();
  }
  console.log(`Ensured ${SEED_SENIORITY_BANDS.length} seniority bands.`);

  // Ensure the single pipeline_settings row (the universal stage-warn threshold)
  // exists — inserted only when the table is empty; the column default seeds it.
  const [{ value: settingsCount }] = await db
    .select({ value: count() })
    .from(pipelineSettings);
  if (settingsCount === 0) {
    await db.insert(pipelineSettings).values({});
  }
  console.log('Ensured pipeline settings (stage-warn threshold).');

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
        .values({
          title: j.title,
          stages: j.stages,
          traits: j.traits,
          description: j.description,
          starred: j.starred ?? false,
          position: i
        })
        .returning({ id: jobs.id });
      slugToId.set(j.slug, row.id);
    }

    // Map each candidate's name to its generated id so the discussion threads
    // (seeded below) can resolve their candidate by the same readable key.
    const candidateIdByName = new Map<string, number>();
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
          linkedinUrl: c.linkedinUrl ?? null,
          githubUrl: c.githubUrl ?? null,
          yearsExperience: c.yearsExperience,
          status: c.status,
          starred: c.starred ?? false
        })
        .returning({ id: candidates.id });
      candidateIdByName.set(c.name, row.id);
      candidateCount++;
      if (c.feedback.length) {
        await db.insert(feedback).values(
          c.feedback.map((f) => ({
            candidateId: row.id,
            byUser: resolveUser(f.by),
            traitScores: f.traits ?? {},
            stage: c.stage,
            note: f.note
          }))
        );
        feedbackCount += c.feedback.length;
      }
    }

    // Seed the discussion threads and their @-mention notifications, resolving
    // candidate by name and author by email, backdated per `daysAgo`.
    let messageCount = 0;
    let mentionCount = 0;
    for (const msg of SEED_MESSAGES) {
      const candidateId = candidateIdByName.get(msg.candidate);
      if (candidateId === undefined) {
        throw new Error(`Seed message references unknown candidate: ${msg.candidate}`);
      }
      const createdAt =
        msg.daysAgo != null
          ? new Date(Date.now() - msg.daysAgo * 86_400_000)
          : undefined;
      const [row] = await db
        .insert(messages)
        .values({
          candidateId,
          authorId: resolveUser(msg.by),
          body: msg.body,
          ...(createdAt ? { createdAt } : {})
        })
        .returning({ id: messages.id });
      messageCount++;
      for (const email of msg.mentions ?? []) {
        await db.insert(mentions).values({
          messageId: row.id,
          userId: resolveUser(email),
          readAt: msg.read ? new Date() : null,
          ...(createdAt ? { createdAt } : {})
        });
        mentionCount++;
      }
    }

    console.log(
      `Seeded ${slugToId.size} jobs, ${candidateCount} candidates, ${feedbackCount} feedback entries, ${messageCount} messages, ${mentionCount} mentions.`
    );
  }

  await client.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
