import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  users,
  jobs,
  candidates,
  feedback,
  allowedEmails,
  interviewerAvailability,
  interviews,
  interviewPanel
} from '../lib/schema';
import { count, eq } from 'drizzle-orm';
import { hash } from 'bcryptjs';
import { SEED_JOBS, SEED_CANDIDATES, SEED_INTERVIEWS } from '../lib/hiring/seed';
import {
  FOUNDERS,
  BUSINESS_DAYS,
  DEFAULT_WORK_HOURS,
  COMPANY_TZ,
  INTERVIEW_DEFAULTS
} from '../lib/hiring/config';
import { zonedWallClockToUtc } from '../lib/hiring/scheduling/tz';

const SEED_ALLOWED_EMAILS = [
  'benchan@lightsprint.ai',
  'benong@lightsprint.ai',
  'henghonglee@lightsprint.ai',
  'marcusajh0802@gmail.com'
];

// Login accounts created on seed. Override the shared password via SEED_PASSWORD.
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'password';
const SEED_ACCOUNTS = [
  { email: 'marcusajh0802@gmail.com', name: 'Marcus Ang' }
];

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  const client = postgres(process.env.DATABASE_URL);
  const db = drizzle(client);

  // Seed login accounts (idempotent: create, or reset password if present).
  const passwordHash = await hash(SEED_PASSWORD, 12);
  for (const acc of SEED_ACCOUNTS) {
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, acc.email))
      .limit(1);
    if (existing) {
      await db
        .update(users)
        .set({ passwordHash, name: acc.name })
        .where(eq(users.email, acc.email));
      console.log(`Updated login account ${acc.email}.`);
    } else {
      await db.insert(users).values({
        name: acc.name,
        email: acc.email,
        passwordHash
      });
      console.log(`Seeded login account ${acc.email}.`);
    }
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

    const DAY_MS = 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const candidateByName = new Map<
      string,
      { id: number; jobId: number; stage: string }
    >();
    let candidateCount = 0;
    let feedbackCount = 0;
    for (const c of SEED_CANDIDATES) {
      const jobId = slugToId.get(c.job);
      if (jobId === undefined) continue;
      const stageEnteredAt = new Date(nowMs - (c.daysInStage ?? 0) * DAY_MS);
      const scheduledAt =
        c.scheduledInDays === undefined
          ? null
          : new Date(nowMs + c.scheduledInDays * DAY_MS);
      const completedAt =
        c.completedDaysAgo === undefined
          ? null
          : new Date(nowMs - c.completedDaysAgo * DAY_MS);
      const [row] = await db
        .insert(candidates)
        .values({
          jobId,
          name: c.name,
          stage: c.stage,
          owner: c.owner,
          source: c.source,
          status: c.status,
          starred: c.starred ?? false,
          stageEnteredAt,
          scheduleStatus: c.scheduleStatus ?? null,
          scheduledAt,
          completedAt
        })
        .returning({ id: candidates.id });
      candidateByName.set(c.name, { id: row.id, jobId, stage: c.stage });
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

    // Interviewer weekly availability: Mon–Fri, default work hours.
    const availRows = FOUNDERS.flatMap((f) =>
      BUSINESS_DAYS.map((weekday) => ({
        founderId: f.id,
        weekday,
        startMinute: DEFAULT_WORK_HOURS.startMinute,
        endMinute: DEFAULT_WORK_HOURS.endMinute
      }))
    );
    await db.insert(interviewerAvailability).values(availRows);

    // Demo interviews wired to the seeded candidates.
    const ymdInTz = (ms: number) =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: COMPANY_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date(ms));
    let interviewCount = 0;
    for (const iv of SEED_INTERVIEWS) {
      const cand = candidateByName.get(iv.candidate);
      if (!cand) continue;
      const def = INTERVIEW_DEFAULTS[iv.type];
      const ymd = ymdInTz(nowMs + iv.startOffsetDays * DAY_MS);
      const start = zonedWallClockToUtc(ymd, iv.hour * 60, COMPANY_TZ);
      const end = new Date(start.getTime() + def.durationMin * 60_000);
      const [ivRow] = await db
        .insert(interviews)
        .values({
          candidateId: cand.id,
          jobId: cand.jobId,
          type: iv.type,
          status: iv.status,
          startsAt: start,
          endsAt: end,
          durationMin: def.durationMin,
          bufferMin: def.bufferMin,
          locationKind: 'video',
          stageAtBooking: cand.stage
        })
        .returning({ id: interviews.id });
      await db.insert(interviewPanel).values(
        iv.panel.map((m) => ({
          interviewId: ivRow.id,
          founderId: m.founderId,
          role: m.role
        }))
      );
      interviewCount++;
    }
    console.log(
      `Seeded ${availRows.length} availability rows, ${interviewCount} interviews.`
    );
  }

  await client.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
