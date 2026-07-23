'use client';

// Trigger a browser download of CSV text. A UTF-8 BOM is prepended so Excel
// opens non-ASCII names correctly (and our parser strips it on the way back in
// — see parseCsv). Browser-only; guarded so it's a no-op on the server. Shared
// by the CSV menu (export / template) and the import dialog (template).
export function downloadCsv(filename: string, csv: string) {
  if (typeof document === 'undefined') return;
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
