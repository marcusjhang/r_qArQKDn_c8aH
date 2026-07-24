'use client';

// The candidate field set — Name, Source + Owner, Years of experience (with its
// seniority tag), and the optional LinkedIn / GitHub links. Rendered identically
// by the add-candidate modal and the edit/detail form so the fields, their
// placeholders, and their bounds are defined exactly once. Purely presentational:
// it reads a `CandidateDraft` and reports edits via `onField`. The `disabled`
// flag drives the detail form's read-only state; the add modal leaves it false.

import { useId } from 'react';
import {
  MAX_PROFILE_URL,
  MAX_YEARS_EXPERIENCE,
  LINKEDIN_URL_PLACEHOLDER,
  GITHUB_URL_PLACEHOLDER,
  displayName,
  seniorityFor,
  parseYearsInput,
  type CandidateDraft,
  type SeniorityBand,
  type Source,
  type User
} from '@/lib/hiring';

export default function CandidateFields({
  draft,
  onField,
  users,
  sources,
  bands,
  disabled = false,
  autoFocusName = false,
  yearsPlaceholder
}: {
  draft: CandidateDraft;
  onField: <K extends keyof CandidateDraft>(
    key: K,
    value: CandidateDraft[K]
  ) => void;
  users: User[];
  sources: Source[];
  bands: SeniorityBand[];
  /** Read-only mode (the detail form before Edit is pressed). */
  disabled?: boolean;
  /** Focus the Name input on mount (the add-candidate modal). */
  autoFocusName?: boolean;
  /** Years hint; differs between the add modal and the detail form. */
  yearsPlaceholder: string;
}) {
  const seniority = seniorityFor(bands, parseYearsInput(draft.years).value);
  // Unique per instance so the ids don't collide when the add modal and the
  // detail form render this field set at the same time.
  const uid = useId();

  return (
    <>
      <div className={FIELD}>
        <label className={LABEL} htmlFor={`${uid}-name`}>
          Name
        </label>
        <input
          id={`${uid}-name`}
          type="text"
          autoFocus={autoFocusName}
          maxLength={120}
          value={draft.name}
          disabled={disabled}
          onChange={(e) => onField('name', e.target.value)}
          placeholder="Full name"
          className={CONTROL}
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <div className={`${FIELD} min-w-0 flex-[1_1_140px]`}>
          <label className={LABEL} htmlFor={`${uid}-source`}>
            Source
          </label>
          <select
            id={`${uid}-source`}
            value={draft.source}
            disabled={disabled}
            onChange={(e) => onField('source', Number(e.target.value))}
            className={CONTROL}
          >
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className={`${FIELD} min-w-0 flex-[1_1_140px]`}>
          <label className={LABEL} htmlFor={`${uid}-owner`}>
            Owner
          </label>
          <select
            id={`${uid}-owner`}
            value={draft.owner}
            disabled={disabled}
            onChange={(e) => onField('owner', Number(e.target.value))}
            className={CONTROL}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {displayName(u)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className={FIELD}>
        <label className={LABEL} htmlFor={`${uid}-years`}>
          Years of experience
        </label>
        <div className="flex items-center gap-2">
          <input
            id={`${uid}-years`}
            className={`${CONTROL} w-24 flex-none`}
            type="number"
            min={0}
            max={MAX_YEARS_EXPERIENCE}
            step={1}
            value={draft.years}
            disabled={disabled}
            onChange={(e) => onField('years', e.target.value)}
            placeholder={yearsPlaceholder}
          />
          {seniority && (
            <span className="rounded-sm border border-primary-border bg-primary-weak px-[7px] py-0.5 text-[10px] font-semibold text-primary">
              {seniority}
            </span>
          )}
        </div>
      </div>
      <div className={FIELD}>
        <label className={LABEL} htmlFor={`${uid}-linkedin`}>
          LinkedIn URL (optional)
        </label>
        <input
          id={`${uid}-linkedin`}
          type="url"
          maxLength={MAX_PROFILE_URL}
          value={draft.linkedin}
          disabled={disabled}
          onChange={(e) => onField('linkedin', e.target.value)}
          placeholder={LINKEDIN_URL_PLACEHOLDER}
          className={CONTROL}
        />
      </div>
      <div className={FIELD}>
        <label className={LABEL} htmlFor={`${uid}-github`}>
          GitHub URL (optional)
        </label>
        <input
          id={`${uid}-github`}
          type="url"
          maxLength={MAX_PROFILE_URL}
          value={draft.github}
          disabled={disabled}
          onChange={(e) => onField('github', e.target.value)}
          placeholder={GITHUB_URL_PLACEHOLDER}
          className={CONTROL}
        />
      </div>
    </>
  );
}

// Shared field styling (former `.field` / `.label` / input rules).
const FIELD = 'flex flex-col gap-1.5';
const LABEL =
  'text-[11px] font-bold uppercase tracking-[0.03em] text-muted-foreground';
const CONTROL =
  'w-full rounded-md border border-border-strong bg-surface px-2.5 py-2 text-[13px] text-foreground focus:border-primary focus:outline-none focus:shadow-[0_0_0_3px_var(--primary-weak)] disabled:cursor-default disabled:bg-surface-2 disabled:text-foreground';
