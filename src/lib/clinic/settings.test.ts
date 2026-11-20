import { describe, expect, it } from "vitest";
import {
  DEFAULT_CLINIC_SETTINGS,
  closureOn,
  hoursOn,
  parseClinicSettings,
  weekSpan,
  weekdayOf,
} from "./settings";

describe("parseClinicSettings", () => {
  it("defaults everything for a missing or broken document", () => {
    expect(parseClinicSettings(null)).toEqual(DEFAULT_CLINIC_SETTINGS);
    expect(parseClinicSettings("junk")).toEqual(DEFAULT_CLINIC_SETTINGS);
  });

  it("keeps good hours, defaults bad ones, and closes a day that ends before it starts", () => {
    const s = parseClinicSettings({
      hours: {
        1: { open: true, start: "08:30", end: "13:00" },
        2: { open: true, start: "25:00", end: "nope" },
        3: { open: true, start: "17:00", end: "09:00" },
      },
    });
    expect(s.hours[1]).toEqual({ open: true, start: "08:30", end: "13:00" });
    expect(s.hours[2]).toEqual({ open: true, start: "09:00", end: "18:00" });
    expect(s.hours[3].open).toBe(false);
    expect(s.hours[0].open).toBe(false);
  });

  it("drops undated holidays, trims names, and fixes a closure that ends before it starts", () => {
    const s = parseClinicSettings({
      holidays: [{ date: "2026-12-25", name: "  Christmas  ", yearly: true }, { name: "no date" }],
      closures: [{ from: "2026-12-10", to: "2026-12-01", reason: "Paint" }],
    });
    expect(s.holidays).toEqual([{ id: "h0", date: "2026-12-25", name: "Christmas", yearly: true }]);
    expect(s.closures).toEqual([{ id: "c0", from: "2026-12-10", to: "2026-12-10", reason: "Paint" }]);
  });
});

describe("closureOn / hoursOn", () => {
  const s = parseClinicSettings({
    holidays: [
      { date: "2025-12-25", name: "Christmas", yearly: true },
      { date: "2026-08-15", name: "Independence Day", yearly: false },
    ],
    closures: [{ from: "2026-11-23", to: "2026-11-25", reason: "Renovation" }],
  });

  it("knows the weekday of a date", () => {
    expect(weekdayOf("2026-11-22")).toBe(0); // a Sunday
  });

  it("repeats yearly holidays and keeps one-off ones to their year", () => {
    expect(closureOn(s, "2027-12-25")).toEqual({ kind: "holiday", name: "Christmas" });
    expect(closureOn(s, "2026-08-15")).toEqual({ kind: "holiday", name: "Independence Day" });
    expect(closureOn(s, "2027-08-16")).toBeNull();
  });

  it("covers every day of a closed period, inclusive", () => {
    expect(closureOn(s, "2026-11-23")).toEqual({ kind: "closed", reason: "Renovation" });
    expect(closureOn(s, "2026-11-25")).toEqual({ kind: "closed", reason: "Renovation" });
    expect(closureOn(s, "2026-11-26")).toBeNull();
  });

  it("closes the weekly day off and gives the window otherwise", () => {
    expect(closureOn(s, "2026-11-22")).toEqual({ kind: "weekly" });
    expect(hoursOn(s, "2026-11-22")).toBeNull();
    expect(hoursOn(s, "2026-11-20")).toEqual({ open: 540, close: 1080 });
  });
});

describe("weekSpan", () => {
  it("spans the earliest opening to the latest closing", () => {
    const s = parseClinicSettings({
      hours: { 1: { open: true, start: "07:30", end: "12:00" }, 6: { open: true, start: "10:00", end: "20:15" } },
    });
    expect(weekSpan(s)).toEqual({ startHour: 7, endHour: 21 });
  });
});

describe("withClinic (booking assistant)", async () => {
  const { withClinic } = await import("@/lib/booking/clinic");
  const { DEFAULT_CONFIG } = await import("@/lib/booking/settings");
  const { candidateDays } = await import("@/lib/booking/slots");

  it("overlaps the hours, closes days either side closes, and drops holidays", () => {
    const clinic = parseClinicSettings({
      hours: { 1: { open: true, start: "10:00", end: "20:00" }, 2: { open: false, start: "09:00", end: "18:00" } },
      holidays: [{ date: "2026-11-25", name: "Founders' day", yearly: false }],
    });
    const out = withClinic(DEFAULT_CONFIG, clinic, ["2026-11-24", "2026-11-25"]);
    expect(out.hours[1]).toEqual({ open: true, start: "10:00", end: "18:00" });
    expect(out.hours[2].open).toBe(false);
    expect(out.closedDays).toEqual(["2026-11-25"]);
    const days = candidateDays({ ...out, timezone: "UTC", daysAhead: 7 }, new Date("2026-11-23T08:00:00Z"));
    expect(days).not.toContain("2026-11-25");
    expect(days).not.toContain("2026-11-24"); // Tuesday, closed in Clinic
  });
});
