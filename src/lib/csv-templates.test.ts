import { describe, expect, it } from "vitest";

import { csvTemplate } from "./csv-templates";
import { parseBroadcastCsv } from "./broadcast-csv";
import { parseContactCsv } from "./contacts/parse-contact-csv";

describe("csvTemplate", () => {
  it("contacts: header row the importer expects, plus a quoted example", () => {
    const [header, example] = csvTemplate("contacts").split("\r\n");
    expect(header).toBe("phone,name,email,company,tags");
    expect(example).toContain("+919876543210");
    expect(example).toContain("VIP; Follow-up");
  });

  it("contacts: the template parses with the contacts importer, tags included", () => {
    const r = parseContactCsv(csvTemplate("contacts"));
    expect(r.hasPhoneColumn && r.hasTagsColumn && r.hasCompanyColumn).toBe(true);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].tagNames).toEqual(["VIP", "Follow-up"]);
  });

  it("broadcast: the template parses with the broadcast importer", () => {
    const result = parseBroadcastCsv(csvTemplate("broadcast"));
    expect(result.ok).toBe(true);
  });
});
