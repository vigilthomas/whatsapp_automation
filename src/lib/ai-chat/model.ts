import { resolveTerms, type Terms } from "@/lib/vocabulary";
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
// When booking is on (`ClinicFacts.booking`), it may instead answer with
// a booking action (ai-chat/booking.ts) and gets the result back as the
// next turn before answering:
//
//   {"action": "find_times", "service": "...", "stylist": "...", "date": "YYYY-MM-DD"}
//   {"action": "book", "service": "...", "stylist": "...", "start": "YYYY-MM-DD HH:MM", "name": "..."}
//
// Worded as "actions" in plain JSON, not "tools": with "tool" in the
// prompt, gpt-oss on Groq tried native function calls and Groq's JSON
// mode got an empty answer (json_validate_failed, failed_generation "").
//
// `parseModelReply` is defensive: prose around the JSON, code fences, or
// no JSON at all are handled, and anything unusable is a handoff — the
// safe failure is "a person looks at it", never a made-up answer.
// ============================================================

import { WEEKDAYS, type ClinicSettings } from "@/lib/clinic/settings";
import { TOOL_NAMES, type ToolCall, type ToolName } from "./booking";

export type AiMode = "bot" | "human";

/** The chat's effective mode: its own switch, else the account default. */
export function effectiveMode(chatMode: string | null | undefined, newChatsStartInBot: boolean): AiMode {
  if (chatMode === "bot" || chatMode === "human") return chatMode;
  return newChatsStartInBot ? "bot" : "human";
}

export interface ClinicFacts {
  clinicName: string;
  /** Business words for the prompt; default = the install default sector. */
  terms?: Terms;
  clinic: ClinicSettings;
  services: { name: string; minutes: number }[];
  doctors: { name: string; branch?: string | null }[];
  /** The clinic's own instructions (tone, policies, prices, FAQs). */
  instructions?: string | null;
  /** "Today" in the clinic's words, so "tomorrow" means something. */
  today: string;
  /** Present when the assistant may check times and book (booking tools). */
  booking?: {
    /** Today in the business's zone, "YYYY-MM-DD". */
    todayIso: string;
    timezone: string;
    daysAhead: number;
    /** The contact's saved name, so the model doesn't ask again. */
    customerName: string | null;
  };
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
  // The install's own words (Settings → Branding → Business type), in
  // English for the model; it still replies in the customer's language.
  const w = f.terms ?? resolveTerms(null, "en");
  const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
  const business = lc(w.business.one);
  const customer = lc(w.customer.one);
  const staffMany = w.staff.many;
  const services = f.services.length
    ? f.services.map((s) => `- ${s.name} (about ${s.minutes} min)`).join("\n")
    : "- not listed";
  const doctors = f.doctors.length
    ? f.doctors.map((d) => `- ${d.name}${d.branch ? ` (${d.branch})` : ""}`).join("\n")
    : "- not listed";
  const extra = (f.instructions ?? "").trim().slice(0, MAX_INSTRUCTIONS);
  const staffOne = lc(w.staff.one);
  const b = f.booking;
  const bookingRules = b
    ? [
        "",
        "Booking (you can check free times and book yourself):",
        `- Today is ${b.todayIso} (time zone ${b.timezone}). ${w.business.one} bookings can be made up to ${b.daysAhead} days ahead.`,
        `- NEVER guess or invent times. Only offer times that a find_times result returned, and say which ${staffOne} each is with and, when the list above shows one, their branch.`,
        `- As soon as you know the service and roughly when (a day, "tomorrow", "Saturday afternoon", or a time), call find_times — before asking for their name. If they asked for a specific time, check it is in the result.`,
        `- When you offer times, list the actual times (up to 5, nearest to what they asked for), e.g. "10:00, 10:30 or 11:00 am with Anjali". Never just say there are slots.`,
        `- To check times, respond with ONLY: {"action": "find_times", "service": "<exact service name>", "stylist": "<${staffOne} name, or any>", "date": "<YYYY-MM-DD, or empty for the next open days>"}`,
        `- Before booking you need the service, the ${staffOne} (or any), an exact time from find_times, and the ${customer}'s name.` +
          (b.customerName ? ` Their saved name is ${b.customerName}; use it unless they give another.` : " Ask for their name."),
        `- Then repeat the service, ${staffOne}, date and time and ask them to confirm. Only after they clearly say yes, respond with ONLY: {"action": "book", "service": "<exact service name>", "stylist": "<the ${staffOne} from find_times>", "start": "YYYY-MM-DD HH:MM", "name": "<their name>"}`,
        '- These are plain JSON answers, not function calls. After one, the next message starts with "ACTION RESULT" — it comes from the system, not the customer. Use it, then answer with the reply JSON. Never claim a booking is made unless a book result says ok true. If a time is not free, offer the free times it lists.',
        '- Never reply "let me check" or "checking…": when you need times, answer with the find_times action itself, in that same response.',
        `- To cancel or move an existing booking, hand the chat to staff.`,
      ]
    : ['- For booking, explain that they can send the word "book" to start booking, or hand over if they want staff to book.'];
  return [
    `You are the WhatsApp receptionist for ${f.clinicName}, a ${business}. Today is ${f.today}.`,
    "",
    "Rules:",
    `- Answer ONLY from the ${business} facts and instructions below. Never invent prices, availability, policies or professional advice (medical, legal, financial or similar).`,
    `- If the answer is not in them, if the ${customer} asks for a person, is upset or complaining, or asks for advice beyond simple logistics, hand the chat to staff.`,
    `- Reply in the ${customer}'s language, briefly and warmly, as plain WhatsApp text (no markdown headings, at most a few short lines).`,
    ...bookingRules,
    "",
    'Respond with ONLY a JSON object: {"reply": string, "handoff": boolean, "reason": string}' + (b ? ", or one booking action as above." : "."),
    `- handoff false: "reply" answers the ${customer}.`,
    `- handoff true: "reply" is a short message telling the ${customer} a team member will get back to them; "reason" says briefly, for staff, what the ${customer} needs.`,
    "",
    `${w.business.one} facts:`,
    `Name: ${f.clinicName}`,
    "Opening hours:",
    hoursText(f.clinic),
    "Holidays and closed dates:",
    closuresText(f.clinic),
    "Services:",
    services,
    `${staffMany}:`,
    doctors,
    ...(extra ? ["", `Instructions from the ${business} (follow them):`, extra] : []),
  ].join("\n");
}

export interface ModelDecision {
  reply: string;
  handoff: boolean;
  /** For staff, on handoff. */
  reason: string;
  /** A booking tool the model wants run before it answers. */
  tool?: ToolCall;
}

const toolArg = (v: unknown, max = 100) => (typeof v === "string" ? v.trim().slice(0, max) : "");

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
      // "action" is what the prompt asks for; "tool" is still read too.
      const named = typeof o.action === "string" ? o.action : o.tool;
      if (typeof named === "string" && (TOOL_NAMES as readonly string[]).includes(named)) {
        const tool: ToolCall = {
          tool: named as ToolName,
          service: toolArg(o.service),
          stylist: toolArg(o.stylist),
          date: toolArg(o.date, 10),
          start: toolArg(o.start, 16),
          name: toolArg(o.name, 80),
        };
        return { reply: "", handoff: false, reason: "", tool };
      }
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
