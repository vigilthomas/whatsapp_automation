import { describe, expect, it, vi } from "vitest";

import type { BookingDeps } from "@/lib/booking/engine";
import { DEFAULT_CONFIG, type BookingConfig } from "@/lib/booking/settings";
import {
  bookTime,
  cancelAppointment,
  findTimes,
  matchByName,
  myAppointments,
  rescheduleAppointment,
  runTool,
  type AiDeps,
  type OwnAppointment,
  type ToolCall,
} from "./booking";

// Monday 24 Nov 2025, 08:00 in India (02:30 UTC). Hours 09:00–18:00, Sunday closed.
const NOW = new Date("2025-11-24T02:30:00Z");
const config: BookingConfig = { ...DEFAULT_CONFIG, minNoticeMinutes: 0, daysAhead: 7 };

function deps(over: Partial<AiDeps> = {}): AiDeps {
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
  appointment: "",
  after: "",
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

  it("takes the longest listed name inside a longer one (the model sometimes adds the branch)", () => {
    const docs = [{ name: "Dr. Arjun Pillai" }, { name: "Dr. Arjun Pillai (Demo)" }];
    expect(matchByName(docs, "Dr. Arjun Pillai (Demo) (Aluva)")?.name).toBe("Dr. Arjun Pillai (Demo)");
    expect(matchByName(docs, "Dr. Arjun Pillai")?.name).toBe("Dr. Arjun Pillai");
    // Still refuses a guess between two names it only partly matches.
    expect(matchByName(docs, "arjun")).toBeUndefined();
  });
});

describe("findTimes", () => {
  it("lists free times by day with the stylist for each", async () => {
    const r = await findTimes(deps(), call({ service: "haircut - women", stylist: "any", date: "2025-11-24" }));
    expect(r.ok).toBe(true);
    const days = (r as unknown as { days: { date: string; times: { time: string; stylist: string }[] }[] }).days;
    expect(days).toHaveLength(1);
    expect(days[0].times[0]).toEqual({ time: "09:00", label: "9:00 am", stylist: "Anjali Menon" });
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

  it("starts the list at the time of day asked for, so evenings are reachable", async () => {
    const r = (await findTimes(deps(), call({ service: "Hair Spa", stylist: "any", date: "2025-11-25", after: "16:00" }))) as unknown as {
      days: { times: { time: string }[] }[];
    };
    expect(r.days[0].times[0].time).toBe("16:00");
    // Written out, so the model never has to convert 24-hour times (it once wrote noon as "12:00 am").
    expect((r.days[0].times[0] as unknown as { label: string }).label).toBe("4:00 pm");
    expect(r.days[0].times.every((t) => t.time >= "16:00")).toBe(true);
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

// ------------------------------------------------------------ the customer's own bookings

// The sender's own appointments, as CustomerBookings.list returns them
// (already limited to this contact by the loader).
const mine: OwnAppointment[] = [
  // Tue 25 Nov 10:00 IST, Hair Spa with Rahul — upcoming.
  { id: "a-up", service: "Hair Spa", doctor_id: "d2", branch_id: "b1", starts_at: "2025-11-25T04:30:00Z", ends_at: "2025-11-25T05:30:00Z", status: "scheduled" },
  // Last week, missed.
  { id: "a-miss", service: "Haircut - Women", doctor_id: "d1", branch_id: "b1", starts_at: "2025-11-18T05:30:00Z", ends_at: "2025-11-18T06:15:00Z", status: "no_show" },
  // Cancelled earlier, still in the future.
  { id: "a-cxl", service: "Hair Spa", doctor_id: "d2", branch_id: "b1", starts_at: "2025-11-26T04:30:00Z", ends_at: "2025-11-26T05:30:00Z", status: "cancelled" },
];

function own(list: OwnAppointment[] = mine) {
  return {
    list: vi.fn(async () => list),
    cancel: vi.fn(async () => "ok" as const),
    move: vi.fn(async () => "ok" as const),
  };
}

describe("myAppointments", () => {
  it("lists only what the loader returned for this chat, split into upcoming and past, with the status", async () => {
    const r = (await myAppointments(deps({ own: own() }))) as unknown as {
      ok: true;
      upcoming: { id: string; service: string; stylist: string; time: string; status: string }[];
      past: { id: string; status: string }[];
    };
    expect(r.ok).toBe(true);
    expect(r.upcoming.map((a) => a.id)).toEqual(["a-up"]);
    expect(r.upcoming[0]).toMatchObject({ service: "Hair Spa", stylist: "Rahul Nair", time: "10:00 am", status: "scheduled" });
    // Missed and cancelled ones are shown as such, never as upcoming.
    expect(r.past).toEqual(expect.arrayContaining([expect.objectContaining({ id: "a-miss", status: "no_show" })]));
    expect(r.upcoming.find((a) => a.id === "a-cxl")).toBeUndefined();
  });

  it("always shows a recent missed appointment, however many other bookings there are", async () => {
    const many: OwnAppointment[] = [
      ...mine,
      // Lots of later past visits and future cancellations.
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `c${i}`,
        service: "Hair Spa",
        doctor_id: "d2",
        branch_id: "b1",
        starts_at: `2025-11-2${i % 2 ? 0 : 1}T0${i}:00:00Z`,
        ends_at: `2025-11-2${i % 2 ? 0 : 1}T0${i}:30:00Z`,
        status: i % 2 ? "completed" : "cancelled",
      })),
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `f${i}`,
        service: "Hair Spa",
        doctor_id: "d2",
        branch_id: "b1",
        starts_at: `2025-12-0${i + 1}T05:00:00Z`,
        ends_at: `2025-12-0${i + 1}T06:00:00Z`,
        status: "cancelled",
      })),
    ];
    const r = (await myAppointments(deps({ own: own(many) }))) as unknown as { past: { id: string; status: string }[]; missed: { id: string }[] };
    expect(r.missed.map((a) => a.id)).toEqual(["a-miss"]);
    // "past" is what already happened — never a future cancellation.
    expect(r.past.some((a) => a.id.startsWith("f"))).toBe(false);
  });

  it("says so when there are none, and fails safely without the lookup", async () => {
    expect(await myAppointments(deps({ own: own([]) }))).toMatchObject({ ok: true, upcoming: [], past: [], missed: [] });
    expect(await myAppointments(deps())).toMatchObject({ ok: false });
  });
});

