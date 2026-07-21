import 'server-only';

// Server-side read of the whole board, assembled into the exact shape the UI
// expects: jobs + candidates with embedded feedback. Returns plain,
// serializable objects (no Date instances cross to the client).

import { asc } from 'drizzle-orm';
import { db, jobs, candidates, feedback } from '@/lib/db';
import type { Candidate, Feedback, HiringState, RatingValue, Status } from './types';

export async function getBoardData(): Promise<HiringState> {
  const [jobRows, candRows, fbRows] = await Promise.all([
    db.select().from(jobs).orderBy(asc(jobs.position), asc(jobs.id)),
    db
      .select()
      .from(candidates)
      .orderBy(asc(candidates.createdAt), asc(candidates.id)),
    db.select().from(feedback).orderBy(asc(feedback.id))
  ]);

  const feedbackByCandidate = new Map<number, Feedback[]>();
  for (const f of fbRows) {
    const list = feedbackByCandidate.get(f.candidateId) ?? [];
    list.push({
      id: f.id,
      by: f.byFounder,
      v: f.rating as RatingValue,
      note: f.note
    });
    feedbackByCandidate.set(f.candidateId, list);
  }

  return {
    jobs: jobRows.map((j) => ({
      id: j.id,
      title: j.title,
      stages: j.stages
    })),
    candidates: candRows.map<Candidate>((c) => ({
      id: c.id,
      job: c.jobId,
      name: c.name,
      stage: c.stage,
      owner: c.owner,
      source: c.source,
      status: c.status as Status,
      feedback: feedbackByCandidate.get(c.id) ?? []
    }))
  };
}
