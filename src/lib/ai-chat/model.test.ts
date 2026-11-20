import { describe, expect, it } from "vitest";
import { DEFAULT_CLINIC_SETTINGS, parseClinicSettings } from "@/lib/clinic/settings";
import { DEFAULT_HANDOFF_REPLY, buildSystemPrompt, effectiveMode, parseModelReply, toTurns } from "./model";

describe("effectiveMode", () => {
  it("uses the chat's own switch, else the account default", () => {
    expect(effectiveMode("human", true)).toBe("human");
    expect(effectiveMode("bot", false)).toBe("bot");
    expect(effectiveMode(null, true)).toBe("bot");
    expect(effectiveMode(undefined, false)).toBe("human");
  });
});

describe("parseModelReply", () => {
  it("takes a clean answer", () => {
    expect(parseModelReply('{"reply":"We open at 9.","handoff":false}')).toEqual({ reply: "We open at 9.", handoff: false, reason: "" });
  });

  it("finds the JSON inside fences or prose", () => {
    const out = parseModelReply('Sure!\n```json\n{"reply":"Hi","handoff":false}\n```');
    expect(out).toEqual({ reply: "Hi", handoff: false, reason: "" });
  });

  it("passes a handoff through with the reason for staff", () => {
    expect(parseModelReply('{"reply":"A colleague will reply.","handoff":true,"reason":"Asks about insurance"}')).toEqual({
      reply: "A colleague will reply.",
      handoff: true,
      reason: "Asks about insurance",
    });
  });

  it("reads a booking tool call and trims its arguments", () => {
    const out = parseModelReply('{"tool":"book","service":" Hair Spa ","stylist":"any","start":"2025-11-25 10:00","name":"Meera"}');
    expect(out.tool).toEqual({ tool: "book", service: "Hair Spa", stylist: "any", date: "", start: "2025-11-25 10:00", name: "Meera" });
    expect(out.handoff).toBe(false);
    // An unknown tool is not a tool call; with no reply it is a handoff.
    expect(parseModelReply('{"tool":"cancel_all"}')).toMatchObject({ handoff: true });
  });

  it("hands over when the answer is unreadable or empty — never guesses", () => {
    expect(parseModelReply("I think we open at 8?")).toMatchObject({ handoff: true, reply: DEFAULT_HANDOFF_REPLY });
    expect(parseModelReply('{"reply":"","handoff":false}').handoff).toBe(true);
    expect(parseModelReply(null).handoff).toBe(true);
  });
});

describe("buildSystemPrompt", () => {
  it("lists hours, closures, services, doctors and the clinic's instructions", () => {
    const prompt = buildSystemPrompt({
      clinicName: "Smile Dental",
      clinic: parseClinicSettings({ holidays: [{ date: "2026-12-25", name: "Christmas", yearly: true }] }),
      services: [{ name: "Cleaning", minutes: 30 }],
      doctors: [{ name: "Dr Rao", branch: "Kochi" }],
      instructions: "Consultation fee is 500 rupees.",
      today: "Friday, 20 November 2026",
    });
    expect(prompt).toContain("Smile Dental");
    expect(prompt).toContain("Sunday: closed");
    expect(prompt).toContain("Monday: 09:00–18:00");
    expect(prompt).toContain("12-25 every year: Christmas");
    expect(prompt).toContain("Cleaning (about 30 min)");
    expect(prompt).toContain("Dr Rao (Kochi)");
    expect(prompt).toContain("Consultation fee is 500 rupees.");
  });

  it("adds the booking tools only when booking is on", () => {
    const base = { clinicName: "X", clinic: DEFAULT_CLINIC_SETTINGS, services: [], doctors: [], today: "today" };
    expect(buildSystemPrompt(base)).toContain('send the word "book"');
    const withBooking = buildSystemPrompt({
      ...base,
      booking: { todayIso: "2025-11-24", timezone: "Asia/Kolkata", daysAhead: 14, customerName: "Meera" },
    });
    expect(withBooking).toContain('"tool": "find_times"');
    expect(withBooking).toContain('"tool": "book"');
    expect(withBooking).toContain("Today is 2025-11-24");
    expect(withBooking).toContain("Their saved name is Meera");
    expect(withBooking).not.toContain('send the word "book"');
  });

  it("says when nothing is listed instead of leaving blanks", () => {
    const prompt = buildSystemPrompt({ clinicName: "X", clinic: DEFAULT_CLINIC_SETTINGS, services: [], doctors: [], today: "today" });
    expect(prompt).toContain("Services:\n- not listed");
  });
});

describe("toTurns", () => {
  it("maps senders, merges runs and starts on the patient", () => {
    const turns = toTurns([
      { sender_type: "agent", content_text: "Welcome!" },
      { sender_type: "customer", content_text: "Hi" },
      { sender_type: "customer", content_text: "Open today?" },
      { sender_type: "bot", content_text: "Yes, 9 to 6." },
      { sender_type: "customer", content_text: "" },
    ]);
    expect(turns).toEqual([
      { role: "user", content: "Hi\nOpen today?" },
      { role: "assistant", content: "Yes, 9 to 6." },
    ]);
  });
});
