import { NextResponse } from 'next/server'
import { ForbiddenError, toErrorResponse } from '@/lib/auth/account'
import { requirePermission } from '@/lib/auth/permission-guard'
import { canEditSettings } from '@/lib/auth/roles'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { encrypt } from '@/lib/whatsapp/encryption'
import { MAX_INSTRUCTIONS } from '@/lib/ai-chat/model'
import { DEFAULT_MODELS, PROVIDERS, checkBaseUrl, isAiProvider } from '@/lib/ai-chat/provider'

// Settings → AI assistant (ai_configs, migration 029/033).
//
// GET: Read on the `ai-assistant` module. The provider key is never sent
// back, only whether one is saved.
// PUT: Edit on `ai-assistant` AND an admin-class role (or the super admin).
// This holds a paid API key and decides what the clinic's patients are
// told, so a role that may only flip a chat's Human/Bot switch can't
// change it. The key is encrypted (AES-256-GCM, ENCRYPTION_KEY) before it's
// stored; leaving it blank keeps the saved one. Written with the service
// role, scoped to the caller's account.

const SELECT_BEFORE_065 =
  'provider, model, api_key, system_prompt, is_active, auto_reply_enabled, auto_reply_max_per_conversation, handoff_agent_id, updated_at'
// 065 adds base_url (Ollama's server address). Before it runs, reading the
// column fails the whole row, so fall back to the older column list.
const SELECT = `${SELECT_BEFORE_065}, base_url`
/** Postgres "undefined_column". */
const UNDEFINED_COLUMN = '42703'

type Row = {
  provider: string
  model: string
  api_key: string | null
  system_prompt: string | null
  is_active: boolean
  auto_reply_enabled: boolean
  auto_reply_max_per_conversation: number
  handoff_agent_id: string | null
  updated_at: string
  base_url?: string | null
}

function shape(row: Row | null) {
  return {
    configured: !!row,
    provider: row?.provider ?? 'anthropic',
    model: row?.model ?? DEFAULT_MODELS.anthropic,
    has_key: !!row?.api_key,
    base_url: row?.base_url ?? null,
    system_prompt: row?.system_prompt ?? '',
    is_active: !!row?.is_active,
    auto_reply_enabled: !!row?.auto_reply_enabled,
    max_replies: row?.auto_reply_max_per_conversation ?? 5,
    handoff_agent_id: row?.handoff_agent_id ?? null,
    updated_at: row?.updated_at ?? null,
  }
}

export async function GET() {
  try {
    const { supabase } = await requirePermission('ai-assistant', 'read')
    let { data, error } = await supabase.from('ai_configs').select(SELECT).maybeSingle()
    if (error?.code === UNDEFINED_COLUMN) {
      ;({ data, error } = await supabase.from('ai_configs').select(SELECT_BEFORE_065).maybeSingle())
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(shape(data as Row | null))
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PUT(request: Request) {
  let ctx
  try {
    ctx = await requirePermission('ai-assistant', 'edit')
    if (!ctx.superAdmin && !canEditSettings(ctx.role)) {
      throw new ForbiddenError('Only owners and admins can change the AI assistant settings')
    }
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const provider = body.provider
  if (!isAiProvider(provider)) return NextResponse.json({ error: 'Choose a provider' }, { status: 400 })
  // Ollama runs on the business's own server: an address instead of a key.
  let baseUrl: string | null = null
  if (!PROVIDERS[provider].baseUrl) {
    baseUrl = checkBaseUrl(body.base_url)
    if (!baseUrl) return NextResponse.json({ error: 'Enter the server address, e.g. http://localhost:11434' }, { status: 400 })
  }
  const model = typeof body.model === 'string' ? body.model.trim() : ''
  if (!/^[A-Za-z0-9._:/-]{2,100}$/.test(model)) return NextResponse.json({ error: 'Enter a model name' }, { status: 400 })
  const maxReplies = Number(body.max_replies)
  if (!Number.isInteger(maxReplies) || maxReplies < 1 || maxReplies > 20) {
    return NextResponse.json({ error: 'Replies per chat must be 1 to 20' }, { status: 400 })
  }
  const newKey = typeof body.api_key === 'string' ? body.api_key.trim() : ''
  if (newKey && (newKey.length < 10 || newKey.length > 300)) {
    return NextResponse.json({ error: 'That does not look like an API key' }, { status: 400 })
  }

  const admin = supabaseAdmin()
  const handoff = typeof body.handoff_agent_id === 'string' && body.handoff_agent_id ? body.handoff_agent_id : null
  if (handoff) {
    // Must be a member of this account: the service role would accept anyone.
    const { data: member } = await admin
      .from('profiles')
      .select('user_id')
      .eq('user_id', handoff)
      .eq('account_id', ctx.accountId)
      .maybeSingle()
    if (!member) return NextResponse.json({ error: 'Handoff member not found' }, { status: 400 })
  }

  const { data: existing } = await admin.from('ai_configs').select('api_key').eq('account_id', ctx.accountId).maybeSingle()
  const apiKey = newKey ? encrypt(newKey) : ((existing?.api_key as string | undefined) || null)
  const isActive = body.is_active === true
  if (!apiKey && isActive && PROVIDERS[provider].needsKey) {
    return NextResponse.json({ error: 'Add the API key before switching the assistant on' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('ai_configs')
    .upsert(
      {
        account_id: ctx.accountId,
        created_by: ctx.userId,
        provider,
        model,
        // ai_configs.api_key is NOT NULL; with no key yet (assistant off) it is stored empty.
        api_key: apiKey ?? '',
        system_prompt: typeof body.system_prompt === 'string' ? body.system_prompt.slice(0, MAX_INSTRUCTIONS) : null,
        is_active: isActive,
        auto_reply_enabled: body.auto_reply_enabled === true,
        auto_reply_max_per_conversation: maxReplies,
        handoff_agent_id: handoff,
        // Only sent when set, so saving a hosted provider still works before 065.
        ...(baseUrl ? { base_url: baseUrl } : {}),
      },
      { onConflict: 'account_id' },
    )
    .select(baseUrl ? SELECT : SELECT_BEFORE_065)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(shape(data as unknown as Row))
}
