import { describe, expect, it, vi } from "vitest";

import { continueBooking, startBooking, type BookingDeps, type BookingState, type Reply, type StepResult } from "./engine";
import { DEFAULT_CONFIG, matchesKeyword, parseBookingConfig, type BookingConfig } from "./settings";
import { candidateDays, freeSlots, localDay, zonedInstant, type Busy } from "./slots";
import { dynamicStarts, hhmm } from "./schedule";

// Monday 24 Nov 2025, 08:00 in India (02:30 UTC).
const NOW = new Date("2025-11-24T02:30:00Z");
const config: BookingConfig = { ...DEFAULT_CONFIG, minNoticeMinutes: 0, daysAhead: 3 };

describe("zonedInstant / localDay", () => {
  it("turns clinic wall-clock time into the right instant", () => {
    expect(zonedInstant("2025-11-24", 9 * 60, "Asia/Kolkata").toISOString()).toBe("2025-11-24T03:30:00.000Z");
    expect(zonedInstant("2025-07-01", 9 * 60, "Europe/London").toISOString()).toBe("2025-07-01T08:00:00.000Z");
    expect(localDay(new Date("2025-11-24T20:00:00Z"), "Asia/Kolkata")).toBe("2025-11-25");
  });
});

describe("freeSlots", () => {
  const base = { config, day: "2025-11-24", durationMin: 30, now: NOW };

  it("steps through opening hours and keeps the whole service inside them", () => {
    const slots = freeSlots({ ...base, doctorIds: [], busy: [] });
    expect(slots).toHaveLength(18); // 09:00 … 17:30
    expect(slots[0].start.toISOString()).toBe("2025-11-24T03:30:00.000Z");
    const long = freeSlots({ ...base, durationMin: 60, doctorIds: [], busy: [] });
    expect(long.at(-1)!.start.toISOString()).toBe("2025-11-24T11:30:00.000Z"); // 17:00
  });

  it("skips the doctor's booked times, but 'any doctor' still finds someone", () => {
    const busy: Busy[] = [{ doctor_id: "d1", starts_at: "2025-11-24T03:30:00Z", ends_at: "2025-11-24T04:30:00Z" }];
    const one = freeSlots({ ...base, doctorIds: ["d1"], busy });
    expect(one[0].start.toISOString()).toBe("2025-11-24T04:30:00.000Z");
    const any = freeSlots({ ...base, doctorIds: ["d1", "d2"], busy });
    expect(any[0]).toMatchObject({ doctorId: "d2" });
  });

  it("respects the notice period and closed days", () => {
    const later = freeSlots({ ...base, now: new Date("2025-11-24T10:00:00Z"), config: { ...config, minNoticeMinutes: 60 }, doctorIds: [], busy: [] });
    expect(later[0].start.toISOString()).toBe("2025-11-24T11:00:00.000Z"); // 16:30
    expect(freeSlots({ ...base, day: "2025-11-30", doctorIds: [], busy: [] })).toEqual([]); // Sunday
    expect(candidateDays({ ...config, daysAhead: 7 }, NOW)).not.toContain("2025-11-30");
  });
});

describe("settings", () => {
  it("fills in defaults and drops bad values", () => {
    const c = parseBookingConfig({ slotMinutes: 1, timezone: "Mars/Base", hours: { 1: { open: true, start: "18:00", end: "09:00" } }, questions: [{ text: " Age? " }, { text: "" }] });
    expect(c.slotMinutes).toBe(5);
    expect(c.timezone).toBe("Asia/Kolkata");
    expect(c.hours[1]).toEqual({ open: false, start: "09:00", end: "18:00" });
    expect(c.questions).toEqual([{ id: "q1", text: "Age?", type: "text", options: [], required: true }]);
  });

  it("matches trigger words as whole words", () => {
    expect(matchesKeyword("Hi, I want to BOOK a slot", ["book"])).toBe(true);
    expect(matchesKeyword("facebook", ["book"])).toBe(false);
    expect(matchesKeyword("need an appointment please", ["appointment"])).toBe(true);
  });
});

// ------------------------------------------------------------ conversation

function deps(over: Partial<BookingDeps> = {}): BookingDeps {
  return {
    config: { ...config, questions: [{ id: "q1", text: "Any symptoms?", type: "text", options: [], required: true }] },
    services: [
      { id: "s1", name: "Consultation", duration_min: 30 },
      { id: "s2", name: "Dental cleaning", duration_min: 60 },
    ],
    doctors: [
      { id: "d1", name: "Dr Asha", branch_id: "c1" },
      { id: "d2", name: "Dr Ravi", branch_id: "c1" },
    ],
    contactName: null,
    now: NOW,
    busy: async () => [],
    book: vi.fn(async () => "ok" as const),
    ...over,
  };
}

