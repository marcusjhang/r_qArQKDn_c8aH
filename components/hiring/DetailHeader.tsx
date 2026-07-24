'use client';

// Drawer header: favourite star, candidate name + job/source subline, and the
// close control.

import { Star } from 'lucide-react';
import { sourceName, type Candidate, type Job, type Source } from '@/lib/hiring';
import { CloseButton } from '@/components/ui/close-button';
import ProfileLinks from './ProfileLinks';

export default function DetailHeader({
  view,
  job,
  sources,
  onToggleStar,
  onClose
}: {
  view: Candidate | null;
  job: Job | undefined;
  sources: Source[];
  onToggleStar: (id: number, starred: boolean) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border p-4">
      <button
        className="inline-flex flex-none cursor-pointer items-center p-0.5 text-muted-foreground hover:text-primary aria-pressed:text-primary"
        aria-pressed={view?.starred ?? false}
        title={view?.starred ? 'Unstar candidate' : 'Star candidate'}
        onClick={() => view && onToggleStar(view.id, !view.starred)}
      >
        <Star size={20} className={view?.starred ? 'fill-current' : undefined} aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <h2 className="mb-[3px] text-[18px]">{view?.name ?? '—'}</h2>
        <div className="text-[12.5px] text-muted-foreground">
          {view && job ? `${job.title} · ${sourceName(sources, view.source)}` : ''}
        </div>
        {view && (
          <ProfileLinks
            linkedinUrl={view.linkedinUrl}
            githubUrl={view.githubUrl}
            withLabels
          />
        )}
      </div>
      <CloseButton onClick={onClose} />
    </div>
  );
}
