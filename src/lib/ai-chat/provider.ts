// ============================================================
// One chat completion from the business's own AI provider (bring your
// own key, stored encrypted on ai_configs — migration 029; more
// providers and a server address in 065).
//
// Plain fetch, no SDK. Anthropic has its own API; OpenAI, Groq, NVIDIA
// and a local Ollama server all speak the OpenAI chat-completions format,
// so they share one call with a different address. A timeout keeps a slow
// provider from holding the webhook's `after()` work open; any failure
// throws `AiProviderError`, which the runner turns into a handoff to
// staff (never a silent drop, never a made-up reply).
// ============================================================

import type { ChatTurn } from "./model";

export const AI_PROVIDERS = ["anthropic", "openai", "groq", "nvidia", "ollama"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

interface ProviderInfo {
  /** Suggested model; any model id the account can use may be typed. */
  model: string;
  /** Fixed API address; null = the business enters its own (Ollama). */
  baseUrl: string | null;
  /** Ollama on your own server needs no key. */
  needsKey: boolean;
  /** Whether to ask for a JSON object (`response_format`). */
  jsonMode: boolean;
  timeoutMs: number;
}

export const PROVIDERS: Record<AiProvider, ProviderInfo> = {
  anthropic: { model: "claude-haiku-5-5", baseUrl: "https://api.anthropic.com", needsKey: true, jsonMode: false, timeoutMs: 20_000 },
  openai: { model: "gpt-4o-mini", baseUrl: "https://api.openai.com", needsKey: true, jsonMode: true, timeoutMs: 20_000 },
  groq: { model: "llama-3.3-70b-versatile", baseUrl: "https://api.groq.com/openai", needsKey: true, jsonMode: true, timeoutMs: 20_000 },
  // Not every NVIDIA-hosted model accepts response_format; the prompt
  // already asks for JSON and parseModelReply hands off on anything else.
  nvidia: { model: "meta/llama-3.3-70b-instruct", baseUrl: "https://integrate.api.nvidia.com", needsKey: true, jsonMode: false, timeoutMs: 30_000 },
  // A local model on modest hardware can take a while to answer.
  ollama: { model: "llama3.2", baseUrl: null, needsKey: false, jsonMode: true, timeoutMs: 60_000 },
};

/** Suggested models per provider (kept for existing callers). */
export const DEFAULT_MODELS: Record<AiProvider, string> = Object.fromEntries(
  AI_PROVIDERS.map((p) => [p, PROVIDERS[p].model]),
) as Record<AiProvider, string>;

/** What the Ollama address field suggests. */
export const OLLAMA_DEFAULT_URL = "http://localhost:11434";
export const BASE_URL_MAX = 200;

const MAX_TOKENS = 600;

export class AiProviderError extends Error {}

export function isAiProvider(v: unknown): v is AiProvider {
  return typeof v === "string" && (AI_PROVIDERS as readonly string[]).includes(v);
}

/**
 * Check a server address typed for Ollama. Returns the cleaned address
 * (no trailing slash or `/v1`) or null.
 *
 * Private and local addresses are allowed on purpose: Ollama normally
 * runs on the same machine or the local network. Cloud metadata
 * addresses are refused so the setting can't be used to read the
 * server's own credentials, and only http(s) without a user/password
 * part is accepted. Only owners/admins can set it (api/ai/settings).
 */
export function checkBaseUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value || value.length > BASE_URL_MAX) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password || url.search || url.hash) return null;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (/^169\.254\./.test(host) || host === "metadata.google.internal" || host === "metadata" || host.startsWith("fd00:ec2:")) {
    return null;
  }
  const path = url.pathname.replace(/\/+$/, "").replace(/\/v1$/, "");
  return `${url.protocol}//${url.host}${path}`;
}

export async function complete({
  provider,
  model,
  apiKey,
  baseUrl,
  system,
  turns,
}: {
  provider: AiProvider;
  model: string;
  apiKey: string;
  /** Ollama's server address (checkBaseUrl); ignored by the hosted providers. */
  baseUrl?: string | null;
  system: string;
  turns: ChatTurn[];
}): Promise<string> {
  const info = PROVIDERS[provider];
  const signal = AbortSignal.timeout(info.timeoutMs);
  const name = provider.charAt(0).toUpperCase() + provider.slice(1);
  try {
    if (provider === "anthropic") {
      const res = await fetch(`${info.baseUrl}/v1/messages`, {
        method: "POST",
        signal,
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: MAX_TOKENS, system, messages: turns }),
      });
      const data = (await res.json().catch(() => null)) as { content?: { type: string; text?: string }[]; error?: { message?: string } } | null;
      if (!res.ok) throw new AiProviderError(`Anthropic ${res.status}: ${data?.error?.message ?? "request failed"}`);
      return (data?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    }

    const base = info.baseUrl ?? checkBaseUrl(baseUrl ?? OLLAMA_DEFAULT_URL);
    if (!base) throw new AiProviderError(`${name}: the server address isn't valid`);
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      signal,
      headers,
      // No redirects: a redirect could point the request somewhere the
      // address check never saw.
      redirect: "error",
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        ...(info.jsonMode ? { response_format: { type: "json_object" } } : {}),
        messages: [{ role: "system", content: system }, ...turns],
      }),
    });
    const data = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } | string } | null;
    if (!res.ok) {
      const msg = typeof data?.error === "string" ? data.error : data?.error?.message;
      throw new AiProviderError(`${name} ${res.status}: ${msg ?? "request failed"}`);
    }
    return data?.choices?.[0]?.message?.content ?? "";
  } catch (err) {
    if (err instanceof AiProviderError) throw err;
    throw new AiProviderError(err instanceof Error ? err.message : "AI request failed");
  }
}
