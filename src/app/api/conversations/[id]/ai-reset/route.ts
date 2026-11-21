import { NextResponse } from 'next/server'
import { toErrorResponse } from '@/lib/auth/account'
import { requirePermission } from '@/lib/auth/permission-guard'
import { supabaseAdmin } from '@/lib/automations/admin-client'

// POST /api/conversations/:id/ai-reset — "Start new" for one chat.
//
// The AI assistant forgets the conversation so far: from now on it reads
// only messages sent after this moment (conversations.ai_context_since,
// migration 071; lib/ai-chat/runner.ts), and its per-chat reply count and
// last handoff note restart. Nothing is deleted — staff still see the whole
// thread — and appointments are untouched (the AI can still look them up
// when the customer asks).
//
// Edit on `ai-assistant`, like the Human / Bot switch. Service role, so
// the chat is matched on id AND the caller's account.

type Params = { params: Promise<{ id: string }> }

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params
  let ctx
  try {
    ctx = await requirePermission('ai-assistant', 'edit')
  } catch (err) {
    return toErrorResponse(err)
  }
  const { data, error } = await supabaseAdmin()
    .from('conversations')
    .update({ ai_context_since: new Date().toISOString(), ai_reply_count: 0, ai_handoff_summary: null })
    .eq('id', id)
    .eq('account_id', ctx.accountId)
    .select('id, ai_context_since')
    .maybeSingle()
  if (error) {
    // 42703 / PGRST204: the column isn't there yet.
    if (error.code === '42703' || error.code === 'PGRST204' || /ai_context_since/.test(error.message)) {
      return NextResponse.json(
        { error: 'Run migration 071_ai_context_reset.sql in Supabase to use Start new.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ai_context_since: data.ai_context_since })
}
