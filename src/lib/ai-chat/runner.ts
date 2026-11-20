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
//   3. a reply slot is free (claim_ai_reply_slot, 029 — atomic cap)
// Then the model answers from the clinic's facts (model.ts). If it can't,
// or anything fails, the chat is handed to staff: switched to Human,
// assigned to the handoff agent, the agent notified, and the patient told
// someone will reply. A failure never leaves the patient unanswered by
// the bot *and* invisible to staff.
//
// Never throws.
// ============================================================

import { supabaseAdmin } from "@/lib/automations/admin-client";
import { decrypt } from "@/lib/whatsapp/encryption";
import { sendMessageToConversation } from "@/lib/whatsapp/send-message";
import { parseClinicSettings } from "@/lib/clinic/settings";
import { DEFAULT_HANDOFF_REPLY, buildSystemPrompt, effectiveMode, parseModelReply, toTurns } from "./model";
import { complete, isAiProvider } from "./provider";

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

async function run({ accountId, conversationId, contactId, text }: AiInbound) {
  const db = supabaseAdmin();
  const none = { replied: false, handedOff: false };

  const { data: cfg } = await db
    .from("ai_configs")
    .select("provider, model, api_key, system_prompt, is_active, auto_reply_enabled, auto_reply_max_per_conversation, handoff_agent_id")
    .eq("account_id", accountId)
    .maybeSingle();
  if (!cfg?.is_active || !cfg.api_key || !isAiProvider(cfg.provider)) return none;

  const { data: conv, error: convError } = await db
    .from("conversations")
    .select("ai_mode, assigned_agent_id")
    .eq("id", conversationId)
    .eq("account_id", accountId)
    .maybeSingle();
  // Missing column (061 not run) → no per-chat switch exists yet; stay quiet.
  if (convError || !conv) return none;
  if (effectiveMode(conv.ai_mode as string | null, !!cfg.auto_reply_enabled) !== "bot") return none;

  const handoff = (reason: string, reply = DEFAULT_HANDOFF_REPLY) =>
    handOff(db, { accountId, conversationId, contactId, reason, reply, agentId: (cfg.handoff_agent_id as string | null) ?? (conv.assigned_agent_id as string | null) });

  if (!text.trim()) return handoff("The patient sent an attachment.");

  const { data: claimed } = await db.rpc("claim_ai_reply_slot", {
    conversation_id: conversationId,
    max_replies: cfg.auto_reply_max_per_conversation ?? 3,
  });
  if (claimed !== true) return handoff("The assistant reached its reply limit for this chat.");

  let decision;
  try {
    const system = buildSystemPrompt(await clinicFacts(db, accountId, cfg.system_prompt as string | null));
    const { data: recent } = await db
      .from("messages")
      .select("sender_type, content_text, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(20);
    const turns = toTurns(((recent ?? []) as { sender_type: string; content_text: string | null }[]).reverse());
    if (!turns.length) turns.push({ role: "user", content: text });
    const raw = await complete({
      provider: cfg.provider,
      model: cfg.model as string,
      apiKey: decrypt(cfg.api_key as string),
      system,
      turns,
    });
    decision = parseModelReply(raw);
  } catch (err) {
    console.error("[ai-chat] model call failed:", err);
    return handoff("The assistant couldn't reach the AI provider.");
  }

  if (decision.handoff) return handoff(decision.reason, decision.reply);
  await sendAsBot(db, accountId, conversationId, decision.reply);
  return { replied: true, handedOff: false };
}

/** Everything the model may answer from, all scoped to the account. */
async function clinicFacts(db: Db, accountId: string, instructions: string | null) {
  const [branding, clinic, services, doctors] = await Promise.all([
    db.from("app_branding").select("title").eq("id", 1).maybeSingle(),
    db.from("clinic_settings").select("config").eq("account_id", accountId).maybeSingle(),
    db.from("services").select("name, duration_min, is_active").eq("account_id", accountId).is("deleted_at", null),
    db.from("doctors").select("name, is_active, branch:branches(name)").eq("account_id", accountId).is("deleted_at", null),
  ]);
  type Svc = { name: string; duration_min: number | null; is_active: boolean | null };
  type Doc = { name: string; is_active: boolean | null; branch: { name: string } | { name: string }[] | null };
  return {
    clinicName: (branding.data?.title as string | null) || "the clinic",
    clinic: parseClinicSettings(clinic.data?.config),
    services: ((services.data ?? []) as Svc[])
      .filter((s) => s.is_active !== false)
      .map((s) => ({ name: s.name, minutes: Number(s.duration_min) || 30 })),
    doctors: ((doctors.data ?? []) as Doc[])
      .filter((d) => d.is_active !== false)
      .map((d) => ({ name: d.name, branch: Array.isArray(d.branch) ? d.branch[0]?.name : d.branch?.name })),
    instructions,
    today: new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date()),
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
    reply,
    agentId,
  }: { accountId: string; conversationId: string; contactId: string; reason: string; reply: string; agentId: string | null },
) {
  const patch: Record<string, unknown> = { ai_mode: "human", ai_handoff_summary: reason };
  if (agentId) patch.assigned_agent_id = agentId;
  await db.from("conversations").update(patch).eq("id", conversationId).eq("account_id", accountId);

  // Tell the patient — best effort: a closed 24 h window or a bad number must not stop the handoff itself.
  await sendAsBot(db, accountId, conversationId, reply).catch((err) => console.error("[ai-chat] handoff message failed:", err));

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
