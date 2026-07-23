'use client';

// Import candidates from a CSV. The user picks (or pastes) a file; we resolve it
// against the live board with the pure resolver (resolveImportRows) and show a
// preview — how many rows are ready, which jobs/sources will be created, and any
// per-row errors — before anything is written. Committing calls the store's
// importCandidates action (→ the server action), then the board resyncs.
//
// The "allowed values" reference (statuses, sources, owners, seniority bands,
// per-job stages) lives here rather than inside the CSV, so the template file
// stays a clean, re-importable spreadsheet.

import { useMemo, useState } from 'react';
import {
  buildTemplateCsv,
  csvFilename,
  resolveImportRows,
  newJobTitles,
  newSourceNames,
  type HiringState,
  type ImportRow
} from '@/lib/hiring';
import Modal from './Modal';
import { downloadCsv } from './csvDownload';

export default function ImportDialog({
  state,
  currentUserId,
  onImport,
  onClose
}: {
  state: HiringState;
  currentUserId: number | null;
  onImport: (
    rows: ImportRow[],
    onDone: (result: { inserted: number }) => void,
    onError?: () => void
  ) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { rows, errors } = useMemo(
    () =>
      text.trim()
        ? resolveImportRows(text, state, { currentUserId })
        : { rows: [] as ImportRow[], errors: [] },
    [text, state, currentUserId]
  );

  const jobsToCreate = useMemo(() => newJobTitles(rows), [rows]);
  const sourcesToCreate = useMemo(() => newSourceNames(rows), [rows]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setSummary(null);
    setError(null);
    setText(await file.text());
  }

  function submit() {
    if (rows.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    onImport(
      rows,
      ({ inserted }) => {
        setBusy(false);
        setSummary(
          `Imported ${inserted} candidate${inserted === 1 ? '' : 's'}.`
        );
        setText('');
        setFileName(null);
      },
      () => {
        // The write failed (network, server rejection, …); leave the busy
        // state so the user can fix and retry rather than seeing it hang.
        setBusy(false);
        setError('Import failed — nothing was saved. Please try again.');
      }
    );
  }

  return (
    <Modal title="Import candidates" onClose={onClose}>
      <div className="import-body">
        <div className="field">
          <span className="label">CSV file</span>
          <input type="file" accept=".csv,text/csv" onChange={onFile} />
        </div>

        <div className="field">
          <span className="label">Paste CSV</span>
          <textarea
            className="import-textarea"
            rows={5}
            value={text}
            placeholder="Job,Candidate,Stage,Status,Owner,Source,Years experience,LinkedIn URL,GitHub URL"
            onChange={(e) => {
              setText(e.target.value);
              setFileName(null);
              setSummary(null);
              setError(null);
            }}
          />
        </div>

        {summary && <div className="import-summary">{summary}</div>}
        {error && (
          <div className="import-error" role="alert">
            {error}
          </div>
        )}

        {text.trim() && !summary && (
          <div className="import-preview">
            <div className="import-preview-head">
              <strong>{rows.length}</strong> row{rows.length === 1 ? '' : 's'} ready
              {errors.length > 0 && (
                <>
                  {' · '}
                  <span className="import-preview-errcount">
                    {errors.length} skipped
                  </span>
                </>
              )}
              {fileName && <span className="import-filename"> · {fileName}</span>}
            </div>

            {(jobsToCreate.length > 0 || sourcesToCreate.length > 0) && (
              <div className="import-creates">
                {jobsToCreate.length > 0 && (
                  <div>Will create job(s): {jobsToCreate.join(', ')}</div>
                )}
                {sourcesToCreate.length > 0 && (
                  <div>Will create source(s): {sourcesToCreate.join(', ')}</div>
                )}
              </div>
            )}

            {errors.length > 0 && (
              <ul className="import-errors">
                {errors.map((err, i) => (
                  <li key={i}>
                    <span className="import-err-line">Line {err.line}:</span>{' '}
                    {err.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="import-ref-row">
          <button
            type="button"
            className="linklike"
            onClick={() =>
              downloadCsv(
                csvFilename('hiring-template', new Date()),
                buildTemplateCsv(state)
              )
            }
          >
            Download template
          </button>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            {summary ? 'Close' : 'Cancel'}
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={submit}
            disabled={rows.length === 0 || busy}
          >
            {busy
              ? 'Importing…'
              : `Import ${rows.length} candidate${rows.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
