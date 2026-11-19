/**
 * Blank CSV templates offered next to every import ("Download template").
 *
 * Each template is the header row the importer reads plus one example
 * row, so people can see the expected formats (international phone
 * number, tags separated by ";" inside one cell). Keep the headers in
 * sync with the parsers:
 *   contacts   → src/lib/contacts/parse-contact-csv.ts
 *   broadcast  → src/lib/broadcast-csv.ts
 */
import { downloadCsv, recordsToCsv } from "@/lib/master/csv";

export const CSV_TEMPLATES = {
  contacts: {
    filename: "contacts-import-template.csv",
    headers: ["phone", "name", "email", "company", "tags"],
    example: ["+919876543210", "Asha Menon", "asha@example.com", "Acme Clinic", "VIP; Follow-up"],
  },
  broadcast: {
    filename: "broadcast-audience-template.csv",
    headers: ["phone", "name"],
    example: ["+919876543210", "Asha Menon"],
  },
} as const;

export type CsvTemplateKind = keyof typeof CSV_TEMPLATES;

/** The template as CSV text (header + example row). */
export function csvTemplate(kind: CsvTemplateKind): string {
  const tpl = CSV_TEMPLATES[kind];
  const columns = tpl.headers.map((h, i) => ({ key: h, label: h, value: () => tpl.example[i] ?? "" }));
  return recordsToCsv([null], columns);
}

export function downloadCsvTemplate(kind: CsvTemplateKind): void {
  downloadCsv(CSV_TEMPLATES[kind].filename, csvTemplate(kind));
}
