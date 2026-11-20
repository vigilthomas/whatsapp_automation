// ============================================================
// /api/whatsapp/webhook-url — the WhatsApp webhook callback URL shown
// (and copied) in Settings → WhatsApp.
//
//   GET — any member. { saved, fallback, url }:
//           saved    — what an admin stored (migration 067), or null
//           fallback — NEXT_PUBLIC_SITE_URL from .env + the webhook
//                      path, else this request's own origin + the path
//           url      — saved ?? fallback: the one to paste into Meta
//   PUT — admin+. { url: string | null }; empty / null clears it so the
//         fallback applies again.
//
// Only what's displayed changes: inbound messages always arrive at
// /api/whatsapp/webhook on this deployment. The point is to hand out an
// address Meta can reach (the public domain, or an ngrok link while
// developing) instead of whatever host the page happens to be opened on.
//
// The write uses the service-role client after the role check, filtered
// by the caller's account id — `accounts` RLS only lets owners update.
// ============================================================

import { NextResponse } from "next/server";

import { getCurrentAccount, requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { fallbackWebhookUrl, validateWebhookUrl } from "@/lib/whatsapp/webhook-url";

const isMissingColumn = (code: string | undefined) => code === "42703" || code === "PGRST204";

const fallbackFor = (request: Request) =>
  fallbackWebhookUrl(process.env.NEXT_PUBLIC_SITE_URL, new URL(request.url).origin);

export async function GET(request: Request) {
  try {
    const ctx = await getCurrentAccount();
    const { data, error } = await ctx.supabase
      .from("accounts")
      .select("whatsapp_webhook_url")
      .eq("id", ctx.accountId)
      .maybeSingle();
    // Before 067 there's no column: nothing saved, the fallback applies.
    if (error && !isMissingColumn(error.code)) {
      console.error("[GET /api/whatsapp/webhook-url]", error);
      return NextResponse.json({ error: "Failed to load the webhook URL" }, { status: 500 });
    }
    const saved = (error ? null : (data?.whatsapp_webhook_url as string | null | undefined)) || null;
    const fallback = fallbackFor(request);
    return NextResponse.json({ saved, fallback, url: saved ?? fallback });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PUT(request: Request) {
  try {
    const ctx = await requireRole("admin");
    const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
    const raw = body?.url;
    if (raw !== null && raw !== undefined && typeof raw !== "string") {
      return NextResponse.json({ error: "'url' must be a string or null" }, { status: 400 });
    }

    let value: string | null = null;
    if (typeof raw === "string" && raw.trim()) {
      const checked = validateWebhookUrl(raw);
      if ("error" in checked) return NextResponse.json(checked, { status: 400 });
      value = checked.url;
    }

    const { error } = await supabaseAdmin()
      .from("accounts")
      .update({ whatsapp_webhook_url: value })
      .eq("id", ctx.accountId);
    if (error) {
      console.error("[PUT /api/whatsapp/webhook-url]", error);
      return NextResponse.json(
        {
          error: isMissingColumn(error.code)
            ? "Saving the webhook URL needs migration 067_whatsapp_webhook_url.sql — run it in Supabase first"
            : "Failed to save the webhook URL",
        },
        { status: 500 },
      );
    }

    const fallback = fallbackFor(request);
    return NextResponse.json({ saved: value, fallback, url: value ?? fallback });
  } catch (err) {
    return toErrorResponse(err);
  }
}
