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
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
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
    <div className="relative inline-flex" ref={ref}>
      <Button
        type="button"
        variant="app"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Download size={14} aria-hidden /> CSV
      </Button>
      {open && (
        <div
          className="absolute right-0 top-full z-[25] mt-1.5 flex min-w-[240px] flex-col rounded-md border border-border bg-surface p-1 shadow-ds"
          role="menu"
        >
          <button
            className="flex cursor-pointer flex-col gap-0.5 rounded-sm border-0 bg-transparent px-2.5 py-2 text-left text-foreground enabled:hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-[0.55]"
            role="menuitem"
            onClick={exportCandidates}
            disabled={candidateCount === 0}
          >
            <span className="text-[13px] font-medium">Export candidates</span>
            <span className="text-[11px] text-muted-foreground">
              {candidateCount === 0
                ? 'No candidates yet'
                : `${candidateCount} candidate${candidateCount === 1 ? '' : 's'} across ${state.jobs.length} job${state.jobs.length === 1 ? '' : 's'}`}
            </span>
          </button>
          <button
            className="flex cursor-pointer flex-col gap-0.5 rounded-sm border-0 bg-transparent px-2.5 py-2 text-left text-foreground enabled:hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-[0.55]"
            role="menuitem"
            onClick={openImport}
          >
            <span className="text-[13px] font-medium">Import candidates</span>
            <span className="text-[11px] text-muted-foreground">
              Upload a CSV to add candidates
            </span>
          </button>
          <button
            className="flex cursor-pointer flex-col gap-0.5 rounded-sm border-0 bg-transparent px-2.5 py-2 text-left text-foreground enabled:hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-[0.55]"
            role="menuitem"
            onClick={downloadTemplate}
          >
            <span className="text-[13px] font-medium">Download template</span>
            <span className="text-[11px] text-muted-foreground">
              Example rows to fill in and import
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
