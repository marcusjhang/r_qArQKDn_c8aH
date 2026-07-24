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
import { Button } from '@/components/ui/button';
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
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.03em] text-muted-foreground">
            CSV file
          </span>
          <input type="file" accept=".csv,text/csv" onChange={onFile} />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.03em] text-muted-foreground">
            Paste CSV
          </span>
          <textarea
            className="w-full resize-y rounded-md border border-border-strong bg-surface px-2.5 py-2 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

        {summary && (
          <div className="rounded-md bg-hired-bg px-3 py-2 text-[13px] text-hired">
            {summary}
          </div>
        )}
        {error && (
          <div
            className="rounded-md bg-rej-bg px-3 py-2 text-[13px] text-rej"
            role="alert"
          >
            {error}
          </div>
        )}

        {text.trim() && !summary && (
          <div className="flex flex-col gap-2 rounded-md border border-border px-3 py-2.5 text-[13px]">
            <div className="text-foreground">
              <strong>{rows.length}</strong> row{rows.length === 1 ? '' : 's'} ready
              {errors.length > 0 && (
                <>
                  {' · '}
                  <span className="text-sno">{errors.length} skipped</span>
                </>
              )}
              {fileName && (
                <span className="text-xs text-muted-foreground"> · {fileName}</span>
              )}
            </div>

            {(jobsToCreate.length > 0 || sourcesToCreate.length > 0) && (
              <div className="text-xs text-muted-foreground">
                {jobsToCreate.length > 0 && (
                  <div>Will create job(s): {jobsToCreate.join(', ')}</div>
                )}
                {sourcesToCreate.length > 0 && (
                  <div>Will create source(s): {sourcesToCreate.join(', ')}</div>
                )}
              </div>
            )}

            {errors.length > 0 && (
              <ul className="m-0 flex max-h-[160px] flex-col gap-[3px] overflow-y-auto pl-4 text-xs text-foreground">
                {errors.map((err, i) => (
                  <li key={i}>
                    <span className="font-semibold text-sno">
                      Line {err.line}:
                    </span>{' '}
                    {err.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="border-t border-border pt-2.5 text-xs">
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 text-xs text-primary underline"
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

        <div className="flex justify-end gap-2">
          <Button type="button" variant="app" onClick={onClose}>
            {summary ? 'Close' : 'Cancel'}
          </Button>
          <Button
            type="button"
            variant="appPrimary"
            onClick={submit}
            disabled={rows.length === 0 || busy}
          >
            {busy
              ? 'Importing…'
              : `Import ${rows.length} candidate${rows.length === 1 ? '' : 's'}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
