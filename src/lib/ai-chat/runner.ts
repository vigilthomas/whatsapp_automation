// ============================================================
// AI assistant — reply to an inbound WhatsApp message in Bot mode.
//
// Called from the WhatsApp webhook after the booking assistant and Flows
// have had their turn (a patient mid-booking or in a Flow menu is talking
// to those, not to the AI). Runs on the service-role client because a
// webhook has no user session, so EVERY query here filters by
// `account_id` explicitly — there is no RLS safety net.
//
// Order of checks, cheapest first:
//   1. ai_configs row active with a key (migration 029)
//   2. the chat is in Bot mode (061; NULL → auto_reply_enabled)
//   3. a reply slot is free (claim_ai_reply_slot, 029 — atomic cap). The
//      cap counts per sitting: a chat that has been quiet for
//      SESSION_GAP_HOURS starts counting again, so a customer who booked
//      last month can still come back to check, move or cancel it.
// Then the model answers from the business's facts (model.ts) and its
// actions (booking.ts): free times, booking, and the SENDER'S OWN
// appointments — look up, cancel, reschedule. The loop itself is in
// conversation.ts, shared with the dry-run test chat
// (/api/ai/test-chat), which uses prepareAssistant + toolRunner below
// with `dryRun` so nothing is sent or saved.
//
// "Start new" in the inbox, or the customer sending /clear (/new,
// /restart, /reset) — conversations.ai_context_since, migration 071 —
// makes the model read only messages after that moment: a fresh
// conversation, with the thread itself and appointments left untouched.
//
// Security: the customer is always the webhook's contact. The appointment
// lookup is built for that contact id here; the model never chooses
// whose appointments it sees, and cancel/reschedule filter by
// account_id AND contact_id again in the update.
//
// If it can't answer, or anything fails, the chat is handed to staff:
// switched to Human, assigned to the handoff agent, the agent notified,
// and the customer sent DEFAULT_HANDOFF_REPLY. A failure never leaves the
// customer unanswered by the bot *and* invisible to staff.
//
// Never throws.
// ============================================================

import { supabaseAdmin } from "@/lib/automations/admin-client";
import { decrypt } from "@/lib/whatsapp/encryption";
import { sendMessageToConversation } from "@/lib/whatsapp/send-message";
import { parseClinicSettings } from "@/lib/clinic/settings";
import { parseVocabulary, resolveTerms } from "@/lib/vocabulary";
import { DEFAULT_HANDOFF_REPLY, RESET_REPLY, buildSystemPrompt, effectiveMode, isResetCommand, toTurns, type ChatTurn } from "./model";
import { PROVIDERS, complete, isAiProvider, type AiProvider } from "./provider";
import { runTool, type AiDeps, type CustomerBookings, type OwnAppointment, type ToolCall, type ToolResult } from "./booking";
import { converse } from "./conversation";
import { loadDeps } from "@/lib/booking/runner";
import { parseBookingConfig, type BookingConfig } from "@/lib/booking/settings";
import { withClinic } from "@/lib/booking/clinic";
import { addDays, isFree, localDay } from "@/lib/booking/slots";
import type { ClinicSettings } from "@/lib/clinic/settings";

/** A chat quiet this long starts a new sitting: the per-chat reply cap counts again. */
export const SESSION_GAP_HOURS = 12;
/** How far back "my appointments" looks (missed and attended ones included). */
const OWN_HISTORY_DAYS = 30;

export interface AiInbound {
  accountId: string;
  conversationId: string;
  contactId: string;
  /** Empty for media-only messages. */
  text: string;
}

type Db = ReturnType<typeof supabaseAdmin>;

export async function dispatchInboundToAi(input: AiInbound): Promise<{ replied: boolean; handedOff: boolean }> {
  try {
    return await run(input);
  } catch (err) {
    console.error("[ai-chat] failed:", err);
    return { replied: false, handedOff: false };
  }
}

/** The account's assistant: provider settings and the system prompt for one contact. */
export interface PreparedAssistant {
  provider: AiProvider;
  model: string;
  /** Encrypted, as stored; decrypted only when calling the provider. */
  apiKey: string | null;
  baseUrl: string | null;
  autoReplyEnabled: boolean;
  maxReplies: number;
  handoffAgentId: string | null;
  system: string;
  bookingConfig: BookingConfig;
  customerName: string | null;
}

