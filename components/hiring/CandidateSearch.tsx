'use client';

// Global candidate search for the board toolbar. Selecting a match hands (candidateId, jobId) back to HiringApp; the match rule lives in the pure searchCandidates helper.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  searchCandidates,
  STATUS,
  type Candidate,
  type Job,
  type Source,
  type SeniorityBand,
  type User
} from '@/lib/hiring';
import { Search, Info, Star } from 'lucide-react';

// Candidate-status pill tones (former `.st-*` rules): fg text + tinted bg.
const STATUS_TONE: Record<string, string> = {
  active: 'bg-primary-weak text-primary',
  onhold: 'bg-hold-bg text-hold',
  rejected: 'bg-rej-bg text-rej',
  hired: 'bg-hired-bg text-hired'
};

export default function CandidateSearch({
  candidates,
  jobs,
  users,
  sources,
  bands,
  onSelect
}: {
  candidates: Candidate[];
  jobs: Job[];
  users: User[];
  sources: Source[];
  bands: SeniorityBand[];
  onSelect: (candidateId: number, jobId: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  // Which result the keyboard has highlighted (index into `results`).
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const results = useMemo(
    () => searchCandidates(candidates, query, { jobs, users, sources, bands }),
    [candidates, query, jobs, users, sources, bands]
  );

  // A typed query with the field open is what shows the dropdown.
  const showMenu = open && query.trim().length > 0;

  // Keep the highlighted row in range as results change under the cursor.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Close the results menu on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function choose(candidateId: number, jobId: number) {
    onSelect(candidateId, jobId);
    setQuery('');
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!showMenu || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      const hit = results[activeIndex];
      if (hit) {
        e.preventDefault();
        choose(hit.candidate.id, hit.candidate.jobId);
      }
    }
  }

  const activeOptionId =
    showMenu && results[activeIndex]
      ? `cand-search-opt-${results[activeIndex].candidate.id}`
      : undefined;

  return (
    <div
      className="relative flex min-w-[220px] flex-[0_1_340px] items-center gap-1.5"
      ref={wrapRef}
    >
      <div className="relative min-w-0 flex-[1_1_auto]">
        <span
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs opacity-60"
          aria-hidden
        >
          <Search size={14} aria-hidden />
        </span>
        <input
          className="w-full rounded-md border border-border-strong bg-surface py-[7px] pl-[30px] pr-3 text-[13px] text-foreground focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary-weak"
          type="search"
          role="combobox"
          aria-label="Search candidates"
          aria-expanded={showMenu}
          aria-controls="cand-search-list"
          aria-activedescendant={activeOptionId}
          aria-autocomplete="list"
          placeholder="Search candidates…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />

        {showMenu && (
          <div
            className="absolute left-0 right-0 top-full z-[24] mt-1.5 flex max-h-[380px] flex-col gap-0.5 overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-ds"
            id="cand-search-list"
            role="listbox"
          >
            {results.length === 0 ? (
              <div className="px-2.5 py-3 text-[12.5px] text-muted-foreground">
                No candidates match.
              </div>
            ) : (
              results.map((r, i) => (
                <button
                  key={r.candidate.id}
                  id={`cand-search-opt-${r.candidate.id}`}
                  type="button"
                  role="option"
                  aria-selected={i === activeIndex}
                  className={`flex cursor-pointer flex-col gap-[3px] rounded-[6px] border-0 px-2.5 py-2 text-left text-foreground hover:bg-surface-2 ${
                    i === activeIndex ? 'bg-surface-2' : 'bg-transparent'
                  }`}
                  // onMouseDown (not onClick) so the pick fires before blur closes the menu.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(r.candidate.id, r.candidate.jobId);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex-[1_1_auto] truncate text-[13px] font-semibold">
                      {r.candidate.starred && (
                        <Star
                          size={12}
                          className="mr-1 inline-block shrink-0 fill-star align-[-1px] text-star"
                          aria-hidden
                        />
                      )}
                      {r.candidate.name}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11.5px] font-semibold ${STATUS_TONE[r.candidate.status] ?? ''}`}
                      title={`Status: ${STATUS[r.candidate.status]}`}
                    >
                      {STATUS[r.candidate.status]}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-[5px] text-[11.5px] text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {r.jobTitle}
                    </span>
                    <span className="opacity-50" aria-hidden>
                      ·
                    </span>
                    <span>{r.candidate.stage}</span>
                    {(r.seniority || r.candidate.yearsExperience != null) && (
                      <>
                        <span className="opacity-50" aria-hidden>
                          ·
                        </span>
                        <span>
                          {r.seniority ? `${r.seniority} · ` : ''}
                          {r.candidate.yearsExperience != null
                            ? `${r.candidate.yearsExperience}y`
                            : ''}
                        </span>
                      </>
                    )}
                    <span className="opacity-50" aria-hidden>
                      ·
                    </span>
                    <span>{r.ownerName}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Help shows on hover/focus — no click needed. */}
      <div className="group relative flex flex-[0_0_auto] items-center self-stretch">
        <button
          type="button"
          className="inline-flex cursor-help items-center justify-center self-stretch rounded-md border border-border-strong bg-surface px-2.5 text-[13px] leading-none text-muted-foreground hover:border-primary hover:bg-surface-2 hover:text-primary focus-visible:border-primary focus-visible:bg-surface-2 focus-visible:text-primary"
          aria-label="How candidate search works"
          aria-describedby="cand-search-help"
        >
          <Info size={14} aria-hidden />
        </button>
        <div
          className="absolute right-0 top-full z-[25] mt-1.5 hidden w-[300px] max-w-[86vw] rounded-md border border-border bg-surface px-3.5 py-3 text-[12.5px] text-foreground shadow-ds group-focus-within:block group-hover:block"
          id="cand-search-help"
          role="tooltip"
        >
          <p className="mb-1.5 mt-0 text-xs font-bold uppercase tracking-[0.03em] text-muted-foreground">
            How to search
          </p>
          <p className="m-0">
            Search by name, role, owner, source, stage or status, and type a
            number for minimum years of experience. Combine terms to narrow;
            all must match.
          </p>
          <p className="mb-0 mt-2 text-muted-foreground">
            Example:{' '}
            <code className="rounded-[4px] border border-border bg-surface-2 px-[5px] py-px text-[11.5px]">
              ava linkedin 5
            </code>{' '}
            (named Ava, from LinkedIn, 5+ years)
          </p>
        </div>
      </div>
    </div>
  );
}
