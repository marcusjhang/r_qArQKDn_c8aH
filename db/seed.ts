import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { users, jobs, candidates, feedback, allowedEmails } from '../lib/schema';
import { count, eq } from 'drizzle-orm';
import { hash } from 'bcryptjs';
import { SEED_JOBS, SEED_CANDIDATES } from '../lib/hiring/seed';

const SEED_ALLOWED_EMAILS = [
  'benchan@lightsprint.ai',
  'benong@lightsprint.ai',
  'henghonglee@lightsprint.ai',
  'marcusajh0802@gmail.com'
];

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  const client = postgres(process.env.DATABASE_URL);
  const db = drizzle(client);

  // Seed the admin login account (admin@admin.com / password)
  const passwordHash = await hash('password', 12);
  const [existingAdmin] = await db
    .select()
    .from(users)
    .where(eq(users.email, 'admin@admin.com'))
    .limit(1);

  if (existingAdmin) {
    await db
      .update(users)
      .set({ passwordHash, role: 'admin' })
      .where(eq(users.email, 'admin@admin.com'));
    console.log('Updated admin user password.');
  } else {
    await db.insert(users).values({
      name: 'Admin',
      email: 'admin@admin.com',
      passwordHash,
      role: 'admin'
    });
    console.log('Seeded admin user (admin@admin.com / password).');
  }

  // Seed the signup allowlist (idempotent via the unique email constraint).
  for (const email of SEED_ALLOWED_EMAILS) {
    await db.insert(allowedEmails).values({ email }).onConflictDoNothing();
  }
  console.log(`Ensured ${SEED_ALLOWED_EMAILS.length} allowlisted emails.`);

  // Seed the hiring pipeline (jobs → candidates → feedback), idempotently.
  const [{ value: jobCount }] = await db
    .select({ value: count() })
    .from(jobs);
  if (jobCount > 0) {
    console.log(`Skipping hiring seed: jobs table already has ${jobCount} rows.`);
  } else {
    console.log('Seeding hiring pipeline...');
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
          owner: c.owner,
          source: c.source,
          status: c.status
        })
        .returning({ id: candidates.id });
      candidateCount++;
      if (c.feedback.length) {
        await db.insert(feedback).values(
          c.feedback.map((f) => ({
            candidateId: row.id,
            byFounder: f.by,
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
