// ============================================================
// Ollama provider adapter (local models).
//
// Talks to a locally hosted Ollama server (`/api/chat`, non-streaming).
// Serves two roles:
//
//   1. The "basic replies" / extraction tier (`basic-reply.ts`,
//      `local-extract.ts`) — a small model (gemma:2b) answering small
//      talk or parsing intent in ~2s.
//   2. Optionally the PRIMARY tool-calling receptionist, when a
//      clinic's provider is 'ollama' and the model supports tools
//      (e.g. qwen3:8b). `generate-with-tools.ts` routes here instead
//      of NVIDIA NIM, so the whole pipeline can run on-prem.
//
// Ollama's chat API is *almost* OpenAI-shaped. The differences we
// paper over here:
//   - response `tool_calls[].function.arguments` is a JSON object,
//     not a string; the loop expects a string (OpenAI style).
//   - older servers omit `tool_calls[].id`; we synthesise one so the
//     tool-result linkage still works.
//   - tool results are sent with both `tool_call_id` and `tool_name`
//     (newer servers key on the former, older on the latter).
//   - thinking models (qwen3) accept a top-level `think` flag;
//     default off for latency, `OLLAMA_THINK=true` to enable.
//
// Env:
//   OLLAMA_BASE_URL     default http://localhost:11434
//   OLLAMA_MODEL        default gemma:2b
//   OLLAMA_NUM_PREDICT  max reply tokens, default 80 (WhatsApp-short)
//   OLLAMA_TEMPERATURE  default 0.3
//   OLLAMA_THINK        "true" to enable thinking on models that support it
// ============================================================

import {
  AiError,
  type ChatMessageWithRole,
  type ProviderResult,
  type ToolCallRequest,
} from '../types'
import {
  mergeConsecutiveWithTools,
  normalizeUsage,
  providerHttpError,
  toNetworkError,
  type ProviderArgs,
} from './shared'

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434'
export const DEFAULT_OLLAMA_MODEL = 'gemma:2b'

export function ollamaBaseUrl(): string {
  return process.env.OLLAMA_BASE_URL?.replace(/\/+$/, '') || DEFAULT_OLLAMA_BASE_URL
}

export function ollamaModel(): string {
  return process.env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL
}

function envNum(key: string, fallback: number): number {
  const raw = Number(process.env[key])
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback
}

interface OllamaToolCall {
  id?: string
  type?: 'function'
  function: { name: string; arguments: Record<string, unknown> | string }
}

interface OllamaChatResponse {
  message?: {
    role?: string
    content?: string | null
    thinking?: string | null
    tool_calls?: OllamaToolCall[]
  }
  done?: boolean
  done_reason?: string
  prompt_eval_count?: number
  eval_count?: number
}

export interface OllamaArgs extends Omit<ProviderArgs, 'messages'> {
  /** May include assistant tool_calls and tool-result messages. */
  messages: ChatMessageWithRole[]
  /** Ask Ollama to constrain output to valid JSON (extraction use). */
  format?: 'json'
  /** Per-call override of OLLAMA_TEMPERATURE. */
  temperature?: number
  /** Per-call override of OLLAMA_NUM_PREDICT. */
  numPredict?: number
}

export interface OllamaProviderResult extends ProviderResult {
  toolCalls: ToolCallRequest[]
  finishReason: string
}

/** Ollama wants tool-call arguments as an object; the loop stores strings. */
function toOllamaMessage(m: ChatMessageWithRole): Record<string, unknown> {
  if (m.role === 'assistant' && m.tool_calls?.length) {
    return {
      role: 'assistant',
      content: m.content ?? '',
      tool_calls: m.tool_calls.map((tc) => {
        let args: unknown = {}
        try {
          args = JSON.parse(tc.function.arguments)
        } catch {
          /* leave {} */
        }
        return { id: tc.id, type: 'function', function: { name: tc.function.name, arguments: args } }
      }),
    }
  }
  if (m.role === 'tool') {
    return { role: 'tool', content: m.content ?? '', tool_call_id: m.tool_call_id }
  }
  return { role: m.role, content: m.content ?? '' }
}

/**
 * Call Ollama's chat endpoint. `args.apiKey` is ignored — accepted
 * only so the signature matches `ProviderArgs`.
 */
export async function generateOllama(args: OllamaArgs): Promise<OllamaProviderResult> {
  const { model, systemPrompt, messages, timeoutMs, format, temperature, numPredict, tools } =
    args
  const url = `${ollamaBaseUrl()}/api/chat`

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...mergeConsecutiveWithTools(messages).map(toOllamaMessage),
    ],
    stream: false,
    options: {
      temperature: temperature ?? envNum('OLLAMA_TEMPERATURE', 0.3),
      num_predict: Math.floor(numPredict ?? envNum('OLLAMA_NUM_PREDICT', 80)),
    },
  }
  if (format) body.format = format
  if (tools && tools.length > 0) body.tools = tools
  // Thinking models (qwen3, deepseek-r1) reason before answering — good
  // for tool choice, bad for latency. Off unless explicitly enabled.
  body.think = process.env.OLLAMA_THINK === 'true'

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw toNetworkError(err)
  }

  if (!res.ok) {
    throw await providerHttpError('Ollama', res)
  }

  const data = (await res.json().catch(() => null)) as OllamaChatResponse | null
  const message = data?.message
  const text = (message?.content ?? '').trim()

  const toolCalls: ToolCallRequest[] = (message?.tool_calls ?? []).map((tc, i) => ({
    id: tc.id || `call_${Date.now().toString(36)}_${i}`,
    type: 'function',
    function: {
      name: tc.function.name,
      arguments:
        typeof tc.function.arguments === 'string'
          ? tc.function.arguments
          : JSON.stringify(tc.function.arguments ?? {}),
    },
  }))

  if (!text && toolCalls.length === 0) {
    throw new AiError('Ollama returned an empty response.', { code: 'empty_response' })
  }

  const usage = normalizeUsage({
    prompt: data?.prompt_eval_count,
    completion: data?.eval_count,
  })

  return {
    text,
    usage,
    toolCalls,
    finishReason: toolCalls.length > 0 ? 'tool_calls' : (data?.done_reason ?? 'stop'),
  }
}
