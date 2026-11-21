import { NextResponse } from 'next/server'
import { toErrorResponse } from '@/lib/auth/account'
import { requirePermission } from '@/lib/auth/permission-guard'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { askFor, prepareAssistant, toolRunner } from '@/lib/ai-chat/runner'
import { converse } from '@/lib/ai-chat/conversation'
import type { ChatTurn } from '@/lib/ai-chat/model'
import { AiProviderError } from '@/lib/ai-chat/provider'

// ============================================================
// POST /api/ai/test-chat — try the WhatsApp AI assistant without WhatsApp.
//
// Runs the SAME prompt, model and actions as a real inbound message
// (lib/ai-chat/runner.ts → conversation.ts), but as a dry run: free
// times and the chosen contact's appointments are read for real, while
// book / cancel / reschedule only report what they would do. Nothing is
// sent and nothing is saved, so staff (and automated checks) can test
// booking, look-ups, cancelling and rescheduling in any language safely.
//
// Body: { messages: [{ role: 'user' | 'assistant', content }], contact_id? }
//   contact_id — act as this contact (must belong to the account), so
//                "my appointments" shows theirs. Omitted: a new customer.
// Returns: { reply, handoff, reason, steps: [{ action, args, result }] }
//
// Gated on ai-assistant edit (it spends the account's AI quota) and rate
// limited per user. The provider key is decrypted on the server only.
// ============================================================

const MAX_MESSAGES = 30
const MAX_CHARS = 2000

export async function POST(request: Request) {
  try {
    const ctx = await requirePermission('ai-assistant', 'edit')
    const limited = checkRateLimit(`ai-test-chat:${ctx.userId}`, { limit: 30, windowMs: 60_000 })
    if (!limited.success) return rateLimitResponse(limited)

    const body = (await request.json().catch(() => null)) as { messages?: unknown; contact_id?: unknown } | null
    const raw = Array.isArray(body?.messages) ? body.messages : []
    const turns: ChatTurn[] = []
    for (const m of raw.slice(-MAX_MESSAGES)) {
      const role = (m as { role?: unknown })?.role
      const content = (m as { content?: unknown })?.content
      if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || !content.trim()) continue
      const text = content.trim().slice(0, MAX_CHARS)
      const last = turns[turns.length - 1]
      if (last?.role === role) last.content += `\n${text}`
      else turns.push({ role, content: text })
    }
    while (turns.length && turns[0].role !== 'user') turns.shift()
    if (!turns.length || turns[turns.length - 1].role !== 'user') {
      return NextResponse.json({ error: 'End with a customer message' }, { status: 400 })
    }

    const db = supabaseAdmin()
    let contactId: string | null = null
    if (typeof body?.contact_id === 'string' && body.contact_id) {
      // Must be this account's contact: the admin client has no RLS.
      const { data } = await db.from('contacts').select('id').eq('id', body.contact_id).eq('account_id', ctx.accountId).maybeSingle()
      if (!data) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
      contactId = data.id as string
    }

    const assistant = await prepareAssistant(db, ctx.accountId, contactId)
    if (!assistant) {
      return NextResponse.json({ error: 'Turn the AI assistant on and save a key first' }, { status: 409 })
    }
    const { decision, steps } = await converse({
      ask: askFor(assistant),
      turns,
      run: toolRunner(db, {
        accountId: ctx.accountId,
        contactId,
        bookingConfig: assistant.bookingConfig,
        customerName: assistant.customerName,
        dryRun: true,
      }),
    })
    return NextResponse.json({
      reply: decision.reply,
      handoff: decision.handoff,
      reason: decision.handoff ? decision.reason : '',
      steps: steps.map(({ call, result }) => {
        const { tool, ...args } = call
        return { action: tool, args: Object.fromEntries(Object.entries(args).filter(([, v]) => v)), result }
      }),
    })
  } catch (err) {
    // The provider refused (rate or daily limit, bad key…): say so plainly
    // instead of a bare 500. On WhatsApp the same failure hands the chat
    // to staff with the fixed message.
    if (err instanceof AiProviderError) {
      return NextResponse.json({ error: `The AI provider couldn't answer: ${err.message}` }, { status: 503 })
    }
    return toErrorResponse(err)
  }
}
