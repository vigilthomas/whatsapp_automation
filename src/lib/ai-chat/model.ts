// ============================================================
// AI chat assistant — pure, unit-testable, no I/O.
//
// The assistant answers WhatsApp chats in Bot mode (migration 061) using
// only what the clinic has told the app: its name, opening hours and
// closures (Settings → Clinic), services and doctors (Master), and the
// clinic's own instructions (Settings → AI assistant). It must not
// guess: whenever the answer isn't in that context — or the patient asks
// for a person, is upset, or raises anything medical beyond logistics —
// it hands the chat to staff.
//
// The model is asked for a small JSON object so the decision is explicit
// rather than inferred from wording:
//
//   {"reply": "<message to the patient>", "handoff": false}
//   {"reply": "<short holding message>", "handoff": true, "reason": "<for staff>"}
//
// `parseModelReply` is defensive: prose around the JSON, code fences, or
// no JSON at all are handled, and anything unusable is a handoff — the
// safe failure is "a person looks at it", never a made-up answer.
// ============================================================

import { WEEKDAYS, type ClinicSettings } from "@/lib/clinic/settings";

export type AiMode = "bot" | "human";

/** The chat's effective mode: its own switch, else the account default. */
export function effectiveMode(chatMode: string | null | undefined, newChatsStartInBot: boolean): AiMode {
  if (chatMode === "bot" || chatMode === "human") return chatMode;
  return newChatsStartInBot ? "bot" : "human";
}

export interface ClinicFacts {
  clinicName: string;
  clinic: ClinicSettings;
  services: { name: string; minutes: number }[];
  doctors: { name: string; branch?: string | null }[];
  /** The clinic's own instructions (tone, policies, prices, FAQs). */
  instructions?: string | null;
  /** "Today" in the clinic's words, so "tomorrow" means something. */
  today: string;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const MAX_INSTRUCTIONS = 4000;
export const MAX_REPLY = 1000;

function hoursText(c: ClinicSettings): string {
  return WEEKDAYS.map((w) => {
    const h = c.hours[w];
    return `- ${DAY_NAMES[w]}: ${h.open ? `${h.start}–${h.end}` : "closed"}`;
  }).join("\n");
}

function closuresText(c: ClinicSettings): string {
  const lines = [
    ...c.holidays.map((h) => `- ${h.yearly ? `${h.date.slice(5)} every year` : h.date}: ${h.name || "holiday"}`),
    ...c.closures.map((x) => `- ${x.from}${x.to !== x.from ? ` to ${x.to}` : ""}: ${x.reason || "closed"}`),
  ];
  return lines.length ? lines.join("\n") : "- none";
}

/** The system prompt: role, hard rules, then the facts. */
export function buildSystemPrompt(f: ClinicFacts): string {
  const services = f.services.length
    ? f.services.map((s) => `- ${s.name} (about ${s.minutes} min)`).join("\n")
    : "- not listed";
  const doctors = f.doctors.length
    ? f.doctors.map((d) => `- ${d.name}${d.branch ? ` (${d.branch})` : ""}`).join("\n")
    : "- not listed";
  const extra = (f.instructions ?? "").trim().slice(0, MAX_INSTRUCTIONS);
  return [
    `You are the WhatsApp receptionist for ${f.clinicName}. Today is ${f.today}.`,
    "",
    "Rules:",
    "- Answer ONLY from the clinic facts and instructions below. Never invent prices, availability, policies or medical advice.",
    "- If the answer is not in them, if the patient asks for a person, is upset or complaining, or asks anything medical beyond simple logistics, hand the chat to staff.",
    "- For booking, explain that they can send the word \"book\" to start booking, or hand over if they want staff to book.",
    "- Reply in the patient's language, briefly and warmly, as plain WhatsApp text (no markdown headings, at most a few short lines).",
    "",
    'Respond with ONLY a JSON object: {"reply": string, "handoff": boolean, "reason": string}.',
    '- handoff false: "reply" answers the patient.',
    '- handoff true: "reply" is a short message telling the patient a team member will get back to them; "reason" says briefly, for staff, what the patient needs.',
    "",
    "Clinic facts:",
    `Name: ${f.clinicName}`,
    "Opening hours:",
    hoursText(f.clinic),
    "Holidays and closed dates:",
    closuresText(f.clinic),
    "Services:",
    services,
    "Doctors:",
    doctors,
    ...(extra ? ["", "Clinic instructions (from the clinic, follow them):", extra] : []),
  ].join("\n");
}

export interface ModelDecision {
  reply: string;
  handoff: boolean;
  /** For staff, on handoff. */
  reason: string;
}

/** What to tell the patient when the model's own holding message is unusable. */
export const DEFAULT_HANDOFF_REPLY = "Thanks for your message. A member of our team will reply to you shortly.";

/** Read the model's answer. Anything that isn't a clear answer becomes a handoff. */
export function parseModelReply(raw: string | null | undefined): ModelDecision {
  const text = (raw ?? "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const o = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
      const reply = typeof o.reply === "string" ? o.reply.trim().slice(0, MAX_REPLY) : "";
      const reason = typeof o.reason === "string" ? o.reason.trim().slice(0, 500) : "";
      if (o.handoff === true) return { reply: reply || DEFAULT_HANDOFF_REPLY, handoff: true, reason: reason || "The assistant couldn't answer." };
      if (o.handoff === false && reply) return { reply, handoff: false, reason: "" };
    } catch {
      // fall through: not JSON
    }
  }
  return { reply: DEFAULT_HANDOFF_REPLY, handoff: true, reason: "The assistant's answer couldn't be read." };
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Recent messages as alternating turns for the model: customer → user,
 * staff/bot → assistant; consecutive same-role messages are joined;
 * the history starts on a user turn (Anthropic requires it).
 */
export function toTurns(messages: { sender_type: string; content_text: string | null }[], maxTurns = 12): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const m of messages) {
    const content = (m.content_text ?? "").trim();
    if (!content) continue;
    const role: ChatTurn["role"] = m.sender_type === "customer" ? "user" : "assistant";
    const last = turns[turns.length - 1];
    if (last?.role === role) last.content += `\n${content}`;
    else turns.push({ role, content });
  }
  const recent = turns.slice(-maxTurns);
  while (recent.length && recent[0].role !== "user") recent.shift();
  return recent;
}
