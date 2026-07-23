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
      <div className="field">
        <label className="label" htmlFor={`${uid}-name`}>
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
        />
      </div>
      <div className="field-row">
        <div className="field">
          <label className="label" htmlFor={`${uid}-source`}>
            Source
          </label>
          <select
            id={`${uid}-source`}
            value={draft.source}
            disabled={disabled}
            onChange={(e) => onField('source', Number(e.target.value))}
          >
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor={`${uid}-owner`}>
            Owner
          </label>
          <select
            id={`${uid}-owner`}
            value={draft.owner}
            disabled={disabled}
            onChange={(e) => onField('owner', Number(e.target.value))}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {displayName(u)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor={`${uid}-years`}>
          Years of experience
        </label>
        <div className="years-row">
          <input
            id={`${uid}-years`}
            className="years-input"
            type="number"
            min={0}
            max={MAX_YEARS_EXPERIENCE}
            step={1}
            value={draft.years}
            disabled={disabled}
            onChange={(e) => onField('years', e.target.value)}
            placeholder={yearsPlaceholder}
          />
          {seniority && <span className="exp-tag">{seniority}</span>}
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor={`${uid}-linkedin`}>
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
        />
      </div>
      <div className="field">
        <label className="label" htmlFor={`${uid}-github`}>
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
        />
      </div>
    </>
  );
}
