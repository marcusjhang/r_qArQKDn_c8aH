'use client';

// Add-candidate form (Decision 6): name + source + owner in one step, with
// valid-by-construction selects instead of free-text prompts. LinkedIn and
// GitHub URLs are optional; blank inputs are stored as NULL. Years of
// experience is optional too and drives the seniority band shown on the card.
//
// The fields + validation are shared with the edit/detail form via
// <CandidateFields> and useCandidateDraft, so the two forms can't drift.

import {
  emptyCandidateDraft,
  type User,
  type Source,
  type SeniorityBand
} from '@/lib/hiring';
import Modal from './Modal';
import CandidateFields from './CandidateFields';
import { useCandidateDraft } from './hooks/useCandidateDraft';

export default function AddCandidateModal({
  jobTitle,
  users,
  sources,
  bands,
  onClose,
  onAdd
}: {
  jobTitle: string;
  users: User[];
  sources: Source[];
  bands: SeniorityBand[];
  onClose: () => void;
  onAdd: (
    name: string,
    source: number,
    owner: number,
    linkedinUrl: string | null,
    githubUrl: string | null,
    yearsExperience: number | null
  ) => void;
}) {
  const { draft, setField, error, validate } = useCandidateDraft(
    emptyCandidateDraft(sources, users)
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const values = validate();
    if (!values) return;
    onAdd(
      values.name,
      values.source,
      values.owner,
      values.linkedinUrl,
      values.githubUrl,
      values.yearsExperience
    );
    onClose();
  }

  return (
    <Modal title={`Add candidate to ${jobTitle}`} onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <CandidateFields
          draft={draft}
          onField={setField}
          users={users}
          sources={sources}
          bands={bands}
          autoFocusName
          yearsPlaceholder="Optional — e.g. 5"
        />
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            Add candidate
          </button>
        </div>
      </form>
    </Modal>
  );
}
