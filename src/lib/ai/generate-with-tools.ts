// ============================================================
// Multi-turn tool-calling generation loop.
//
// Calls the clinic's provider — NVIDIA NIM (default) or a local
// Ollama model with tool support such as qwen3:8b — executes any
// tool calls the model requests, feeds the results back, and
// repeats up to MAX_TOOL_CALL_ROUNDS. Returns the final text
// response with aggregated usage across all rounds.
//
// The ClinicContext is injected server-side into every tool call
// — the model cannot override the clinic or account scope.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AiUsage,
  ChatMessage,
  ChatMessageWithRole,
  GenerateWithToolsResult,
  ToolCallResult,
} from './types'
import { HANDOFF_SENTINEL, MAX_TOOL_CALL_ROUNDS, aiRequestTimeoutMs } from './defaults'
import { generateNvidiaNim } from './providers/nvidia-nim'
import { generateOllama } from './providers/ollama'
import type { ToolDefinition } from './providers/shared'
import type { AiProvider } from './types'
import { executeAndLogTool, type ClinicContext } from './tools/executor'

export interface GenerateWithToolsArgs {
  /** Which backend to call. 'ollama' → local; anything else → NIM. */
  provider?: AiProvider
  /** The model ID (e.g., deepseek-ai/deepseek-v4-flash-0731, qwen3:8b). */
  model: string
  /** Full system prompt. */
  systemPrompt: string
  /** Recent conversation turns (user / assistant). */
  messages: ChatMessage[]
  /** Tool definitions to send to the model. */
  tools: ToolDefinition[]
  /** Server-side clinic context for tool execution. */
  clinicContext: ClinicContext
  /** Supabase admin client for tool DB access + audit logging. */
  db: SupabaseClient
  /** Request timeout in milliseconds. */
  timeoutMs?: number
}

/**
 * Run the multi-turn tool-calling generation loop.
 *
 * 1. Call NVIDIA NIM with system prompt + conversation + tools.
 * 2. If the model returns tool_calls:
 *    a. Execute each tool (with ClinicContext).
 *    b. Append tool results to the message history.
 *    c. Call NVIDIA NIM again (up to MAX_TOOL_CALL_ROUNDS).
 * 3. Return the final text response + aggregated usage.
 */
export async function generateWithTools(
  args: GenerateWithToolsArgs,
): Promise<GenerateWithToolsResult> {
  const {
    provider = 'nvidia_nim',
    model,
    systemPrompt,
    messages,
    tools,
    clinicContext,
    db,
    timeoutMs = aiRequestTimeoutMs(),
  } = args

  // One call shape for both backends. Each adapter does its own
  // tool-aware consecutive-turn merging, so we pass turns through as-is.
  const call = (msgs: ChatMessageWithRole[], withTools: boolean) =>
    provider === 'ollama'
      ? generateOllama({
          apiKey: '',
          model,
          systemPrompt,
          messages: msgs,
          timeoutMs,
          tools: withTools && tools.length > 0 ? tools : undefined,
          // Primary-path replies need more room than the small-talk default.
          numPredict: 1024,
        })
      : generateNvidiaNim({
          apiKey: '', // NIM uses env var, not BYO key
          model,
          systemPrompt,
          messages: msgs,
          timeoutMs,
          tools: withTools && tools.length > 0 ? tools : undefined,
        })

  // Build the message array for the provider. Start with the
  // conversation history (user/assistant turns).
  const providerMessages: ChatMessageWithRole[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  let totalUsage: AiUsage | null = null
  const allToolCalls: ToolCallResult[] = []

  for (let round = 0; round < MAX_TOOL_CALL_ROUNDS; round++) {
    const result = await call(providerMessages, true)

    totalUsage = addUsage(totalUsage, result.usage)

    // No tool calls → this is the final text response.
    if (result.toolCalls.length === 0) {
      return parseToolResult(result.text, totalUsage, allToolCalls)
    }

    // Model wants to call tools. Append the assistant message with
    // tool_calls, execute each tool, then append tool results.
    providerMessages.push({
      role: 'assistant',
      content: result.text || null,
      tool_calls: result.toolCalls,
    })

    for (const tc of result.toolCalls) {
      let toolArgs: Record<string, unknown>
      try {
        toolArgs = JSON.parse(tc.function.arguments)
      } catch {
        toolArgs = {}
      }

      const toolResult = await executeAndLogTool(
        clinicContext,
        db,
        tc.id,
        tc.function.name,
        toolArgs,
      )

      allToolCalls.push(toolResult)

      // Append the tool result as a 'tool' message for the next round.
      providerMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(toolResult.result),
      })
    }

    // Continue the loop — the next round will see the tool results
    // and either respond with text or call more tools.
  }

  // Hit the round cap without a final text response. Force a
  // response by calling without tools.
  const finalResult = await call(providerMessages, false) // no tools → text

  totalUsage = addUsage(totalUsage, finalResult.usage)
  return parseToolResult(finalResult.text, totalUsage, allToolCalls)
}

/** Parse the final text for handoff sentinel and build the result. */
function parseToolResult(
  raw: string,
  usage: AiUsage | null,
  toolCalls: ToolCallResult[],
): GenerateWithToolsResult {
  const handoff = raw.includes(HANDOFF_SENTINEL)
  const text = raw.split(HANDOFF_SENTINEL).join('').trim()
  return { text, handoff, usage, toolCalls }
}

/** Accumulate usage across multiple rounds. */
function addUsage(total: AiUsage | null, next: AiUsage | null): AiUsage | null {
  if (!next) return total
  if (!total) return { ...next }
  return {
    promptTokens: total.promptTokens + next.promptTokens,
    completionTokens: total.completionTokens + next.completionTokens,
    totalTokens: total.totalTokens + next.totalTokens,
  }
}
