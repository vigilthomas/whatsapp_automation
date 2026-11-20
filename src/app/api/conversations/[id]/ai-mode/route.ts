import { NextResponse } from 'next/server'
import { toErrorResponse } from '@/lib/auth/account'
import { requirePermission } from '@/lib/auth/permission-guard'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { effectiveMode } from '@/lib/ai-chat/model'

// The inbox's Human / Bot switch for one chat (migration 061).
//
// GET   Read on `ai-assistant`: the chat's mode and whether the assistant
//       is set up at all (the switch explains itself when it isn't).
// PATCH Edit on `ai-assistant`: { mode: "bot" | "human" }. Switching to Bot
//       clears the last handoff note and restarts the per-chat reply cap.
//
// A role without the module never sees the switch and these routes refuse
// it: that's how Access control turns the feature off for a role.
// The service role is used, so the conversation is matched on id AND the
// caller's account_id.

type Params = { params: Promise<{ id: string }> }

async function aiState(accountId: string) {
  const { data } = await supabaseAdmin()
    .from('ai_configs')
    .select('is_active, auto_reply_enabled, api_key')
    .eq('account_id', accountId)
    .maybeSingle()
  return { ready: !!data?.is_active && !!data?.api_key, newChatsBot: !!data?.auto_reply_enabled }
}

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params
  try {
    const ctx = await requirePermission('ai-assistant', 'read')
    const { data, error } = await supabaseAdmin()
      .from('conversations')
      .select('ai_mode, ai_handoff_summary')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { ready, newChatsBot } = await aiState(ctx.accountId)
    return NextResponse.json({
      mode: effectiveMode(data.ai_mode as string | null, newChatsBot),
      ai_ready: ready,
      handoff_summary: data.ai_handoff_summary ?? null,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params
  let ctx
  try {
    ctx = await requirePermission('ai-assistant', 'edit')
  } catch (err) {
    return toErrorResponse(err)
  }
  const body = (await request.json().catch(() => null)) as { mode?: unknown } | null
  const mode = body?.mode
  if (mode !== 'bot' && mode !== 'human') {
    return NextResponse.json({ error: 'mode must be "bot" or "human"' }, { status: 400 })
  }
  const patch: Record<string, unknown> = { ai_mode: mode }
  if (mode === 'bot') {
    patch.ai_reply_count = 0
    patch.ai_handoff_summary = null
  }
  const { data, error } = await supabaseAdmin()
    .from('conversations')
    .update(patch)
    .eq('id', id)
    .eq('account_id', ctx.accountId)
    .select('ai_mode, ai_handoff_summary')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { ready } = await aiState(ctx.accountId)
  return NextResponse.json({ mode: data.ai_mode, ai_ready: ready, handoff_summary: data.ai_handoff_summary ?? null })
}
