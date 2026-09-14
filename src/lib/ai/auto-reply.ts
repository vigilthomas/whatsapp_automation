import { supabaseAdmin } from './admin-client';
import { loadAiConfig } from './config';
import { buildConversationContext } from './context';
import { retrieveKnowledge } from './knowledge';
import { generateReply } from './generate';
import { buildSystemPrompt } from './defaults';
import { buildHandoffSummary } from './handoff';
import { logAiUsage } from './usage';
import type { AiUsage } from './types';
import { latestUserMessage } from './query';
import { engineSendText, engineTypingKeepalive } from '@/lib/flows/meta-send';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
// Clinic AI gateway imports
import {
  resolveClinicFromPhoneNumberId,
  loadClinicAiConfig,
  loadClinicInfo,
  loadClinicServices,
} from './clinic-config';
import { buildClinicSystemPrompt, languageLabel } from './clinic-prompt';
import { tryBasicReply } from './basic-reply';
import {
  extractAppointmentIntent,
  formatExtractionHint,
} from './local-extract';
import { generateWithTools } from './generate-with-tools';
import { filterAllowedTools, toToolDefinitions } from './tools/definitions';
import { checkClinicUsageLimit } from './usage-guard';

interface DispatchArgs {
  /** Tenancy key — drives config, contact, and whatsapp_config lookups. */
  accountId: string;
  conversationId: string;
  contactId: string;
  /** The account's WhatsApp config owner, used for the outbound send's
   *  audit columns (mirrors how the flow runner passes it through). */
  configOwnerUserId: string;
  /** Meta phone_number_id — used to resolve the clinic for the AI
   *  gateway. When set and a clinic is found, the tool-calling path
   *  runs; otherwise the existing BYO-key path is used. */
  phoneNumberId?: string;
  /** Meta id of the inbound message — enables the "typing…" indicator
   *  while the model works. Optional: no id, no indicator. */
  inboundMessageId?: string;
}

/** Start the typing indicator if we have an inbound id; always returns a stop(). */
function startTyping(accountId: string, inboundMessageId?: string): () => void {
  if (!inboundMessageId) return () => {};
  return engineTypingKeepalive({ accountId, inboundMessageId }).stop;
}

/**
 * AI auto-reply for a freshly-arrived inbound message.
 *
 * Invoked from the WhatsApp webhook's `after()` block, only when no
 * deterministic flow consumed the message (flows win). Mirrors the flow
 * runner's contract: it owns its try/catch and NEVER throws — a failing
 * or slow LLM call must not affect the webhook's 200 to Meta.
 *
 * Eligibility gates (any → silent no-op):
 *   - AI off / auto-reply disabled for the account
 *   - a human agent is assigned (they own the thread)
 *   - auto-reply was disabled for this conversation (prior handoff)
 *   - the per-conversation reply cap is reached
 *   - there's nothing to reply to
 *
 * The 24h WhatsApp session window is inherently open here — we're
 * reacting to a customer message that just landed — so no separate
 * window check is needed.
 */
