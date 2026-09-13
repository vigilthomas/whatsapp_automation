// ============================================================
// /api/account/members/[userId]
//
//   PATCH  — change a member's role.   Admin+.
//   DELETE — remove a member.          Admin+.
//
// Both delegate to SECURITY DEFINER RPCs from migration 018:
//   - set_member_role(p_user_id, p_new_role)
//   - remove_account_member(p_user_id)
//
// The RPCs do the *real* authorisation work — caller must be
// admin+, target must be in caller's account, target can't be the
// owner, can't be self. The TS layer here only forwards the call
// and maps Postgres SQLSTATEs back to HTTP statuses.
// ============================================================

import { NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { isAccountRole } from "@/lib/auth/roles";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";

// Map known SQLSTATEs from the RPCs (see migration 018) onto HTTP
// statuses. The `error.code` field is the SQLSTATE; the `message`
// is the human-readable RAISE message we put in the migration.
function rpcErrorToResponse(err: PostgrestError): NextResponse {
  if (err.code === "42501") {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err.code === "22023") {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  console.error("[members route] unexpected RPC error:", err);
  return NextResponse.json(
    { error: "Failed to update member" },
    { status: 500 },
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const ctx = await requireRole("admin");

    const limit = checkRateLimit(
      `admin:memberRole:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { userId } = await params;

    const body = (await request.json().catch(() => null)) as
      | { role?: unknown; designation_id?: unknown; clinic_id?: unknown; staff_type?: unknown }
      | null;

    // Designation assignment. Goes through the service-role client
    // because the 034/043 trigger blocks `authenticated` from touching
    // `designation_id` (it is a privilege column — a member must not be
    // able to hand themselves a broader designation). The account
    // scope on the UPDATE keeps it inside the caller's tenant, and the
    // designation itself must belong to that tenant too.
    const wantsProfileFields =
      body && ("designation_id" in body || "clinic_id" in body || "staff_type" in body);
    if (body && wantsProfileFields) {
      const update: Record<string, unknown> = {};
      const designationId = "designation_id" in body ? body.designation_id : undefined;
      const clinicId = "clinic_id" in body ? body.clinic_id : undefined;
      const staffType = "staff_type" in body ? body.staff_type : undefined;
      if (designationId !== undefined && designationId !== null && typeof designationId !== "string") {
        return NextResponse.json({ error: "'designation_id' must be an id or null" }, { status: 400 });
      }
      if (clinicId !== undefined && clinicId !== null && typeof clinicId !== "string") {
        return NextResponse.json({ error: "'clinic_id' must be an id or null" }, { status: 400 });
      }
      if (
        staffType !== undefined &&
        staffType !== null &&
        !(typeof staffType === "string" && ["doctor", "assistant", "other"].includes(staffType))
      ) {
        return NextResponse.json({ error: "'staff_type' must be doctor, assistant, other or null" }, { status: 400 });
      }
      const admin = supabaseAdmin();
      if (clinicId) {
        const { data: c } = await admin
          .from("clinics")
          .select("id")
          .eq("id", clinicId)
          .eq("account_id", ctx.accountId)
          .maybeSingle();
        if (!c) return NextResponse.json({ error: "clinic not found" }, { status: 400 });
      }
      if (designationId) {
        const { data: d } = await admin
          .from("designations")
          .select("id")
          .eq("id", designationId)
          .eq("account_id", ctx.accountId)
          .maybeSingle();
        if (!d) {
          return NextResponse.json({ error: "designation not found" }, { status: 400 });
        }
      }
      if (designationId !== undefined) update.designation_id = designationId;
      if (clinicId !== undefined) update.clinic_id = clinicId;
      if (staffType !== undefined) update.staff_type = staffType;
      const { error } = await admin
        .from("profiles")
        .update(update)
        .eq("user_id", userId)
        .eq("account_id", ctx.accountId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!("role" in body)) return NextResponse.json({ ok: true });
    }

    const role = body?.role;

    if (!isAccountRole(role)) {
      return NextResponse.json(
        { error: "'role' must be one of owner, admin, agent, viewer" },
        { status: 400 },
      );
    }

    // The RPC blocks promotion to / demotion from owner, but
    // surface the friendlier 400 before crossing the wire too.
    if (role === "owner") {
      return NextResponse.json(
        {
          error:
            "Use POST /api/account/transfer-ownership to promote a member to owner",
        },
        { status: 400 },
      );
    }

    const { error } = await ctx.supabase.rpc("set_member_role", {
      p_user_id: userId,
      p_new_role: role,
    });

    if (error) return rpcErrorToResponse(error);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const ctx = await requireRole("admin");

    const limit = checkRateLimit(
      `admin:memberRemove:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { userId } = await params;

    const { data, error } = await ctx.supabase.rpc("remove_account_member", {
      p_user_id: userId,
    });

    if (error) return rpcErrorToResponse(error);

    return NextResponse.json({ ok: true, newPersonalAccountId: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
