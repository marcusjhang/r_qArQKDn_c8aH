'use client';

// Toolbar "CSV ▾" menu with three actions:
//   • Export candidates — the live board as a spreadsheet (reactive to whatever
//     jobs/candidates exist right now).
//   • Import candidates — opens the import dialog (owned by HiringApp).
//   • Download template — an example import file with the column layout and
//     example rows drawn from the user's own config.
//
// Presentational only: CSV *content* is built by the pure helpers in
// lib/hiring/csv.ts; this component resolves state → string and hands the
// browser a download (or delegates opening the import dialog to the parent).
// Closes on outside-click / Escape like the other menus.

import { useEffect, useRef, useState } from 'react';
import {
  buildExportCsv,
  buildTemplateCsv,
  csvFilename,
  type HiringState
} from '@/lib/hiring';
import { downloadCsv } from './csvDownload';

export default function CsvMenu({
  state,
  onImport
}: {
  state: HiringState;
  onImport: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function exportCandidates() {
    downloadCsv(csvFilename('hiring-export', new Date()), buildExportCsv(state));
    setOpen(false);
  }

  function downloadTemplate() {
    downloadCsv(
      csvFilename('hiring-template', new Date()),
      buildTemplateCsv(state)
    );
    setOpen(false);
  }

  function openImport() {
    setOpen(false);
    onImport();
  }

  const candidateCount = state.candidates.length;

  return (
    <div className="export-menu" ref={ref}>
      <button
        className="btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        ⤓ CSV
      </button>
      {open && (
        <div className="export-pop" role="menu">
          <button
            className="export-item"
            role="menuitem"
            onClick={exportCandidates}
            disabled={candidateCount === 0}
          >
            <span className="export-item-title">Export candidates</span>
            <span className="export-item-sub">
              {candidateCount === 0
                ? 'No candidates yet'
                : `${candidateCount} candidate${candidateCount === 1 ? '' : 's'} across ${state.jobs.length} job${state.jobs.length === 1 ? '' : 's'}`}
            </span>
          </button>
          <button className="export-item" role="menuitem" onClick={openImport}>
            <span className="export-item-title">Import candidates</span>
            <span className="export-item-sub">Upload a CSV to add candidates</span>
          </button>
          <button
            className="export-item"
            role="menuitem"
            onClick={downloadTemplate}
          >
            <span className="export-item-title">Download template</span>
            <span className="export-item-sub">Example rows to fill in and import</span>
          </button>
        </div>
      )}
    </div>
  );
}
