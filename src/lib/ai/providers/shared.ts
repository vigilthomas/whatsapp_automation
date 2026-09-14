import { AiError, type AiUsage, type ChatMessage, type ChatMessageWithRole } from '../types'

// ============================================================
// Bits shared by the OpenAI + Anthropic adapters.
// ============================================================

/** JSON Schema definition for a tool the model can call. */
export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface ProviderArgs {
  apiKey: string
  model: string
  systemPrompt: string
  messages: ChatMessage[]
  timeoutMs: number
  /** OpenAI-format tool definitions. When set, the provider includes
   *  them in the request and the response may contain tool_calls. */
  tools?: ToolDefinition[]
  /** Controls whether the model must call a tool. Defaults to 'auto'. */
  toolChoice?: 'auto' | 'none' | 'required'
}

/**
 * Coerce a provider's usage block into our normalized `AiUsage`, tolerant
 * of missing/partial fields (providers differ and older API versions may
 * omit counts). Returns null when there's nothing usable, so logging can
 * distinguish "no usage reported" from "zero tokens". `total` falls back
 * to prompt + completion when the provider doesn't send it (Anthropic).
 */
export function normalizeUsage(raw: {
  prompt?: unknown
  completion?: unknown
  total?: unknown
}): AiUsage | null {
  const num = (v: unknown): number =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0
  const promptTokens = num(raw.prompt)
  const completionTokens = num(raw.completion)
  const total = num(raw.total)
  const totalTokens = total > 0 ? total : promptTokens + completionTokens
  if (promptTokens === 0 && completionTokens === 0 && totalTokens === 0) {
    return null
  }
  return { promptTokens, completionTokens, totalTokens }
}

/** Map a fetch rejection (timeout / DNS / offline) to a typed AiError. */
export function toNetworkError(err: unknown): AiError {
  if (err instanceof DOMException && err.name === 'TimeoutError') {
    return new AiError('The AI provider took too long to respond.', {
      code: 'timeout',
      status: 504,
    })
  }
  const msg = err instanceof Error ? err.message : String(err)
  return new AiError(`Could not reach the AI provider: ${msg}`, {
    code: 'network_error',
    status: 502,
  })
}

/** Build a typed AiError from a non-2xx provider response, pulling the
 *  provider's own error message out of the JSON body when present. */
export async function providerHttpError(
  provider: string,
  res: Response,
): Promise<AiError> {
  let detail = ''
  try {
    const body = (await res.json()) as { error?: { message?: string } | string }
    detail =
      typeof body?.error === 'string'
        ? body.error
        : (body?.error?.message ?? '')
  } catch {
    // Non-JSON error body — fall back to the status line.
  }

  const { status } = res
  const code =
    status === 401 || status === 403
      ? 'invalid_key'
      : status === 429
        ? 'rate_limited'
        : 'provider_error'
  const base =
    code === 'invalid_key'
      ? `${provider} rejected the API key`
      : code === 'rate_limited'
        ? `${provider} rate limit reached`
        : `${provider} API error (${status})`

  return new AiError(detail ? `${base}: ${detail}` : base, {
    code,
    // Surface an auth failure as 401 so the settings "Test key" button
    // can show "invalid key"; everything else is an upstream 502.
    status: code === 'invalid_key' ? 401 : 502,
  })
}

/**
 * Collapse consecutive same-role turns into one (joined with blank
 * lines). Anthropic requires strictly alternating roles; merging is
 * also harmless for OpenAI and keeps the transcript compact.
 */
/**
 * Tool-aware variant of `mergeConsecutive` for the tool-calling loop.
 * Plain user/assistant text turns are merged exactly as above, but an
 * assistant turn carrying `tool_calls` and every `tool` result message
 * are passed through untouched — merging those would drop the
 * `tool_call_id` linkage the provider needs to pair results with
 * calls, and OpenAI-compatible endpoints reject that.
 */
export function mergeConsecutiveWithTools(
  messages: ChatMessageWithRole[],
): ChatMessageWithRole[] {
  const out: ChatMessageWithRole[] = []
  for (const m of messages) {
    const isPlainText =
      (m.role === 'user' || m.role === 'assistant') && !m.tool_calls && !m.tool_call_id
    const last = out[out.length - 1]
    const lastIsPlainText =
      !!last &&
      (last.role === 'user' || last.role === 'assistant') &&
      !last.tool_calls &&
      !last.tool_call_id
    if (isPlainText && lastIsPlainText && last.role === m.role) {
      last.content = `${last.content ?? ''}

${m.content ?? ''}`
    } else {
      out.push({ ...m })
    }
  }
  return out
}

export function mergeConsecutive(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = []
  for (const m of messages) {
    const last = out[out.length - 1]
    if (last && last.role === m.role) {
      last.content = `${last.content}\n\n${m.content}`
    } else {
      out.push({ role: m.role, content: m.content })
    }
  }
  return out
}
