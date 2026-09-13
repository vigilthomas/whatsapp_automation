import { describe, expect, it } from "vitest";
import {
  bucketByDayHour,
  chipTone,
  hourRange,
  startOfWeek,
  validateAppointmentInput,
  weekDays,
  type Appointment,
} from "./model";

const ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

function appt(over: Partial<Appointment>): Appointment {
  return {
    id: "a",
    clinic_id: null,
    doctor_id: null,
    contact_id: ID,
    service: "Consultation",
    starts_at: "2026-01-13T10:00:00.000Z",
    ends_at: "2026-01-13T10:30:00.000Z",
    status: "scheduled",
    source: "manual",
    notes: null,
    created_at: "",
    updated_at: "",
    contact: null,
    doctor: null,
    clinic: null,
    ...over,
  };
}

describe("validateAppointmentInput", () => {
  const base = {
    contact_id: ID,
    service: " Consultation ",
    starts_at: "2026-01-13T10:00:00Z",
    ends_at: "2026-01-13T10:30:00Z",
  };

  it("accepts a full create and normalises", () => {
    const r = validateAppointmentInput(base, { partial: false });
    expect(r).toEqual({
      ok: true,
      values: {
        contact_id: ID,
        service: "Consultation",
        starts_at: "2026-01-13T10:00:00.000Z",
        ends_at: "2026-01-13T10:30:00.000Z",
      },
    });
  });

  it("requires the core fields on create", () => {
    expect(validateAppointmentInput({}, { partial: false })).toEqual({
      ok: false,
      error: "contact_id is required",
    });
    expect(validateAppointmentInput({ contact_id: ID }, { partial: false })).toEqual({
      ok: false,
      error: "service is required",
    });
  });

  it("rejects end before start, bad dates, bad enums, bad ids", () => {
    expect(
      validateAppointmentInput({ ...base, ends_at: base.starts_at }, { partial: false }).ok,
    ).toBe(false);
    expect(validateAppointmentInput({ ...base, starts_at: "x" }, { partial: false }).ok).toBe(false);
    expect(validateAppointmentInput({ ...base, status: "done" }, { partial: false }).ok).toBe(false);
    expect(validateAppointmentInput({ ...base, doctor_id: "1" }, { partial: false }).ok).toBe(false);
  });

  it("allows clearing doctor / clinic with null or empty string", () => {
    const r = validateAppointmentInput({ doctor_id: "", clinic_id: null }, { partial: true });
    expect(r).toEqual({ ok: true, values: { doctor_id: null, clinic_id: null } });
  });

  it("partial update touches only supplied keys and refuses empty", () => {
    expect(validateAppointmentInput({ status: "confirmed" }, { partial: true })).toEqual({
      ok: true,
      values: { status: "confirmed" },
    });
    expect(validateAppointmentInput({ bogus: 1 }, { partial: true }).ok).toBe(false);
  });
});

describe("week maths", () => {
  it("startOfWeek returns the local Monday", () => {
    // 2026-01-15 is a Thursday.
    const s = startOfWeek(new Date(2026, 0, 15, 13, 45));
    expect(s.getDay()).toBe(1);
    expect(s.getDate()).toBe(12);
    expect(s.getHours()).toBe(0);
    // A Sunday belongs to the week that started the previous Monday.
    expect(startOfWeek(new Date(2026, 0, 18)).getDate()).toBe(12);
  });

  it("weekDays yields consecutive days", () => {
    const days = weekDays(new Date(2026, 0, 12), 5);
    expect(days.map((d) => d.getDate())).toEqual([12, 13, 14, 15, 16]);
  });

  it("bucketByDayHour keys by column and local hour, sorted", () => {
    const days = weekDays(new Date(2026, 0, 12), 5);
    const a1 = appt({ id: "1", starts_at: new Date(2026, 0, 13, 10, 30).toISOString() });
    const a2 = appt({ id: "2", starts_at: new Date(2026, 0, 13, 10, 0).toISOString() });
    const off = appt({ id: "3", starts_at: new Date(2026, 0, 20, 10, 0).toISOString() });
    const m = bucketByDayHour([a1, a2, off], days);
    expect([...m.keys()]).toEqual(["1:10"]);
    expect(m.get("1:10")!.map((a) => a.id)).toEqual(["2", "1"]);
  });

  it("hourRange widens the working window to fit outliers", () => {
    expect(hourRange([], 9, 12)).toEqual([9, 10, 11]);
    const early = appt({ starts_at: new Date(2026, 0, 13, 7, 0).toISOString() });
    const late = appt({ starts_at: new Date(2026, 0, 13, 13, 0).toISOString() });
    expect(hourRange([early, late], 9, 12)).toEqual([7, 8, 9, 10, 11, 12, 13]);
  });
});

describe("chipTone", () => {
  it("maps status/source to the mockup palette", () => {
    expect(chipTone({ status: "scheduled", source: "manual" })).toBe("blue");
    expect(chipTone({ status: "scheduled", source: "ai" })).toBe("green");
    expect(chipTone({ status: "confirmed", source: "ai" })).toBe("blue");
    expect(chipTone({ status: "completed", source: "manual" })).toBe("green");
    expect(chipTone({ status: "no_show", source: "manual" })).toBe("amber");
    expect(chipTone({ status: "cancelled", source: "manual" })).toBe("grey");
  });
});