const ids = (r: StepResult) =>
  r.replies.flatMap((x: Reply) => (x.kind === "buttons" ? x.buttons.map((b) => b.id) : x.kind === "list" ? x.rows.map((b) => b.id) : []));

async function walk(d: BookingDeps, inputs: { text?: string; replyId?: string }[]) {
  let r = await startBooking(d);
  for (const input of inputs) r = await continueBooking(r.state as BookingState, input, d);
  return r;
}

describe("booking conversation", () => {
  it("books end to end: service, doctor, day, time, name, question, confirm", async () => {
    const d = deps();
    let r = await walk(d, [{ replyId: "bk:book" }, { replyId: "bk:svc:s2" }, { replyId: "bk:doc:d2" }]);
    expect(r.state?.step).toBe("day");
    expect(ids(r)[0]).toBe("bk:day:2025-11-24");

    r = await continueBooking(r.state!, { replyId: "bk:day:2025-11-24" }, d);
    expect(r.state?.step).toBe("time");
    const time = ids(r)[0];
    expect(time).toBe(`bk:time:${Date.parse("2025-11-24T03:30:00Z")}:d2`);

    r = await continueBooking(r.state!, { replyId: time }, d);
    expect(r.state?.step).toBe("name");
    r = await continueBooking(r.state!, { text: "  Meera   Nair " }, d);
    expect(r.saveName).toBe("Meera Nair");
    expect(r.replies[0]).toEqual({ kind: "text", text: "Any symptoms?" });
    r = await continueBooking(r.state!, { text: "Tooth pain" }, d);
    expect(r.state?.step).toBe("confirm");
    expect(ids(r)).toEqual(["bk:yes", "bk:change", "bk:no"]);

    r = await continueBooking(r.state!, { replyId: "bk:yes" }, d);
    expect(r.state).toBeNull();
    expect(d.book).toHaveBeenCalledWith({
      serviceName: "Dental cleaning",
      doctorId: "d2",
      branchId: "c1",
      startsAt: new Date("2025-11-24T03:30:00Z"),
      endsAt: new Date("2025-11-24T04:30:00Z"),
      bufferMin: 0,
      notes: "Booked by the customer on WhatsApp.\n\nAny symptoms?\n→ Tooth pain",
    });
    expect((r.replies[0] as { text: string }).text).toContain("Dental cleaning with Dr Ravi");
  });

  it("skips the name when the contact has one, and asks again when a time was taken", async () => {
    const d = deps({ contactName: "Meera", config: config, book: vi.fn(async () => "taken" as const) });
    let r = await walk(d, [{ replyId: "bk:book" }, { text: "consultation" }, { text: "any" }, { replyId: "bk:day:2025-11-24" }]);
    r = await continueBooking(r.state!, { replyId: ids(r)[0] }, d);
    expect(r.state?.step).toBe("confirm");
    r = await continueBooking(r.state!, { text: "yes" }, d);
    expect(r.state?.step).toBe("time");
    expect(r.replies[0]).toMatchObject({ text: expect.stringContaining("just taken") });
  });

  it("check availability lists free times and can go on to book", async () => {
    const d = deps();
    let r = await walk(d, [{ replyId: "bk:check" }, { replyId: "bk:svc:s1" }, { replyId: "bk:doc:any" }]);
    expect(r.state?.step).toBe("checked");
    expect((r.replies[0] as { body: string }).body).toContain("Mon 24 Nov");
    r = await continueBooking(r.state!, { replyId: "bk:book" }, d);
    expect(r.state?.step).toBe("day");
  });

  it("cancels on request and gives up after repeated nonsense", async () => {
    const d = deps();
    let r = await walk(d, [{ text: "cancel" }]);
    expect(r.state).toBeNull();
    r = await walk(d, [{ text: "??" }, { text: "??" }, { text: "??" }]);
    expect(r.state?.step).toBe("menu");
    r = await continueBooking(r.state!, { text: "??" }, d);
    expect(r.state).toBeNull();
  });

  it("works for a clinic with one service and no doctors", async () => {
    const d = deps({ services: [{ id: "s1", name: "Check-up", duration_min: 20 }], doctors: [] });
    const r = await walk(d, [{ replyId: "bk:book" }]);
    expect(r.state).toMatchObject({ step: "day", serviceName: "Check-up", doctorChoice: "none" });
  });

  it("pages through long days", async () => {
    const d = deps();
    let r = await walk(d, [{ replyId: "bk:book" }, { replyId: "bk:svc:s1" }, { replyId: "bk:doc:d1" }, { replyId: "bk:day:2025-11-24" }]);
    expect(ids(r)).toHaveLength(10);
    expect(ids(r).at(-1)).toBe("bk:more");
    r = await continueBooking(r.state!, { replyId: "bk:more" }, d);
    expect(ids(r)[0]).toBe(`bk:time:${Date.parse("2025-11-24T08:00:00Z")}:d1`); // 13:30
  });
});

