// ============================================================
// The WhatsApp webhook callback URL shown in Settings → WhatsApp —
// pure, no I/O. Used by /api/whatsapp/webhook-url.
//
// Precedence: the URL an admin saved (accounts.whatsapp_webhook_url,
// migration 067) → NEXT_PUBLIC_SITE_URL from .env + the webhook path →
// the request's own origin + the path.
// ============================================================

export const WEBHOOK_PATH = "/api/whatsapp/webhook";
export const MAX_WEBHOOK_URL_LEN = 500;

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/** `${site or origin}/api/whatsapp/webhook`, with any trailing slash on the site trimmed. */
export function fallbackWebhookUrl(siteUrl: string | undefined, requestOrigin: string): string {
  const site = siteUrl?.trim().replace(/\/+$/, "");
  return `${site || requestOrigin}${WEBHOOK_PATH}`;
}

/**
 * A URL Meta can call: https, or http only for a local address while
 * developing; no login in it. Returns the normalised URL or an error.
 */
export function validateWebhookUrl(raw: string): { url: string } | { error: string } {
  const value = raw.trim();
  if (value.length > MAX_WEBHOOK_URL_LEN) return { error: `Keep the URL under ${MAX_WEBHOOK_URL_LEN} characters` };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { error: "That isn't a valid URL" };
  }
  const local = LOCAL_HOSTS.includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    return { error: "Meta only calls https:// URLs" };
  }
  if (url.username || url.password) return { error: "Don't put a login in the URL" };
  return { url: url.toString() };
}
