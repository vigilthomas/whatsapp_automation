import { describe, expect, it, vi } from "vitest";

import type { BookingDeps } from "@/lib/booking/engine";
import { DEFAULT_CONFIG, type BookingConfig } from "@/lib/booking/settings";
import { bookTime, findTimes, matchByName, runTool, type ToolCall } from "./booking";

// Monday 24 Nov 2025, 08:00 in India (02:30 UTC). Hours 09:00–18:00, Sunday closed.
const NOW = new Date("2025-11-24T02:30:00Z");
const config: BookingConfig = { ...DEFAULT_CONFIG, minNoticeMinutes: 0, daysAhead: 7 };

function deps(over: Partial<BookingDeps> = {}): BookingDeps {
  return {
    config,
    services: [
      { id: "s1", name: "Haircut - Women", duration_min: 45 },
      { id: "s2", name: "Hair Spa", duration_min: 60 },
    ],
    doctors: [
      { id: "d1", name: "Anjali Menon", branch_id: "b1" },
      { id: "d2", name: "Rahul Nair", branch_id: "b1" },
    ],
    // Only Anjali does women's haircuts; Hair Spa has no links → anyone.
    doctorServices: [{ doctor_id: "d1", service_id: "s1" }],
    contactName: null,
    now: NOW,
    busy: async () => [],
    book: vi.fn(async () => "ok" as const),
    ...over,
  };
}

const call = (over: Partial<ToolCall>): ToolCall => ({
  tool: "find_times",
  service: "",
  stylist: "",
  date: "",
  start: "",
  name: "",
  ...over,
});

describe("matchByName", () => {
  const items = [{ name: "Anjali Menon" }, { name: "Rahul Nair" }];
  it("matches exact names, then a unique partial one, ignoring case", () => {
    expect(matchByName(items, "rahul nair")?.name).toBe("Rahul Nair");
    expect(matchByName(items, "anjali")?.name).toBe("Anjali Menon");
    expect(matchByName(items, "a")).toBeUndefined(); // ambiguous
    expect(matchByName(items, "")).toBeUndefined();
  });
});

describe("findTimes", () => {
  it("lists free times by day with the stylist for each", async () => {
    const r = await findTimes(deps(), call({ service: "haircut - women", stylist: "any", date: "2025-11-24" }));
    expect(r.ok).toBe(true);
    const days = (r as unknown as { days: { date: string; times: { time: string; stylist: string }[] }[] }).days;
    expect(days).toHaveLength(1);
    expect(days[0].times[0]).toEqual({ time: "09:00", stylist: "Anjali Menon" });
    // Rahul isn't linked to this service, so he's never offered for it.
    expect(days[0].times.every((t) => t.stylist === "Anjali Menon")).toBe(true);
  });

  it("returns the next open days when no date is given, skipping Sunday", async () => {
    const r = (await findTimes(deps(), call({ service: "Hair Spa" }))) as unknown as { days: { date: string }[] };
    expect(r.days.map((d) => d.date)).toEqual(["2025-11-24", "2025-11-25", "2025-11-26"]);
  });

  it("explains unknown services, stylists who don't offer it, and closed days", async () => {
    expect(await findTimes(deps(), call({ service: "Massage" }))).toMatchObject({ ok: false, services: ["Haircut - Women", "Hair Spa"] });
    expect(await findTimes(deps(), call({ service: "Haircut - Women", stylist: "Rahul" }))).toMatchObject({ ok: false, stylists: ["Anjali Menon"] });
    expect(await findTimes(deps(), call({ service: "Hair Spa", date: "2025-11-30" }))).toMatchObject({ ok: false });
  });

  it("leaves out booked times", async () => {
    const busy = async () => [{ doctor_id: "d1", starts_at: "2025-11-24T03:30:00Z", ends_at: "2025-11-24T04:15:00Z" }];
    const r = (await findTimes(deps({ busy }), call({ service: "Haircut - Women", stylist: "Anjali", date: "2025-11-24" }))) as unknown as {
      days: { times: { time: string }[] }[];
    };
    expect(r.days[0].times[0].time).toBe("09:45");
  });
});

describe("bookTime", () => {
  it("books a free time with the right stylist, branch and times", async () => {
    const d = deps();
    const r = await bookTime(d, call({ tool: "book", service: "Hair Spa", stylist: "Rahul Nair", start: "2025-11-25 10:00", name: "Meera" }));
    expect(r).toMatchObject({ ok: true, booked: { service: "Hair Spa", stylist: "Rahul Nair", time: "10:00 am" } });
    expect(d.book).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceName: "Hair Spa",
        doctorId: "d2",
        branchId: "b1",
        startsAt: new Date("2025-11-25T04:30:00Z"),
        endsAt: new Date("2025-11-25T05:30:00Z"),
      }),
    );
  });

  it("refuses a time that isn't free and lists the free ones instead — never books it", async () => {
    const d = deps();
    const r = await bookTime(d, call({ tool: "book", service: "Hair Spa", stylist: "any", start: "2025-11-25 10:10" }));
    expect(r).toMatchObject({ ok: false });
    expect((r as unknown as { freeTimes: unknown[] }).freeTimes.length).toBeGreaterThan(0);
    expect(d.book).not.toHaveBeenCalled();
  });

  it("refuses closed days and malformed times", async () => {
    const d = deps();
    expect(await bookTime(d, call({ tool: "book", service: "Hair Spa", start: "2025-11-30 10:00" }))).toMatchObject({ ok: false });
    expect(await bookTime(d, call({ tool: "book", service: "Hair Spa", start: "tomorrow 10am" }))).toMatchObject({ ok: false });
    expect(d.book).not.toHaveBeenCalled();
  });

  it("reports a time taken between checking and saving", async () => {
    const r = await bookTime(deps({ book: vi.fn(async () => "taken" as const) }), call({ tool: "book", service: "Hair Spa", start: "2025-11-25 10:00" }));
    expect(r).toMatchObject({ ok: false });
  });
});

describe("runTool", () => {
  it("turns a crash into a result the model can explain", async () => {
    const r = await runTool(deps({ busy: async () => Promise.reject(new Error("db down")) }), call({ service: "Hair Spa", stylist: "any" }));
    expect(r).toMatchObject({ ok: false });
  });
});