describe("customising the conversation", () => {
  const yesno = { id: "first", text: "First visit?", type: "yesno" as const, options: [], required: true };
  const choice = { id: "how", text: "How did you hear of us?", type: "choice" as const, options: ["Friend", "Google"], required: false };

  it("uses the clinic's own texts and button labels", async () => {
    const d = deps({ config: { ...config, texts: { ...config.texts, welcome: "Namaskaram!", btnBook: "Book now" } } });
    const r = await startBooking(d);
    expect(r.replies[0]).toMatchObject({ body: "Namaskaram!", buttons: [{ id: "bk:book", title: "Book now" }, { id: "bk:check" }] });
  });

  it("can skip the menu, ask the name first, and drop the service step", async () => {
    const steps = parseBookingConfig({
      steps: [
        { id: "name", enabled: true },
        { id: "service", enabled: false },
        { id: "doctor", enabled: true },
        { id: "datetime", enabled: true },
        { id: "questions", enabled: false },
      ],
    }).steps;
    const d = deps({ config: { ...config, offerCheck: false, steps, defaultService: "General visit" } });
    let r = await startBooking(d);
    expect(r.replies.map((x) => (x.kind === "text" ? x.text : ""))).toEqual([config.texts.welcome, config.texts.askName]);
    r = await continueBooking(r.state!, { text: "Meera" }, d);
    expect(r.state).toMatchObject({ step: "doctor", serviceName: "General visit" });
  });

  it("keeps service and doctor before date & time whatever the saved order", () => {
    const steps = parseBookingConfig({ steps: [{ id: "datetime" }, { id: "doctor" }, { id: "service" }] }).steps;
    expect(steps.map((s) => s.id)).toEqual(["doctor", "service", "datetime", "name", "questions"]);
    expect(parseBookingConfig({ steps: [{ id: "datetime", enabled: false }] }).steps.find((s) => s.id === "datetime")?.enabled).toBe(true);
  });

  it("asks yes/no and choice questions, lets optional ones be skipped, and books without a summary", async () => {
    const d = deps({ contactName: "Meera", config: { ...config, confirmStep: false, questions: [yesno, choice] } });
    let r = await walk(d, [{ replyId: "bk:book" }, { replyId: "bk:svc:s1" }, { replyId: "bk:doc:d1" }, { replyId: "bk:day:2025-11-24" }]);
    r = await continueBooking(r.state!, { replyId: ids(r)[0] }, d);
    expect(ids(r)).toEqual(["bk:qa:yes", "bk:qa:no"]);
    r = await continueBooking(r.state!, { replyId: "bk:qa:no" }, d);
    expect(ids(r)).toEqual(["bk:qa:0", "bk:qa:1", "bk:qa:skip"]);
    r = await continueBooking(r.state!, { replyId: "bk:qa:skip" }, d);
    expect(r.state).toBeNull();
    expect(d.book).toHaveBeenCalledWith(expect.objectContaining({ notes: "Booked by the customer on WhatsApp.\n\nFirst visit?\n→ No" }));
  });

  it("stops on the clinic's own cancel words", async () => {
    const d = deps({ config: { ...config, cancelWords: ["venda"] } });
    const r = await walk(d, [{ text: "Venda" }]);
    expect(r.state).toBeNull();
  });

  it("reads the old three-message format", () => {
    const c = parseBookingConfig({ messages: { welcome: "Hi there" }, askName: false });
    expect(c.texts.welcome).toBe("Hi there");
    expect(c.steps.find((s) => s.id === "name")?.enabled).toBe(false);
  });
});

