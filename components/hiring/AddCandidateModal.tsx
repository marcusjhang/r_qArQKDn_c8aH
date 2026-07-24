'use client';

// Add-candidate form; shares fields + validation with the detail form via <CandidateFields>/useCandidateDraft so the two can't drift.

import {
  emptyCandidateDraft,
  type User,
  type Source,
  type SeniorityBand
} from '@/lib/hiring';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
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
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <CandidateFields
          draft={draft}
          onField={setField}
          users={users}
          sources={sources}
          bands={bands}
          autoFocusName
          yearsPlaceholder="Optional"
        />
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="app" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="appPrimary">
            Add candidate
          </Button>
        </div>
      </form>
    </Modal>
  );
}