/** Load the account's AI settings and build the prompt; null when the assistant is off or has no key. */
export async function prepareAssistant(db: Db, accountId: string, contactId: string | null): Promise<PreparedAssistant | null> {
  const { data: cfg } = await db
    .from("ai_configs")
    .select("provider, model, api_key, system_prompt, is_active, auto_reply_enabled, auto_reply_max_per_conversation, handoff_agent_id")
    .eq("account_id", accountId)
    .maybeSingle();
  if (!cfg?.is_active || !isAiProvider(cfg.provider)) return null;
  // Hosted providers need a key; a local Ollama server doesn't.
  if (!cfg.api_key && PROVIDERS[cfg.provider].needsKey) return null;
  // Separate read: before migration 065 the column doesn't exist, and a
  // failed select must not switch the assistant off.
  const { data: server } = await db.from("ai_configs").select("base_url").eq("account_id", accountId).maybeSingle();

  const facts = await clinicFacts(db, accountId, cfg.system_prompt as string | null);
  const bookingConfig = await aiBookingConfig(db, accountId, facts.clinic);
  let customerName: string | null = null;
  if (contactId) {
    const { data: contact } = await db.from("contacts").select("name").eq("id", contactId).eq("account_id", accountId).maybeSingle();
    customerName = (contact?.name as string | null)?.trim() || null;
  }
  const system = buildSystemPrompt({
    ...facts,
    // "Today" in the business's own zone: the server runs in UTC, and in
    // India the two disagree from midnight to 05:30.
    today: new Intl.DateTimeFormat("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: bookingConfig.timezone,
    }).format(new Date()),
    booking: {
      todayIso: localDay(new Date(), bookingConfig.timezone),
      timezone: bookingConfig.timezone,
      daysAhead: bookingConfig.daysAhead,
      customerName,
    },
  });
  return {
    provider: cfg.provider,
    model: cfg.model as string,
    apiKey: (cfg.api_key as string | null) ?? null,
    baseUrl: (server?.base_url as string | null | undefined) ?? null,
    autoReplyEnabled: !!cfg.auto_reply_enabled,
    maxReplies: (cfg.auto_reply_max_per_conversation as number | null) ?? 3,
    handoffAgentId: (cfg.handoff_agent_id as string | null) ?? null,
    system,
    bookingConfig,
    customerName,
  };
}

/** The provider call for a prepared assistant. */
export function askFor(a: PreparedAssistant): (turns: ChatTurn[]) => Promise<string> {
  return (turns) =>
    complete({
      provider: a.provider,
      model: a.model,
      apiKey: a.apiKey ? decrypt(a.apiKey) : "",
      baseUrl: a.baseUrl,
      system: a.system,
      turns,
    });
}

/**
 * The actions for one contact. Booking deps load on the first action only
 * (most messages are plain questions). `dryRun` (the test chat) reads
 * real free times and the contact's real appointments but never books,
 * cancels or moves anything; with no contact, "my appointments" is empty.
 */
export function toolRunner(
  db: Db,
  {
    accountId,
    contactId,
    bookingConfig,
    customerName,
    dryRun = false,
  }: { accountId: string; contactId: string | null; bookingConfig: BookingConfig; customerName: string | null; dryRun?: boolean },
): (call: ToolCall) => Promise<ToolResult> {
  let deps: AiDeps | null = null;
  return async (call) => {
    if (!deps) {
      // loadDeps reads the contact's name only; a missing contact is fine.
      const base = await loadDeps({ accountId, contactId: contactId ?? "00000000-0000-0000-0000-000000000000" }, bookingConfig);
      const real = contactId ? ownBookings(db, accountId, contactId, base) : emptyBookings;
      deps = dryRun
        ? { ...base, book: async () => "ok", own: { list: real.list, cancel: async () => "ok", move: async () => "ok" } }
        : { ...base, own: real };
    }
    const result = await runTool(deps, call);
    if (!dryRun && contactId && call.tool === "book" && result.ok && call.name && !customerName) {
      // Like the booking assistant: fill in a missing contact name, never overwrite one.
      await db
        .from("contacts")
        .update({ name: call.name })
        .eq("id", contactId)
        .eq("account_id", accountId)
        .or("name.is.null,name.eq.");
    }
    return result;
  };
}

const emptyBookings: CustomerBookings = { list: async () => [], cancel: async () => "gone", move: async () => "gone" };

