import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/auth/account";
import { requirePermission } from "@/lib/auth/permission-guard";
import { MIRROR_BUCKET } from "@/lib/whatsapp/mirror-inbound-media";
import { storedMediaPath } from "@/lib/media/stored-path";

/**
 * GET /api/whatsapp/media/stored/<account-id folder>/<...>
 *
 * Serves an inbound attachment from the PRIVATE `patient-media` bucket
 * (migration 062, security audit F-01). Inbound media used to sit in the
 * public `chat-media` bucket, where anyone with the anon key could list
 * and download every clinic's patient files.
 *
 * Three independent locks, so one misconfiguration can't reopen it:
 *   1. The caller must be signed in and hold `inbox:read`.
 *   2. The path's first segment must be the CALLER's own
 *      `account-<id>` folder (checked here, before any Storage call).
 *   3. The download runs on the caller's RLS client, so the bucket's
 *      members-only SELECT policy applies as well.
 *
 * `Cache-Control: private` lets the browser keep the bytes without any
 * shared cache doing so. The inbox's blob cache (`lib/media/blob-cache`)
 * already treats every `/api/whatsapp/media/*` URL as credentialed.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path: segments } = await params;
    const ctx = await requirePermission("inbox", "read");

    const path = storedMediaPath(segments, ctx.accountId);
    if (!path) {
      // Same answer for "malformed" and "someone else's folder", so the
      // route can't be used to probe which account folders exist.
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data, error } = await ctx.supabase.storage
      .from(MIRROR_BUCKET)
      .download(path);
    if (error || !data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": data.type || "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
        // Never let a stored file render as a page of our origin.
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
