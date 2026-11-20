import { describe, expect, it } from "vitest";

import { fallbackWebhookUrl, validateWebhookUrl } from "./webhook-url";

describe("fallbackWebhookUrl", () => {
  it("prefers the site URL from .env, trimming a trailing slash", () => {
    expect(fallbackWebhookUrl("https://crm.example.com/", "http://localhost:3000")).toBe(
      "https://crm.example.com/api/whatsapp/webhook",
    );
  });

  it("falls back to the request's origin when .env has none", () => {
    expect(fallbackWebhookUrl(undefined, "http://localhost:3000")).toBe("http://localhost:3000/api/whatsapp/webhook");
    expect(fallbackWebhookUrl("  ", "https://a.test")).toBe("https://a.test/api/whatsapp/webhook");
  });
});

describe("validateWebhookUrl", () => {
  it("accepts https URLs, and http only for local addresses", () => {
    expect(validateWebhookUrl(" https://abc.ngrok-free.app/api/whatsapp/webhook ")).toEqual({
      url: "https://abc.ngrok-free.app/api/whatsapp/webhook",
    });
    expect(validateWebhookUrl("http://localhost:3000/api/whatsapp/webhook")).toHaveProperty("url");
    expect(validateWebhookUrl("http://crm.example.com/api/whatsapp/webhook")).toHaveProperty("error");
  });

  it("rejects junk, other schemes, logins and overly long URLs", () => {
    expect(validateWebhookUrl("not a url")).toHaveProperty("error");
    expect(validateWebhookUrl("ftp://example.com/x")).toHaveProperty("error");
    expect(validateWebhookUrl("javascript:alert(1)")).toHaveProperty("error");
    expect(validateWebhookUrl("https://user:pass@example.com/x")).toHaveProperty("error");
    expect(validateWebhookUrl(`https://example.com/${"a".repeat(500)}`)).toHaveProperty("error");
  });
});
