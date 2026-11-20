// ============================================================
// One chat completion from the clinic's own AI provider (bring your
// own key, stored encrypted on ai_configs — migration 029).
//
// Plain fetch, no SDK: two providers, one call each. A 20 s timeout
// keeps a slow provider from holding the webhook's `after()` work open;
// any failure throws `AiProviderError`, which the runner turns into a
// handoff to staff (never a silent drop, never a made-up reply).
// ============================================================

import type { ChatTurn } from "./model";

export const AI_PROVIDERS = ["anthropic", "openai"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

/** Suggested models; the clinic may type any model id its key can use. */
export const DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: "claude-haiku-5-5",
  openai: "gpt-4o-mini",
};

const TIMEOUT_MS = 20_000;
const MAX_TOKENS = 600;

export class AiProviderError extends Error {}

export function isAiProvider(v: unknown): v is AiProvider {
  return typeof v === "string" && (AI_PROVIDERS as readonly string[]).includes(v);
}

export async function complete({
  provider,
  model,
  apiKey,
  system,
  turns,
}: {
  provider: AiProvider;
  model: string;
  apiKey: string;
  system: string;
  turns: ChatTurn[];
}): Promise<string> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal,
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: MAX_TOKENS, system, messages: turns }),
      });
      const data = (await res.json().catch(() => null)) as { content?: { type: string; text?: string }[]; error?: { message?: string } } | null;
      if (!res.ok) throw new AiProviderError(`Anthropic ${res.status}: ${data?.error?.message ?? "request failed"}`);
      return (data?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    }
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, ...turns],
      }),
    });
    const data = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } } | null;
    if (!res.ok) throw new AiProviderError(`OpenAI ${res.status}: ${data?.error?.message ?? "request failed"}`);
    return data?.choices?.[0]?.message?.content ?? "";
  } catch (err) {
    if (err instanceof AiProviderError) throw err;
    throw new AiProviderError(err instanceof Error ? err.message : "AI request failed");
  }
}
