// ============================================================
// PUT /api/account/members/[userId]/login  { enabled: boolean }
//
// Switch a member's login on or off (Master → Users, and the Login
// switch on Master → Doctors for a doctor who already has one). Off is
// a Supabase Auth ban mirrored in profiles.login_disabled (070); see
// lib/master/login-access.ts. The owner and the caller themself can't
// be switched off.
//
// Gated on `users:edit`, like the member PATCH.
// ============================================================

import { NextResponse } from "next/server";

import { toErrorResponse } from "@/lib/auth/account";
import { requirePermission } from "@/lib/auth/permission-guard";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { setLoginEnabled } from "@/lib/master/login-access";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

export async function PUT(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const ctx = await requirePermission("users", "edit");
    const limit = checkRateLimit(`admin:memberLogin:${ctx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const { userId } = await params;
    const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null;
    if (typeof body?.enabled !== "boolean") {
      return NextResponse.json({ error: "'enabled' must be true or false" }, { status: 400 });
    }

    const res = await setLoginEnabled(
      supabaseAdmin(),
      { accountId: ctx.accountId, callerId: ctx.userId },
      userId,
      body.enabled,
    );
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json({ enabled: body.enabled });
  } catch (err) {
    return toErrorResponse(err);
  }
}