describe("appointment codes", () => {
  const uuid = "2010058a-6873-4341-bfe4-4572e5e08b89";
  const list: OwnAppointment[] = [{ ...mine[0], id: uuid }];
  it("shows a short code instead of the database id, and acts on that code", async () => {
    const o = own(list);
    const r = (await myAppointments(deps({ own: o }))) as unknown as { upcoming: { id: string }[] };
    expect(r.upcoming[0].id).toBe("2010058a");
    expect(JSON.stringify(r)).not.toContain(uuid);
    expect(await cancelAppointment(deps({ own: o }), call({ tool: "cancel", appointment: "2010058a" }))).toMatchObject({ ok: true });
    expect(o.cancel).toHaveBeenCalledWith(uuid);
  });
  it("refuses a code that matches none or more than one of their bookings", async () => {
    const two: OwnAppointment[] = [list[0], { ...list[0], id: "2010058a-ffff-4341-bfe4-4572e5e08b89" }];
    const o = own(two);
    expect(await cancelAppointment(deps({ own: o }), call({ tool: "cancel", appointment: "2010058a" }))).toMatchObject({ ok: false });
    expect(await cancelAppointment(deps({ own: o }), call({ tool: "cancel", appointment: "2010" }))).toMatchObject({ ok: false });
    expect(o.cancel).not.toHaveBeenCalled();
  });
});

describe("rescheduling keeps the same person", () => {
  it("uses the appointment's own stylist even if the model shortens a name that matches someone else", async () => {
    // "Rahul Nair" is a different person from "Rahul Nair (Demo)".
    const doctors = [
      { id: "d1", name: "Anjali Menon", branch_id: "b1" },
      { id: "d2", name: "Rahul Nair (Demo)", branch_id: "b1" },
      { id: "d3", name: "Rahul Nair", branch_id: "b2" },
    ];
    const o = own();
    const r = await rescheduleAppointment(deps({ own: o, doctors }), call({ tool: "reschedule", appointment: "a-up", stylist: "Rahul Nair", start: "2025-11-27 11:00" }));
    expect(r).toMatchObject({ ok: true });
    expect(o.move).toHaveBeenCalledWith("a-up", expect.objectContaining({ doctorId: "d2" }));
  });
});

