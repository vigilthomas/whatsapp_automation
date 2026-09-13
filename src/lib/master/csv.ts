// Tiny CSV helpers for the export buttons. Dependency-free; the shapes
// are small (hundreds of rows) so nothing streams.

export interface CsvColumn<T> {
  key: string;
  label: string;
  value: (row: T) => string;
}

function escapeCell(v: string): string {
  // Quote when the cell holds a delimiter, quote, or newline; double
  // any embedded quotes per RFC 4180.
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function recordsToCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCell(c.label)).join(",");
  const lines = rows.map((r) => columns.map((c) => escapeCell(c.value(r))).join(","));
  return [header, ...lines].join("\r\n");
}

/** Trigger a browser download of `csv` as `filename`. */
export function downloadCsv(filename: string, csv: string): void {
  // BOM so Excel opens UTF-8 (accents, ₹) correctly.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