export async function dispatchInboundToAiReply(
  args: DispatchArgs
): Promise<void> {
  const {
    accountId,
    conversationId,
    contactId,
    configOwnerUserId,
    phoneNumberId,
    inboundMessageId,
  } = args;

  try {
    const db = supabaseAdmin();

    // ── Clinic AI gateway path ──────────────────────────────
    // When the inbound arrived on a phone number bound to a clinic
    // with an active AI config, use the tool-calling receptionist.
    if (phoneNumberId) {
      const clinicRef = await resolveClinicFromPhoneNumberId(db, phoneNumberId);
      if (clinicRef) {
        const clinicConfig = await loadClinicAiConfig(db, clinicRef.clinicId);
        if (clinicConfig) {
          await dispatchClinicAiReply({
            db,
            clinicConfig,
            accountId,
            conversationId,
            contactId,
            configOwnerUserId,
            inboundMessageId,
          });
          return; // Clinic AI handled it — don't fall through.
        }
      }
    }

    // ── Existing BYO-key path (unchanged) ────────────────────

    const config = await loadAiConfig(db, accountId);
    if (!config || !config.autoReplyEnabled) return;

    // Deterministic, user-configured responders win over the LLM — the
    // caller already excludes messages a Flow consumed. Message-level
    // automations (`new_message_received` / `keyword_match`) are
    // dispatched independently for this same inbound and may send their
    // own reply, so if the account has any active one we stand down to
    // avoid double-texting the customer. (Relationship triggers like
    // `first_inbound_message` don't count — they're not per-message
    // auto-responders.)
    const { data: autoResponders } = await db
      .from('automations')
      .select('id')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .in('trigger_type', ['new_message_received', 'keyword_match'])
      .limit(1);
    if (autoResponders && autoResponders.length > 0) return;

    const { data: conv, error: convErr } = await db
      .from('conversations')
      .select('assigned_agent_id, ai_autoreply_disabled, ai_reply_count')
      .eq('id', conversationId)
      .maybeSingle();
    if (convErr || !conv) return;
    if (conv.assigned_agent_id) return; // a human owns this thread
    if (conv.ai_autoreply_disabled) return; // handed off / turned off here
    // Cheap early-out; the authoritative cap check is the atomic claim
    // below (this read can race a concurrent inbound).
    if (conv.ai_reply_count >= config.autoReplyMaxPerConversation) return;

    const messages = await buildConversationContext(db, conversationId);
    if (messages.length === 0) return;

    // Account-wide throttle on the shared BYO key. The per-conversation
    // cap bounds one thread; this bounds a burst across many threads (a
    // marketing blast landing 200 replies at once) so we never run the
    // owner's key past the provider's rate limit. Over the limit → skip
    // the auto-reply; the inbound still sits in the inbox for a human.
    const acctLimit = checkRateLimit(
      `ai-autoreply:${accountId}`,
      RATE_LIMITS.aiAutoReplyAccount
    );
    if (!acctLimit.success) {
      console.warn(
        `[ai auto-reply] account ${accountId} hit the per-account rate limit — skipping this inbound.`
      );
      return;
    }

    // All gates passed — the customer is going to get a bot reply, so
    // show "typing…" while the model works (cosmetic, never throws).
    const stopTyping = startTyping(accountId, inboundMessageId);

    let text: string;
    let handoff: boolean;
    let usage: AiUsage | null;
    try {
      // Ground the reply in the account's knowledge base (best-effort).
      const knowledge = await retrieveKnowledge(
        db,
        accountId,
        config,
        latestUserMessage(messages)
      );

      const systemPrompt = buildSystemPrompt({
        userPrompt: config.systemPrompt,
        mode: 'auto_reply',
        knowledge,
      });

      ({ text, handoff, usage } = await generateReply({
        config,
        systemPrompt,
        messages,
      }));
    } finally {
      stopTyping();
    }

    // Record token spend on the account's BYO key. Fire-and-forget so it
    // never adds latency to the customer-facing send: `logAiUsage`
    // swallows its own errors, so the floating promise can't reject.
    // Logged regardless of handoff — the provider call happened either
    // way.
    void logAiUsage(db, {
      accountId,
      conversationId,
      mode: 'auto_reply',
      provider: config.provider,
      model: config.model,
      usage,
    });

    if (handoff || !text) {
      // The model can't (or shouldn't) answer — stop auto-replying on
      // this thread and hand it to a human. We (a) pause the bot here
      // (sticky until re-enabled), (b) route the conversation to the
      // configured handoff agent — null leaves it in the shared queue —
      // and (c) leave a short internal note so whoever picks it up has
      // context. Assigning fires the `on_conversation_assigned` trigger,
      // which notifies the agent.
      const summary = buildHandoffSummary({
        messages,
        replyCount: conv.ai_reply_count ?? 0,
      });
      const update: Record<string, unknown> = {
        ai_autoreply_disabled: true,
        ai_handoff_summary: summary,
      };
      // Only set the assignee when a target is configured AND the thread
      // isn't already owned — never stomp an existing human assignment.
      if (config.handoffAgentId && !conv.assigned_agent_id) {
        update.assigned_agent_id = config.handoffAgentId;
      }
      await db.from('conversations').update(update).eq('id', conversationId);
      return;
    }

    // Atomically claim a reply slot: the cap check + increment happen in
    // one UPDATE, so concurrent inbounds can never overshoot the cap. If
    // another inbound just took the last slot, `claimed` is false and we
    // skip the send. (We consume a slot slightly before the send lands —
    // fail-safe: under-reply rather than over-reply.)
    const { data: claimed, error: claimErr } = await db.rpc(
      'claim_ai_reply_slot',
      {
        conversation_id: conversationId,
        max_replies: config.autoReplyMaxPerConversation,
      }
    );
    if (claimErr) {
      // A real error here (vs. losing the cap race) is almost always a
      // deploy issue — e.g. `claim_ai_reply_slot` not EXECUTE-able by the
      // service role, or the migration not applied. Log it loudly: a
      // silent return makes "auto-reply never fires" undiagnosable.
      console.error('[ai auto-reply] claim_ai_reply_slot failed:', claimErr);
      return;
    }
    if (claimed !== true) return; // lost the per-conversation cap race

    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      text,
      aiGenerated: true,
    });
  } catch (err) {
    console.error('[ai auto-reply] dispatch failed:', err);
  }
}