describe("cancelAppointment", () => {
  it("cancels the customer's own upcoming appointment", async () => {
    const o = own();
    const r = await cancelAppointment(deps({ own: o }), call({ tool: "cancel", appointment: "a-up" }));
    expect(r).toMatchObject({ ok: true, cancelled: { service: "Hair Spa", stylist: "Rahul Nair" } });
    expect(o.cancel).toHaveBeenCalledWith("a-up");
  });

  it("refuses an id that isn't theirs, one already cancelled, and one in the past", async () => {
    const o = own();
    for (const id of ["someone-elses-id", "a-cxl", "a-miss", ""]) {
      expect(await cancelAppointment(deps({ own: o }), call({ tool: "cancel", appointment: id }))).toMatchObject({ ok: false });
    }
    expect(o.cancel).not.toHaveBeenCalled();
  });

  it("reports one that changed meanwhile", async () => {
    const o = { ...own(), cancel: vi.fn(async () => "gone" as const) };
    expect(await cancelAppointment(deps({ own: o }), call({ tool: "cancel", appointment: "a-up" }))).toMatchObject({ ok: false });
  });
});

describe("rescheduleAppointment", () => {
  it("moves the customer's own appointment to a free time, keeping the service and stylist", async () => {
    const o = own();
    const r = await rescheduleAppointment(deps({ own: o }), call({ tool: "reschedule", appointment: "a-up", start: "2025-11-27 11:00" }));
    expect(r).toMatchObject({ ok: true, moved: { service: "Hair Spa", stylist: "Rahul Nair", time: "11:00 am" } });
    expect(o.move).toHaveBeenCalledWith(
      "a-up",
      expect.objectContaining({ doctorId: "d2", startsAt: new Date("2025-11-27T05:30:00Z"), endsAt: new Date("2025-11-27T06:30:00Z") }),
    );
  });

  it("can move to a time overlapping the booking being moved (it doesn't block itself)", async () => {
    const o = own();
    // The busy list contains the appointment being moved.
    const busy = async () => [{ id: "a-up", doctor_id: "d2", starts_at: "2025-11-25T04:30:00Z", ends_at: "2025-11-25T05:30:00Z" }];
    const r = await rescheduleAppointment(deps({ own: o, busy }), call({ tool: "reschedule", appointment: "a-up", start: "2025-11-25 10:30" }));
    expect(r).toMatchObject({ ok: true });
    // …but find_times for someone else still sees it as taken.
    const t = (await findTimes(deps({ busy }), call({ service: "Hair Spa", stylist: "Rahul", date: "2025-11-25" }))) as unknown as {
      days: { times: { time: string }[] }[];
    };
    expect(t.days[0].times.map((x) => x.time)).not.toContain("10:00");
    // Only the customer's own booking (from their list) is ignored.
    const t2 = (await findTimes(deps({ busy, own: own() }), call({ service: "Hair Spa", stylist: "Rahul", date: "2025-11-25", appointment: "a-up" }))) as unknown as {
      days: { times: { time: string }[] }[];
    };
    expect(t2.days[0].times.map((x) => x.time)).toContain("10:00");
  });

  it("refuses someone else's appointment, a past one, a busy time and a closed day", async () => {
    const o = own();
    const busy = async () => [{ id: "x", doctor_id: "d2", starts_at: "2025-11-27T05:30:00Z", ends_at: "2025-11-27T06:30:00Z" }];
    const d = deps({ own: o, busy });
    expect(await rescheduleAppointment(d, call({ tool: "reschedule", appointment: "nope", start: "2025-11-27 12:00" }))).toMatchObject({ ok: false });
    expect(await rescheduleAppointment(d, call({ tool: "reschedule", appointment: "a-miss", start: "2025-11-27 12:00" }))).toMatchObject({ ok: false });
    expect(await rescheduleAppointment(d, call({ tool: "reschedule", appointment: "a-up", start: "2025-11-27 11:00" }))).toMatchObject({
      ok: false,
      freeTimes: expect.any(Array),
    });
    expect(await rescheduleAppointment(d, call({ tool: "reschedule", appointment: "a-up", start: "2025-11-30 11:00" }))).toMatchObject({ ok: false });
    expect(o.move).not.toHaveBeenCalled();
  });
});

describe("runTool routing", () => {
  it("routes the new actions", async () => {
    const o = own();
    expect(await runTool(deps({ own: o }), call({ tool: "my_appointments" }))).toMatchObject({ ok: true });
    expect(await runTool(deps({ own: o }), call({ tool: "cancel", appointment: "a-up" }))).toMatchObject({ ok: true });
  });
});
