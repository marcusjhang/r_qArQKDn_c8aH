'use client';

// Global candidate search for the board toolbar: one text box plus an ⓘ help
// button. Type to match candidates across every job by name, role, owner,
// source, stage, seniority or status; type a number to match years of
// experience. Matches feed a single dropdown, and selecting one hands
// (candidateId, jobId) back to HiringApp, which switches to that candidate's
// job and opens their detail drawer. Purely client-side over the board state
// already in the store; the match rule lives in the pure `searchCandidates`
// helper so it stays testable.

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
import { Search } from 'lucide-react';

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
    <div className="cand-search" ref={wrapRef}>
      <div className="cand-search-field">
        <span className="cand-search-icon" aria-hidden>
          <Search size={14} aria-hidden />
        </span>
        <input
          className="cand-search-input"
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
          <div className="cand-search-menu" id="cand-search-list" role="listbox">
            {results.length === 0 ? (
              <div className="cand-search-empty">No candidates match.</div>
            ) : (
              results.map((r, i) => (
                <button
                  key={r.candidate.id}
                  id={`cand-search-opt-${r.candidate.id}`}
                  type="button"
                  role="option"
                  aria-selected={i === activeIndex}
                  className={`cand-search-item${i === activeIndex ? ' active' : ''}`}
                  // onMouseDown (not onClick) so the pick fires before the input's
                  // blur closes the menu.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(r.candidate.id, r.candidate.jobId);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  <div className="cand-search-item-top">
                    <span className="cand-search-name">
                      {r.candidate.starred && (
                        <span className="cand-search-star" aria-hidden>
                          ★{' '}
                        </span>
                      )}
                      {r.candidate.name}
                    </span>
                    <span
                      className={`status-pill st-${r.candidate.status}`}
                      title={`Status: ${STATUS[r.candidate.status]}`}
                    >
                      {STATUS[r.candidate.status]}
                    </span>
                  </div>
                  <div className="cand-search-item-meta">
                    <span className="cand-search-job">{r.jobTitle}</span>
                    <span className="cand-search-dot" aria-hidden>
                      ·
                    </span>
                    <span>{r.candidate.stage}</span>
                    {(r.seniority || r.candidate.yearsExperience != null) && (
                      <>
                        <span className="cand-search-dot" aria-hidden>
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
                    <span className="cand-search-dot" aria-hidden>
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

      {/* Help shows on hover/focus (see hiring.css) — no click needed. */}
      <div className="cand-search-help-wrap">
        <button
          type="button"
          className="cand-search-help-btn"
          aria-label="How candidate search works"
          aria-describedby="cand-search-help"
        >
          ⓘ
        </button>
        <div className="cand-search-help" id="cand-search-help" role="tooltip">
          <p className="cand-search-help-title">How to search</p>
          <p>
            Search by name, role, owner, source, stage or status, and type a
            number for minimum years of experience. Combine terms to narrow;
            all must match.
          </p>
          <p className="cand-search-help-eg">
            Example: <code>ava linkedin 5</code> (named Ava, from LinkedIn, 5+
            years)
          </p>
        </div>
      </div>
    </div>
  );
}
