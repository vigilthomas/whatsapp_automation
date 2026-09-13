import { describe, expect, it } from "vitest";
import { MASTER_ENTITIES, isMasterEntitySlug, sanitizeMasterInput } from "./entities";

const clinics = MASTER_ENTITIES.clinics;
const doctors = MASTER_ENTITIES.doctors;

describe("isMasterEntitySlug", () => {
  it("accepts the three entities and nothing else", () => {
    expect(isMasterEntitySlug("clinics")).toBe(true);
    expect(isMasterEntitySlug("clinic-admins")).toBe(true);
    expect(isMasterEntitySlug("templates")).toBe(false);
    expect(isMasterEntitySlug(null)).toBe(false);
  });
});

describe("sanitizeMasterInput — create", () => {
  it("requires `name` and trims text fields", () => {
    expect(sanitizeMasterInput(clinics, {}, { partial: false })).toEqual({
      ok: false,
      error: "name is required",
    });
    const r = sanitizeMasterInput(
      clinics,
      { name: "  Dental Care ", city: "  Kochi ", phone: "" },
      { partial: false },
    );
    expect(r).toEqual({
      ok: true,
      values: { name: "Dental Care", city: "Kochi", phone: null },
    });
  });

  it("rejects non-string text, non-boolean flags and bad clinic ids", () => {
    expect(sanitizeMasterInput(clinics, { name: 42 }, { partial: false }).ok).toBe(false);
    expect(
      sanitizeMasterInput(clinics, { name: "A", is_active: "yes" }, { partial: false }).ok,
    ).toBe(false);
    expect(
      sanitizeMasterInput(doctors, { name: "Dr", clinic_id: "nope" }, { partial: false }).ok,
    ).toBe(false);
  });

  it("accepts a uuid or empty clinic id", () => {
    const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
    expect(
      sanitizeMasterInput(doctors, { name: "Dr", clinic_id: id }, { partial: false }),
    ).toEqual({ ok: true, values: { name: "Dr", clinic_id: id } });
    expect(
      sanitizeMasterInput(doctors, { name: "Dr", clinic_id: "" }, { partial: false }),
    ).toEqual({ ok: true, values: { name: "Dr", clinic_id: null } });
  });

  it("ignores unknown keys and enforces max length", () => {
    const r = sanitizeMasterInput(clinics, { name: "A", bogus: 1 }, { partial: false });
    expect(r).toEqual({ ok: true, values: { name: "A" } });
    expect(
      sanitizeMasterInput(clinics, { name: "x".repeat(201) }, { partial: false }).ok,
    ).toBe(false);
  });

  it("rejects a non-object body", () => {
    expect(sanitizeMasterInput(clinics, null, { partial: false }).ok).toBe(false);
    expect(sanitizeMasterInput(clinics, [], { partial: false }).ok).toBe(false);
  });
});

describe("sanitizeMasterInput — partial update", () => {
  it("touches only supplied keys and refuses to clear a required one", () => {
    expect(sanitizeMasterInput(clinics, { city: "Kochi" }, { partial: true })).toEqual({
      ok: true,
      values: { city: "Kochi" },
    });
    expect(sanitizeMasterInput(clinics, { name: "  " }, { partial: true })).toEqual({
      ok: false,
      error: "name is required",
    });
  });

  it("rejects an update with nothing editable", () => {
    expect(sanitizeMasterInput(clinics, { bogus: 1 }, { partial: true }).ok).toBe(false);
  });
});