/** The contact's own appointments; every query filters by account AND contact. */
function ownBookings(db: Db, accountId: string, contactId: string, deps: Pick<AiDeps, "busy">): CustomerBookings {
  const active = ["scheduled", "confirmed"];
  return {
    list: async () => {
      const since = new Date(Date.now() - OWN_HISTORY_DAYS * 86_400_000).toISOString();
      const { data, error } = await db
        .from("appointments")
        .select("id, service, doctor_id, branch_id, starts_at, ends_at, status")
        .eq("account_id", accountId)
        .eq("contact_id", contactId)
        .gte("starts_at", since)
        .order("starts_at", { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as OwnAppointment[];
    },
    cancel: async (id) => {
      const { data, error } = await db
        .from("appointments")
        .update({ status: "cancelled" })
        .eq("id", id)
        .eq("account_id", accountId)
        .eq("contact_id", contactId)
        .in("status", active)
        .gt("starts_at", new Date().toISOString())
        .select("id");
      if (error) throw error;
      return data?.length ? "ok" : "gone";
    },
    move: async (id, to) => {
      // Re-check right before saving, ignoring the booking being moved.
      const around = new Date(to.startsAt.getTime() - 4 * 3_600_000);
      const after = new Date(to.endsAt.getTime() + 4 * 3_600_000);
      const others = (await deps.busy(around, after)).filter((b) => b.id !== id);
      if (to.doctorId && !isFree(to.doctorId, to.startsAt, to.endsAt, others, to.bufferMin)) return "taken";
      const { data, error } = await db
        .from("appointments")
        .update({
          starts_at: to.startsAt.toISOString(),
          ends_at: to.endsAt.toISOString(),
          doctor_id: to.doctorId,
          branch_id: to.branchId,
        })
        .eq("id", id)
        .eq("account_id", accountId)
        .eq("contact_id", contactId)
        .in("status", active)
        .gt("starts_at", new Date().toISOString())
        .select("id");
      if (error) throw error;
      return data?.length ? "ok" : "gone";
    },
  };
}

async function run({ accountId, conversationId, contactId, text }: AiInbound) {
  const db = supabaseAdmin();
  const none = { replied: false, handedOff: false };

  const assistant = await prepareAssistant(db, accountId, contactId);
  if (!assistant) return none;

  const { data: conv, error: convError } = await db
    .from("conversations")
    .select("ai_mode, assigned_agent_id")
    .eq("id", conversationId)
    .eq("account_id", accountId)
    .maybeSingle();
  // Missing column (061 not run) → no per-chat switch exists yet; stay quiet.
  if (convError || !conv) return none;
  if (effectiveMode(conv.ai_mode as string | null, assistant.autoReplyEnabled) !== "bot") return none;

  const handoff = (reason: string) =>
    handOff(db, {
      accountId,
      conversationId,
      contactId,
      reason,
      agentId: assistant.handoffAgentId ?? (conv.assigned_agent_id as string | null),
    });

  if (!text.trim()) return handoff("They sent an attachment.");

  // The customer's own "/clear" (or /new, /restart, /reset): start over,
  // exactly like the inbox's Start new. Before migration 071 the update
  // fails and the message is answered like any other.
  if (isResetCommand(text)) {
    const { error } = await db
      .from("conversations")
      .update({ ai_context_since: new Date().toISOString(), ai_reply_count: 0, ai_handoff_summary: null })
      .eq("id", conversationId)
      .eq("account_id", accountId);
    if (!error) {
      await sendAsBot(db, accountId, conversationId, RESET_REPLY);
      return { replied: true, handedOff: false };
    }
  }

  await resetCapAfterQuiet(db, accountId, conversationId);
  const { data: claimed } = await db.rpc("claim_ai_reply_slot", {
    conversation_id: conversationId,
    max_replies: assistant.maxReplies,
  });
  if (claimed !== true) return handoff("The assistant reached its reply limit for this chat.");

  let decision;
  try {
    // "Start new" (migration 071): only what was said after it. Separate
    // read so a database without the column keeps working as before.
    const { data: reset } = await db
      .from("conversations")
      .select("ai_context_since")
      .eq("id", conversationId)
      .eq("account_id", accountId)
      .maybeSingle();
    const since = (reset?.ai_context_since as string | null | undefined) ?? null;
    let history = db
      .from("messages")
      .select("sender_type, content_text, created_at")
      .eq("conversation_id", conversationId);
    if (since) history = history.gt("created_at", since);
    const { data: recent } = await history.order("created_at", { ascending: false }).limit(20);
    const turns = toTurns(((recent ?? []) as { sender_type: string; content_text: string | null }[]).reverse());
    if (!turns.length) turns.push({ role: "user", content: text });
    ({ decision } = await converse({
      ask: askFor(assistant),
      turns,
      run: toolRunner(db, { accountId, contactId, bookingConfig: assistant.bookingConfig, customerName: assistant.customerName }),
    }));
  } catch (err) {
    console.error("[ai-chat] model call failed:", err);
    return handoff("The assistant couldn't reach the AI provider.");
  }

  if (decision.handoff) return handoff(decision.reason);
  await sendAsBot(db, accountId, conversationId, decision.reply);
  return { replied: true, handedOff: false };
}

/**
 * Start the reply count again when the assistant hasn't replied in this
 * chat for SESSION_GAP_HOURS: the cap is a guard against a runaway
 * conversation, not a lifetime allowance.
 */
async function resetCapAfterQuiet(db: Db, accountId: string, conversationId: string) {
  const { data: last } = await db
    .from("messages")
    .select("created_at")
    .eq("conversation_id", conversationId)
    .eq("ai_generated", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastAt = last?.created_at ? Date.parse(last.created_at as string) : 0;
  if (Date.now() - lastAt < SESSION_GAP_HOURS * 3_600_000) return;
  await db.from("conversations").update({ ai_reply_count: 0 }).eq("id", conversationId).eq("account_id", accountId);
}

/**
 * The booking window for the AI: the booking assistant's settings (time
 * zone, days ahead, notice, slot gap — defaults when never saved), but
 * the business's own opening hours, holidays and closed dates from
 * Settings → Business. Read whether or not the booking bot is enabled:
 * the AI books on its own. Scoped by account_id (service-role client).
 */
async function aiBookingConfig(db: Db, accountId: string, clinic: ClinicSettings): Promise<BookingConfig> {
  const { data, error } = await db.from("booking_settings").select("config").eq("account_id", accountId).maybeSingle();
  const base = parseBookingConfig(error ? null : data?.config);
  const today = localDay(new Date(), base.timezone);
  const days = Array.from({ length: base.daysAhead + 1 }, (_, i) => addDays(today, i));
  return withClinic({ ...base, hours: clinic.hours }, clinic, days);
}

/** Everything the model may answer from, all scoped to the account. */
async function clinicFacts(db: Db, accountId: string, instructions: string | null) {
  const [branding, vocab, clinic, services, doctors] = await Promise.all([
    db.from("app_branding").select("title").eq("id", 1).maybeSingle(),
    // Separate read: before migration 064 the column doesn't exist, and a
    // failed select must not lose the business name above.
    db.from("app_branding").select("vocabulary").eq("id", 1).maybeSingle(),
    db.from("clinic_settings").select("config").eq("account_id", accountId).maybeSingle(),
    db.from("services").select("name, duration_min, is_active").eq("account_id", accountId).is("deleted_at", null),
    db.from("doctors").select("name, is_active, branch:branches(name)").eq("account_id", accountId).is("deleted_at", null),
  ]);
  type Svc = { name: string; duration_min: number | null; is_active: boolean | null };
  type Doc = { name: string; is_active: boolean | null; branch: { name: string } | { name: string }[] | null };
  return {
    clinicName: (branding.data?.title as string | null) || "our business",
    terms: resolveTerms(parseVocabulary(vocab.error ? null : vocab.data?.vocabulary), "en"),
    clinic: parseClinicSettings(clinic.data?.config),
    services: ((services.data ?? []) as Svc[])
      .filter((s) => s.is_active !== false)
      .map((s) => ({ name: s.name, minutes: Number(s.duration_min) || 30 })),
    doctors: ((doctors.data ?? []) as Doc[])
      .filter((d) => d.is_active !== false)
      .map((d) => ({ name: d.name, branch: Array.isArray(d.branch) ? d.branch[0]?.name : d.branch?.name })),
    instructions,
  };
}

/** Send `text` and mark it as the bot's (the inbox shows the AI badge). */
async function sendAsBot(db: Db, accountId: string, conversationId: string, text: string) {
  const sent = await sendMessageToConversation(db, accountId, { conversationId, messageType: "text", contentText: text });
  await db.from("messages").update({ ai_generated: true, sender_type: "bot" }).eq("id", sent.messageId);
}

async function handOff(
  db: Db,
  {
    accountId,
    conversationId,
    contactId,
    reason,
    agentId,
  }: { accountId: string; conversationId: string; contactId: string; reason: string; agentId: string | null },
) {
  const patch: Record<string, unknown> = { ai_mode: "human", ai_handoff_summary: reason };
  if (agentId) patch.assigned_agent_id = agentId;
  await db.from("conversations").update(patch).eq("id", conversationId).eq("account_id", accountId);

  // Tell the customer — always the same fixed message. Best effort: a
  // closed 24 h window or a bad number must not stop the handoff itself.
  await sendAsBot(db, accountId, conversationId, DEFAULT_HANDOFF_REPLY).catch((err) =>
    console.error("[ai-chat] handoff message failed:", err),
  );

  if (agentId) {
    await db.from("notifications").insert({
      account_id: accountId,
      user_id: agentId,
      type: "conversation_assigned",
      conversation_id: conversationId,
      contact_id: contactId,
      actor_user_id: null,
      title: "The AI assistant handed a chat to you",
      body: reason,
    });
  }
  return { replied: true, handedOff: true };
}
