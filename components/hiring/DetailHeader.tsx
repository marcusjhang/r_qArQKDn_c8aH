'use client';

// Drawer header: favourite star, candidate name + job/source subline, and the
// close control.

import type { Candidate, Job } from '@/lib/hiring';
import ProfileLinks from './ProfileLinks';

export default function DetailHeader({
  view,
  job,
  onToggleStar,
  onClose
}: {
  view: Candidate | null;
  job: Job | undefined;
  onToggleStar: (id: number, starred: boolean) => void;
  onClose: () => void;
}) {
  return (
    <div className="drawer-head">
      <button
        className="drawer-star"
        aria-pressed={view?.starred ?? false}
        title={view?.starred ? 'Unstar candidate' : 'Star candidate'}
        onClick={() => view && onToggleStar(view.id, !view.starred)}
      >
        {view?.starred ? '★' : '☆'}
      </button>
      <div className="who">
        <h2>{view?.name ?? '—'}</h2>
        <div className="sub">
          {view && job ? `${job.title} · ${view.source}` : ''}
        </div>
        {view && (
          <ProfileLinks
            linkedinUrl={view.linkedinUrl}
            githubUrl={view.githubUrl}
            withLabels
          />
        )}
      </div>
      <button className="close" aria-label="Close" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}