// ============================================================
// Clinic AI gateway — tool-calling receptionist path.
//
// Separated into its own function for clarity. Runs when a clinic
// has been resolved from the inbound phone number and has an active
// clinic_ai_configs row. Uses NVIDIA NIM (or compatible) with tool
// calling for appointment management.
// ============================================================

interface ClinicDispatchArgs {
  db: ReturnType<typeof supabaseAdmin>;
  clinicConfig: NonNullable<Awaited<ReturnType<typeof loadClinicAiConfig>>>;
  accountId: string;
  conversationId: string;
  contactId: string;
  configOwnerUserId: string;
  inboundMessageId?: string;
}

async function dispatchClinicAiReply(args: ClinicDispatchArgs): Promise<void> {
  const {
    db,
    clinicConfig,
    accountId,
    conversationId,
    contactId,
    configOwnerUserId,
    inboundMessageId,
  } = args;

  // ── Conversation eligibility gates (same logic as BYO path) ──
  const { data: conv, error: convErr } = await db
    .from('conversations')
    .select('assigned_agent_id, ai_autoreply_disabled, ai_reply_count')
    .eq('id', conversationId)
    .maybeSingle();
  if (convErr || !conv) return;
  if (conv.assigned_agent_id) return;
  if (conv.ai_autoreply_disabled) return;

  const messages = await buildConversationContext(db, conversationId);
  if (messages.length === 0) return;

  // ── Usage guard ──
  const usageCheck = await checkClinicUsageLimit(
    db,
    clinicConfig.clinicId,
    clinicConfig
  );
  if (!usageCheck.allowed) {
    console.warn(
      `[clinic ai] clinic ${clinicConfig.clinicId} hit usage limit: ${usageCheck.reason}`
    );
    // Hand off to a human rather than silently ignoring.
    const update: Record<string, unknown> = {
      ai_autoreply_disabled: true,
      ai_handoff_summary: `🤖 AI monthly limit reached: ${usageCheck.reason}`,
    };
    if (clinicConfig.handoffAgentId && !conv.assigned_agent_id) {
      update.assigned_agent_id = clinicConfig.handoffAgentId;
    }
    await db.from('conversations').update(update).eq('id', conversationId);
    return;
  }

  // ── Load context for the system prompt ──
  const clinic = await loadClinicInfo(db, clinicConfig.clinicId);
  if (!clinic) return;

  const { data: contact } = await db
    .from('contacts')
    .select('name, phone')
    .eq('id', contactId)
    .maybeSingle();
  const patient = { name: contact?.name ?? null, phone: contact?.phone ?? '' };

  // Gates passed — show "typing…" until we send (or bail out).
  const stopTyping = startTyping(accountId, inboundMessageId);
  try {
    // ── Fast path: small talk → local model ──
    // Greetings / thanks / acks don't need tools or the full clinic
    // context; answer them from a local Ollama model in ~2s instead of
    // waiting on NIM. Returns null when the flag is off, the message
    // isn't small talk, or Ollama fails — then we continue as normal.
    const basic = await tryBasicReply({
      db,
      accountId,
      conversationId,
      contactId,
      clinicId: clinicConfig.clinicId,
      clinicName: clinic.name,
      patientName: patient.name,
      language: languageLabel(clinicConfig.language),
      messages,
    });
    if (basic) {
      await engineSendText({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        text: basic.text,
        aiGenerated: true,
      });
      return;
    }

    // ── Local pre-extraction (optional) ──
    // Not small talk, so this is going to the primary model. Kick off
    // the local intent/entity parser in parallel with the DB lookups
    // below; its result becomes a hint in the system prompt.
    const extractionPromise = extractAppointmentIntent(messages);

    const services = await loadClinicServices(db, accountId);

    // Recent appointments for the patient at this clinic.
    const { data: recentAppts } = await db
      .from('appointments')
      .select('starts_at, service, status, doctor:doctors(name)')
      .eq('contact_id', contactId)
      .eq('clinic_id', clinicConfig.clinicId)
      .gte(
        'starts_at',
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      )
      .order('starts_at', { ascending: false })
      .limit(3);

    const recentAppointments = (recentAppts ?? []).map((a) => ({
      starts_at: a.starts_at as string,
      service: a.service as string,
      doctor_name: (a.doctor as { name: string }[] | null)?.[0]?.name ?? null,
      status: a.status as string,
    }));

    // ── Filter tools by clinic permissions ──
    const allowedTools = filterAllowedTools({
      allow_booking: clinicConfig.allowBooking,
      allow_rescheduling: clinicConfig.allowRescheduling,
      allow_cancellation: clinicConfig.allowCancellation,
      allow_patient_creation: clinicConfig.allowPatientCreation,
    });

    const systemPrompt = buildClinicSystemPrompt({
      config: clinicConfig,
      clinic,
      patient,
      services,
      recentAppointments,
      availableToolNames: allowedTools.map((t) => t.function.name),
      extractionHint: formatExtractionHint(await extractionPromise),
    });

    // ── Generate with tool calling ──
    const { text, handoff, usage, toolCalls } = await generateWithTools({
      provider: clinicConfig.provider,
      model: clinicConfig.model,
      systemPrompt,
      messages,
      tools: toToolDefinitions(allowedTools),
      clinicContext: {
        accountId,
        clinicId: clinicConfig.clinicId,
        patientId: contactId,
        conversationId,
      },
      db,
    });

    // ── Log usage ──
    const requestType = toolCalls.length > 0 ? 'tool_call' : 'chat';
    void logAiUsage(db, {
      accountId,
      conversationId,
      mode: 'auto_reply',
      provider: clinicConfig.provider,
      model: clinicConfig.model,
      usage,
      clinicId: clinicConfig.clinicId,
      patientId: contactId,
      requestType,
    });

    // ── Handoff ──
    if (handoff || !text) {
      const summary = buildHandoffSummary({
        messages,
        replyCount: conv.ai_reply_count ?? 0,
      });
      const update: Record<string, unknown> = {
        ai_autoreply_disabled: true,
        ai_handoff_summary: summary,
      };
      if (clinicConfig.handoffAgentId && !conv.assigned_agent_id) {
        update.assigned_agent_id = clinicConfig.handoffAgentId;
      }
      await db.from('conversations').update(update).eq('id', conversationId);
      return;
    }

    // ── Send the reply ──
    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      text,
      aiGenerated: true,
    });
  } finally {
    stopTyping();
  }
}
