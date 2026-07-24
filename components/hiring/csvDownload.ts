'use client';

// Trigger a browser download of CSV text. Prepends a UTF-8 BOM so Excel opens non-ASCII names correctly (parseCsv strips it on the way back in).
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
