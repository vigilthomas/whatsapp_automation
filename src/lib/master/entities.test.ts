import { describe, expect, it } from "vitest";
import { MASTER_ENTITIES, isMasterEntitySlug, sanitizeMasterInput } from "./entities";

const branches = MASTER_ENTITIES.branches;
const doctors = MASTER_ENTITIES.doctors;

describe("isMasterEntitySlug", () => {
  it("accepts the master entities and nothing else", () => {
    expect(isMasterEntitySlug("branches")).toBe(true);
    expect(isMasterEntitySlug("clinics")).toBe(false);
    expect(isMasterEntitySlug("clinic-admins")).toBe(false);
    expect(isMasterEntitySlug("templates")).toBe(false);
    expect(isMasterEntitySlug(null)).toBe(false);
  });
});

describe("sanitizeMasterInput — create", () => {
  it("requires `name` and trims text fields", () => {
    expect(sanitizeMasterInput(branches, {}, { partial: false })).toEqual({
      ok: false,
      error: "name is required",
    });
    const r = sanitizeMasterInput(
      branches,
      { name: "  Dental Care ", city: "  Kochi ", phone: "" },
      { partial: false },
    );
    expect(r).toEqual({
      ok: true,
      values: { name: "Dental Care", city: "Kochi", phone: null },
    });
  });

  it("rejects non-string text, non-boolean flags and bad branch ids", () => {
    expect(sanitizeMasterInput(branches, { name: 42 }, { partial: false }).ok).toBe(false);
    expect(
      sanitizeMasterInput(branches, { name: "A", is_active: "yes" }, { partial: false }).ok,
    ).toBe(false);
    expect(
      sanitizeMasterInput(doctors, { name: "Dr", branch_id: "nope" }, { partial: false }).ok,
    ).toBe(false);
  });

  it("accepts a uuid or empty branch id", () => {
    const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
    expect(
      sanitizeMasterInput(doctors, { name: "Dr", branch_id: id }, { partial: false }),
    ).toEqual({ ok: true, values: { name: "Dr", branch_id: id } });
    expect(
      sanitizeMasterInput(doctors, { name: "Dr", branch_id: "" }, { partial: false }),
    ).toEqual({ ok: true, values: { name: "Dr", branch_id: null } });
  });

  it("ignores unknown keys and enforces max length", () => {
    const r = sanitizeMasterInput(branches, { name: "A", bogus: 1 }, { partial: false });
    expect(r).toEqual({ ok: true, values: { name: "A" } });
    expect(
      sanitizeMasterInput(branches, { name: "x".repeat(201) }, { partial: false }).ok,
    ).toBe(false);
  });

  it("rejects a non-object body", () => {
    expect(sanitizeMasterInput(branches, null, { partial: false }).ok).toBe(false);
    expect(sanitizeMasterInput(branches, [], { partial: false }).ok).toBe(false);
  });
});

describe("sanitizeMasterInput — partial update", () => {
  it("touches only supplied keys and refuses to clear a required one", () => {
    expect(sanitizeMasterInput(branches, { city: "Kochi" }, { partial: true })).toEqual({
      ok: true,
      values: { city: "Kochi" },
    });
    expect(sanitizeMasterInput(branches, { name: "  " }, { partial: true })).toEqual({
      ok: false,
      error: "name is required",
    });
  });

  it("rejects an update with nothing editable", () => {
    expect(sanitizeMasterInput(branches, { bogus: 1 }, { partial: true }).ok).toBe(false);
  });
});

describe("designations — dashboard_cards (069)", () => {
  const designations = MASTER_ENTITIES.designations;
  it("keeps known card ids only", () => {
    expect(
      sanitizeMasterInput(designations, { dashboard_cards: { disabled: ["pipeline", "x"] } }, { partial: true }),
    ).toEqual({ ok: true, values: { dashboard_cards: { disabled: ["pipeline"] } } });
  });
  it("refuses a non-object", () => {
    expect(sanitizeMasterInput(designations, { dashboard_cards: ["pipeline"] }, { partial: true })).toEqual({
      ok: false,
      error: "dashboard_cards must be an object",
    });
  });
});
