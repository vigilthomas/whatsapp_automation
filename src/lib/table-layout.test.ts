import { describe, expect, it } from "vitest";

import {
  clampWidth,
  defaultLayout,
  moveColumn,
  normalizeLayout,
  resizeColumn,
  toggleColumn,
  visibleIds,
  MIN_COLUMN_WIDTH,
} from "./table-layout";

const cols = [
  { id: "name", hideable: false },
  { id: "phone" },
  { id: "email" },
  { id: "notes", defaultHidden: true },
];

describe("defaultLayout", () => {
  it("keeps code order and default-hidden columns", () => {
    expect(defaultLayout(cols)).toEqual({ order: ["name", "phone", "email", "notes"], hidden: ["notes"], widths: {} });
  });
});

describe("normalizeLayout", () => {
  it("falls back to defaults for junk", () => {
    expect(normalizeLayout(cols, "nope")).toEqual(defaultLayout(cols));
    expect(normalizeLayout(cols, null)).toEqual(defaultLayout(cols));
  });

  it("drops unknown ids and appends new columns with their default visibility", () => {
    const saved = { order: ["email", "gone", "name"], hidden: ["email", "gone"], widths: { gone: 200, name: 10 } };
    const out = normalizeLayout(cols, saved);
    expect(out.order).toEqual(["email", "name", "phone", "notes"]);
    expect(out.hidden).toEqual(["email", "notes"]);
    expect(out.widths).toEqual({ name: MIN_COLUMN_WIDTH });
  });

  it("never hides a column that can't be hidden", () => {
    const out = normalizeLayout(cols, { order: ["name", "phone", "email", "notes"], hidden: ["name", "phone"] });
    expect(out.hidden).toEqual(["phone"]);
  });

  it("never hides every column", () => {
    const two = [{ id: "a" }, { id: "b" }];
    expect(normalizeLayout(two, { order: ["a", "b"], hidden: ["a", "b"] }).hidden).toEqual([]);
  });
});

describe("edits", () => {
  const base = defaultLayout(cols);

  it("moves a column to the drop target", () => {
    expect(moveColumn(base, "email", "name").order).toEqual(["email", "name", "phone", "notes"]);
    expect(moveColumn(base, "name", "email").order).toEqual(["phone", "email", "name", "notes"]);
    expect(moveColumn(base, "name", "missing")).toBe(base);
  });

  it("hides and shows, but keeps at least one visible", () => {
    const hidden = toggleColumn(base, "phone", false);
    expect(visibleIds(hidden)).toEqual(["name", "email"]);
    expect(visibleIds(toggleColumn(hidden, "notes", true))).toEqual(["name", "email", "notes"]);
    let one = toggleColumn(toggleColumn(base, "phone", false), "email", false);
    one = toggleColumn(one, "name", false);
    expect(visibleIds(one)).toEqual(["name"]);
  });

  it("clamps widths", () => {
    expect(resizeColumn(base, "phone", 5).widths.phone).toBe(MIN_COLUMN_WIDTH);
    expect(resizeColumn(base, "phone", 180.4).widths.phone).toBe(180);
    expect(clampWidth(5000)).toBe(900);
    expect(clampWidth(70, 120)).toBe(120);
  });
});
