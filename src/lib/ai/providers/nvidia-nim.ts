// ============================================================
// NVIDIA NIM provider adapter (OpenAI-compatible).
//
// NVIDIA NIM exposes an OpenAI-compatible chat/completions endpoint
// with tool/function-calling support. Currently using DeepSeek V4
// Flash via NIM — swappable per clinic_ai_configs.model.
//
// DeepSeek models support a "thinking" mode via chat_template_kwargs
// which enables chain-of-thought reasoning before the final answer.
//
// API key: single platform key in `NVIDIA_NIM_API_KEY` env var
// (not BYO — Clinicoro provides the AI service to clinics).
//
// Base URL: `https://integrate.api.nvidia.com/v1` by default,
// overridable with `NVIDIA_NIM_BASE_URL` for self-hosted NIM.
// ============================================================

import {
  AiError,
  type ChatMessageWithRole,
  type ProviderResult,
  type ToolCallRequest,
} from '../types'
import { MAX_OUTPUT_TOKENS } from '../defaults'
import {
  mergeConsecutiveWithTools,
  normalizeUsage,
  providerHttpError,
  toNetworkError,
  type ProviderArgs,
} from './shared'

const DEFAULT_NIM_BASE_URL = 'https://integrate.api.nvidia.com/v1'

function nimBaseUrl(): string {
  return process.env.NVIDIA_NIM_BASE_URL?.replace(/\/+$/, '') || DEFAULT_NIM_BASE_URL
}

/** Read an integer from an env var, falling back to `fallback`. */
function envInt(key: string, fallback: number): number {
  const raw = Number(process.env[key])
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback
}

/** Read a float from an env var, falling back to `fallback` (omitted when undefined). */
function envFloat(key: string, fallback: number | undefined): number | undefined {
  const raw = Number(process.env[key])
  if (Number.isFinite(raw) && raw >= 0) return raw
  return fallback
}

function nimApiKey(): string {
  const key = process.env.NVIDIA_NIM_API_KEY
  if (!key) {
    throw new AiError(
      'NVIDIA NIM API key is not configured. Set NVIDIA_NIM_API_KEY.',
      { code: 'missing_api_key', status: 500 },
    )
  }
  return key
}

interface NimToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface NimChoice {
  message?: {
    content?: string | null
    role?: string
    tool_calls?: NimToolCall[]
    /** DeepSeek thinking/reasoning content (chain-of-thought). */
    reasoning?: string | null
    reasoning_content?: string | null
  }
  finish_reason?: string
}

interface NimResponse {
  choices?: NimChoice[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

/** Result extended with optional tool calls and reasoning from the model. */
export interface NimProviderResult extends ProviderResult {
  toolCalls: ToolCallRequest[]
  finishReason: string
  /** DeepSeek chain-of-thought reasoning, when thinking mode is on. */
  reasoning: string | null
}

/**
 * Call the NVIDIA NIM chat completions endpoint.
 *
 * When `args.tools` is set, the request includes tool definitions and
 * the response may contain `tool_calls` instead of text. The caller
 * is responsible for executing tools and feeding results back (see
 * `generate-with-tools.ts`).
 *
 * `args.apiKey`, when non-empty, is used as the bearer (an account's
 * own NIM key from the AI Agents setup page); otherwise the platform
 * key from `NVIDIA_NIM_API_KEY` is used.
 */
export type NimProviderArgs = Omit<ProviderArgs, 'messages'> & {
  /** May include assistant tool_calls and tool-result messages. */
  messages: ChatMessageWithRole[]
}

export async function generateNvidiaNim(
  args: NimProviderArgs,
): Promise<NimProviderResult> {
  const { model, systemPrompt, messages, timeoutMs, tools, toolChoice } = args
  const apiKey = args.apiKey?.trim() || nimApiKey()
  const url = `${nimBaseUrl()}/chat/completions`
  const isDeepSeek = model.startsWith('deepseek')

  // Build the request body. The NIM API is OpenAI-compatible.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: Record<string, any> = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...mergeConsecutiveWithTools(messages),
    ],
    max_tokens: envInt('AI_MAX_TOKENS', isDeepSeek ? 16384 : MAX_OUTPUT_TOKENS),
    temperature: envFloat('AI_TEMPERATURE', isDeepSeek ? 1 : undefined),
  }

  // DeepSeek models support chain-of-thought reasoning via
  // chat_template_kwargs. Enable thinking mode for better
  // tool-calling and complex reasoning.
  if (isDeepSeek) {
    body.top_p = 0.95
    const effort = process.env.AI_REASONING_EFFORT || 'high'
    body.chat_template_kwargs = { thinking: true, reasoning_effort: effort }
  }

  if (tools && tools.length > 0) {
    body.tools = tools
    body.tool_choice = toolChoice ?? 'auto'
  }

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw toNetworkError(err)
  }

  if (!res.ok) {
    throw await providerHttpError('NVIDIA NIM', res)
  }

  const data = (await res.json().catch(() => null)) as NimResponse | null
  const choice = data?.choices?.[0]
  const message = choice?.message
  const finishReason = choice?.finish_reason ?? 'stop'

  // Extract tool calls if present.
  const toolCalls: ToolCallRequest[] = (message?.tool_calls ?? []).map((tc) => ({
    id: tc.id,
    type: tc.type,
    function: {
      name: tc.function.name,
      arguments: tc.function.arguments,
    },
  }))

  // When the model called tools, text may be null/empty — that's expected.
  const text = message?.content ?? ''

  // Extract DeepSeek reasoning/thinking content if present.
  const reasoning = message?.reasoning ?? message?.reasoning_content ?? null
  if (reasoning) {
    console.log('[nvidia-nim] DeepSeek reasoning:', reasoning.slice(0, 200))
  }

  // When neither text nor tool calls are present, something is wrong.
  if (!text.trim() && toolCalls.length === 0) {
    throw new AiError('NVIDIA NIM returned an empty response with no tool calls.', {
      code: 'empty_response',
    })
  }

  const usage = normalizeUsage({
    prompt: data?.usage?.prompt_tokens,
    completion: data?.usage?.completion_tokens,
    total: data?.usage?.total_tokens,
  })

  return { text, usage, toolCalls, finishReason, reasoning }
}
