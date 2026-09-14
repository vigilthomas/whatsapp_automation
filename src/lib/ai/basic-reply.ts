// ============================================================
// "Basic reply" tier — route small talk to a fast local model.
//
// The clinic auto-reply path uses DeepSeek on NVIDIA NIM with tool
// calling. That model is strong but slow on the shared endpoint
// (20s+, sometimes overloaded). A large share of inbound WhatsApp
// messages need no tools at all — "hi", "thanks", "ok", "bye" — and
// making a patient wait half a minute for "You're welcome!" is a bad
// experience. This module answers those with a local Ollama model
// (gemma:2b ≈ 2s) and leaves everything else to the tool-calling path.
//
// Routing is an ALLOWLIST, not a denylist: a message goes local only
// when it matches a known small-talk shape. Anything ambiguous — a
// date, a number, a question about the clinic, a message in a script
// we don't pattern-match — goes to the full model. Better to be slow
// than to have a 2B model improvise appointment details.
//
// The one subtle case is acknowledgements ("yes", "ok", "sure"). Those
// are small talk after "Your appointment is confirmed 🎉" but are a
// *decision* after "Shall I book 10:00 with Dr. Rao?". We only route an
// ack locally when the bot's previous turn contained no question.
//
// Enable with AI_LOCAL_BASIC_REPLIES=true. Failures (Ollama down,
// timeout, empty reply) return null so the caller falls through to
// the normal path — the local tier can only make things faster, never
// break a reply.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChatMessage, AiUsage } from './types'
import { loadAiPersonaConfig } from './persona'
import { generateOllama, ollamaModel } from './providers/ollama'
import { logAiUsage } from './usage'

/** Feature flag. Off by default so existing deploys are unaffected. */
export function localBasicRepliesEnabled(): boolean {
  return process.env.AI_LOCAL_BASIC_REPLIES === 'true'
}

/** Per-call timeout for the local model. A local 2B model that takes
 *  longer than this is not saving anyone time. */