describe("dynamic times with buffers, doctor services and leaves", () => {
  it("starts the next visit right after a booking, then steps by the gap", () => {
    // 45 min visit booked 9:00–9:45, nothing else: 9:45, 10:15, 10:45…
    const starts = dynamicStarts({ open: 540, close: 720, durationMin: 45, bufferMin: 0, gapMin: 30, blocks: [{ start: 540, end: 585, bufferMin: 0 }] });
    expect(starts.slice(0, 3).map(hhmm)).toEqual(["09:45", "10:15", "10:45"]);
  });

  it("keeps half of each buffer on either side of a booking", () => {
    // Booked 9:00–9:45 with a 10 min buffer; new visit also 10 min buffer → 9:45 + 5 + 5 = 9:55.
    const starts = dynamicStarts({ open: 540, close: 720, durationMin: 30, bufferMin: 10, gapMin: 30, blocks: [{ start: 540, end: 585, bufferMin: 10 }] });
    expect(hhmm(starts[0])).toBe("09:55");
    // A later booking pushes times that would run into it (plus buffers) past it.
    const around = dynamicStarts({ open: 540, close: 720, durationMin: 30, bufferMin: 0, gapMin: 30, blocks: [{ start: 600, end: 630, bufferMin: 20 }] });
    expect(around.map(hhmm).slice(0, 3)).toEqual(["09:00", "10:40", "11:10"]);
  });

  it("offers only the doctors linked to a service, skips doctors on leave, and mentions the buffer", async () => {
    const d = deps({
      contactName: "Meera",
      config: { ...config, questions: [] },
      services: [
        { id: "s1", name: "Consultation", duration_min: 30 },
        { id: "s2", name: "Root canal", duration_min: 45, buffer_min: 10 },
      ],
      doctorServices: [{ doctor_id: "d2", service_id: "s2" }],
      leaves: [{ doctor_id: "d2", starts_on: "2025-11-24", ends_on: "2025-11-24" }],
    });
    let r = await walk(d, [{ replyId: "bk:book" }, { replyId: "bk:svc:s2" }]);
    // Only Dr Ravi does root canals, so the doctor question is skipped.
    expect(r.state).toMatchObject({ step: "day", doctorChoice: "d2", buffer: 10 });
    // He's on leave on Monday 24th, so the first day offered is the 25th.
    expect(ids(r)[0]).toBe("bk:day:2025-11-25");
    r = await continueBooking(r.state!, { replyId: "bk:day:2025-11-25" }, d);
    expect((r.replies[0] as { body: string }).body).toContain("keep 10 min free");
    r = await continueBooking(r.state!, { replyId: ids(r)[0] }, d);
    r = await continueBooking(r.state!, { replyId: "bk:yes" }, d);
    expect((r.replies[0] as { text: string }).text).toContain("arrive 5 min early");
  });
});

describe("half days and late coming", () => {
  it("only offers a doctor once they're in", async () => {
    const run = async (leave: { leave_type: "half_am" | "half_pm" | "late"; late_minutes?: number }) => {
      const d = deps({
        contactName: "Meera",
        config: { ...config, questions: [] },
        doctors: [{ id: "d1", name: "Dr Asha", branch_id: null }],
        leaves: [{ doctor_id: "d1", starts_on: "2025-11-24", ends_on: "2025-11-24", ...leave }],
      });
      const r = await walk(d, [{ replyId: "bk:book" }, { replyId: "bk:svc:s1" }, { replyId: "bk:day:2025-11-24" }]);
      const rows = (r.replies.at(-1) as { rows: { title: string }[] }).rows.map((x) => x.title);
      return { first: rows[0], last: rows.filter((x) => !x.startsWith("Later")).at(-1) };
    };
    // Hours 9:00–18:00, middle 13:30.
    expect((await run({ leave_type: "half_am" })).first).toBe("1:30 pm");
    expect((await run({ leave_type: "late", late_minutes: 90 })).first).toBe("10:30 am");
    expect((await run({ leave_type: "half_pm" })).last).toBe("1:00 pm");
  });
});

describe("a doctor's own time for a service", () => {
  it("fits and books the doctor's time instead of the service default", async () => {
    // 60 min with this doctor (default 30): the last start is 17:00, not 17:30.
    const slots = freeSlots({ config, day: "2025-11-24", durationMin: 30, durationFor: { d1: 60 }, doctorIds: ["d1"], busy: [], now: NOW });
    expect(slots.at(-1)!.start.toISOString()).toBe("2025-11-24T11:30:00.000Z");
    expect(slots[0].end.getTime() - slots[0].start.getTime()).toBe(60 * 60_000);

    const d = deps({
      contactName: "Meera",
      config: { ...config, questions: [] },
      doctors: [{ id: "d1", name: "Dr Asha", branch_id: null }],
      services: [{ id: "s1", name: "Consultation", duration_min: 30 }],
      doctorServices: [{ doctor_id: "d1", service_id: "s1", duration_min: 45 }],
    });
    let r = await walk(d, [{ replyId: "bk:book" }, { replyId: "bk:svc:s1" }, { replyId: "bk:day:2025-11-24" }]);
    r = await continueBooking(r.state!, { replyId: ids(r)[0] }, d);
    expect(r.state).toMatchObject({ duration: 45 });
    expect(Date.parse(r.state!.endsAt!) - Date.parse(r.state!.startsAt!)).toBe(45 * 60_000);
  });
});