function localTimeoutMs(): number {
  const raw = Number(process.env.OLLAMA_TIMEOUT_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : 8_000
}

// Anything longer than this is a real request, not small talk.
const MAX_BASIC_CHARS = 60

// Word lists are intentionally short and literal. Each alternation is
// anchored to the whole (normalised) message, so "hi, can I book
// tomorrow" does NOT match "hi".
const GREETING =
  /^(hi+|hey+|hello+|helo|hai|yo|good ?(morning|afternoon|evening|night)|gm|namaste|namaskaram|salaam|salam|assalamu ?alaikum|vanakkam)( (there|sarah|team|doctor|dr|sir|madam|ma'?am))?$/
const THANKS =
  /^(ok(ay)? ?)?(thanks?|thank ?(you|u)|thx|ty|tysm|thanku|thankyou|nanni|nandri|shukriya|dhanyavaad)( (so much|a lot|very much|sarah|team))?$/
const FAREWELL =
  /^(bye+|good ?bye|see (you|ya|u)( (soon|later|tomorrow))?|take care|good ?night|gn|ttyl|cya|have a (nice|good|great) day)$/
// Acks are often chained ("ok great", "yes sure thanks") — allow up to
// three ack/thanks words in a row.
const ACK_WORD =
  '(ok(ay)?|k|kk|okk|fine|sure|alright|got it|noted|understood|cool|great|nice|perfect|super|good|yes|yeah|yep|yup|ya|no|nope|nah|hmm+|oh|thanks?|thank you)'
const ACK = new RegExp(`^${ACK_WORD}( ${ACK_WORD}){0,2}$`)
const ABOUT_BOT =
  /^(who (are|r) (you|u)|what('s| is) your name|are (you|u) (a )?(bot|robot|ai|human|real)|how (are|r) (you|u)( doing)?|is this (a )?(bot|ai))$/

// Emoji-only / punctuation-only messages (👍, 🙏, ❤️, "!!").
const SYMBOLS_ONLY = /^[\p{Extended_Pictographic}\p{Emoji_Component}\s.!?,~'"-]+$/u

/** Lowercase, strip emoji + trailing punctuation, collapse whitespace. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Component}]/gu, ' ')
    .replace(/[.!?,~'"“”‘’-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export type BasicKind = 'greeting' | 'thanks' | 'farewell' | 'ack' | 'about_bot' | 'symbols'

/**
 * Classify the latest inbound message. Returns the small-talk kind
 * when the message can safely be answered by the local model, or
 * null when it must go to the full tool-calling model.
 *
 * `messages` is the recent transcript (oldest → newest); only the
 * last user turn and the assistant turn before it are consulted.
 */
export function classifyBasicMessage(messages: ChatMessage[]): BasicKind | null {
  let lastUserIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserIdx = i
      break
    }
  }
  if (lastUserIdx === -1) return null

  const raw = messages[lastUserIdx].content.trim()
  if (!raw || raw.length > MAX_BASIC_CHARS) return null
  // Digits almost always mean a date, time, phone or count — escalate.
  if (/\d/.test(raw)) return null

  if (SYMBOLS_ONLY.test(raw)) return 'symbols'

  const text = normalise(raw)
  if (!text) return 'symbols'

  if (GREETING.test(text)) return 'greeting'
  if (THANKS.test(text)) return 'thanks'
  if (FAREWELL.test(text)) return 'farewell'
  if (ABOUT_BOT.test(text)) return 'about_bot'

  if (ACK.test(text)) {
    // "yes"/"ok" right after the bot asked something is an answer to
    // that question, not small talk. Let the tool model handle it.
    for (let i = lastUserIdx - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        if (messages[i].content.includes('?')) return null
        break
      }
    }
    return 'ack'
  }

  return null
}

/**
 * Compact system prompt for the local model: persona + boundaries +
 * an explicit instruction NOT to touch anything appointment-related.
 * The classifier should have kept those out, but a 2B model given a
 * loophole will happily invent a 10am slot, so we close it twice.
 */
export function buildBasicReplyPrompt(args: {
  clinicName: string
  patientName: string | null
  language: string
}): string {
  const persona = loadAiPersonaConfig()
  const who = args.patientName ? ` The patient's name is ${args.patientName}.` : ''
  return [
    `You are ${persona.name}, ${persona.role} for ${args.clinicName}. ${persona.persona}`,
    `Communicate in ${args.language}.${who}`,
    'You are replying to a short greeting, thank-you, acknowledgement or farewell on WhatsApp.',
    'Reply in ONE short, warm sentence. Output only the message text.',
    'Do NOT mention, offer, confirm, or ask about appointments, doctors, timings, prices, or availability.',
    'If the message seems to ask for anything beyond small talk, reply only: "Sure - please tell me a bit more about what you need and I will help."',
    persona.boundaries.join(' '),
  ].join(' ')
}

export interface BasicReplyArgs {
  db: SupabaseClient
  accountId: string
  conversationId: string
  contactId: string
  clinicId: string
  clinicName: string
  patientName: string | null
  /** Human-readable language label, e.g. "English". */
  language: string
  messages: ChatMessage[]
}

export interface BasicReplyResult {
  text: string
  kind: BasicKind
  usage: AiUsage | null
}

/**
 * Try to answer with the local model. Returns null (never throws) when
 * the flag is off, the message isn't basic, or Ollama fails — the
 * caller then continues with the full tool-calling path.
 */
export async function tryBasicReply(args: BasicReplyArgs): Promise<BasicReplyResult | null> {
  if (!localBasicRepliesEnabled()) return null

  const kind = classifyBasicMessage(args.messages)
  if (!kind) return null

  const model = ollamaModel()
  const systemPrompt = buildBasicReplyPrompt({
    clinicName: args.clinicName,
    patientName: args.patientName,
    language: args.language,
  })

  // Only the tail of the transcript — the local model needs a little
  // context for tone, not the whole conversation.
  const messages = args.messages.slice(-4)

  try {
    const t0 = Date.now()
    const { text, usage } = await generateOllama({
      apiKey: '',
      model,
      systemPrompt,
      messages,
      timeoutMs: localTimeoutMs(),
    })
    console.log(
      `[basic-reply] ${kind} via ${model} in ${Date.now() - t0}ms: ${text.slice(0, 80)}`,
    )

    void logAiUsage(args.db, {
      accountId: args.accountId,
      conversationId: args.conversationId,
      mode: 'auto_reply',
      provider: 'ollama',
      model,
      usage,
      clinicId: args.clinicId,
      patientId: args.contactId,
      requestType: 'chat',
    })

    return { text, kind, usage }
  } catch (err) {
    // Local tier is best-effort: log and fall through to NIM.
    console.warn(
      '[basic-reply] local model failed, falling back to primary:',
      err instanceof Error ? err.message : err,
    )
    return null
  }
}
