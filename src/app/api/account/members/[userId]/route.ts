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

import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { isAccountRole } from "@/lib/auth/roles";
import { accessLevelFromRole, retireDoctorForUser, staffTypeFromRole, syncDoctorForUser } from "@/lib/master/staff";
import { requirePermission } from "@/lib/auth/permission-guard";
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
    const ctx = await requirePermission("users", "edit");

    const limit = checkRateLimit(
      `admin:memberRole:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { userId } = await params;

    const body = (await request.json().catch(() => null)) as
      | { role?: unknown; designation_id?: unknown; branch_id?: unknown; staff_type?: unknown }
      | null;

    // Designation assignment. Goes through the service-role client
    // because the 034/043 trigger blocks `authenticated` from touching
    // `designation_id` (it is a privilege column — a member must not be
    // able to hand themselves a broader designation). The account
    // scope on the UPDATE keeps it inside the caller's tenant, and the
    // designation itself must belong to that tenant too.
    const wantsProfileFields =
      body && ("designation_id" in body || "branch_id" in body || "staff_type" in body);
    if (body && wantsProfileFields) {
      const update: Record<string, unknown> = {};
      const designationId = "designation_id" in body ? body.designation_id : undefined;
      const branchId = "branch_id" in body ? body.branch_id : undefined;
      const staffType = "staff_type" in body ? body.staff_type : undefined;
      if (designationId !== undefined && designationId !== null && typeof designationId !== "string") {
        return NextResponse.json({ error: "'designation_id' must be an id or null" }, { status: 400 });
      }
      if (branchId !== undefined && branchId !== null && typeof branchId !== "string") {
        return NextResponse.json({ error: "'branch_id' must be an id or null" }, { status: 400 });
      }
      if (
        staffType !== undefined &&
        staffType !== null &&
        !(typeof staffType === "string" && ["doctor", "assistant", "other"].includes(staffType))
      ) {
        return NextResponse.json({ error: "'staff_type' must be doctor, assistant, other or null" }, { status: 400 });
      }
      const admin = supabaseAdmin();
      if (branchId) {
        const { data: c } = await admin
          .from("branches")
          .select("id")
          .eq("id", branchId)
          .eq("account_id", ctx.accountId)
          .is("deleted_at", null)
          .maybeSingle();
        if (!c) return NextResponse.json({ error: "branch not found" }, { status: 400 });
      }
      const { data: target } = await admin
        .from("profiles")
        .select("account_role")
        .eq("user_id", userId)
        .eq("account_id", ctx.accountId)
        .maybeSingle();
      if (!target) return NextResponse.json({ error: "user not found" }, { status: 404 });
      // Owners follow their designation (049), so only a super admin may change an owner's.
      if (designationId !== undefined && !ctx.superAdmin) {
        if (target.account_role === "owner") {
          return NextResponse.json(
            { error: "Only a super admin can change an owner's role" },
            { status: 403 },
          );
        }
      }
      let roleName: string | null = null;
      let rolePermissions: unknown = null;
      if (designationId) {
        const { data: d } = await admin
          .from("designations")
          .select("id, name, permissions")
          .eq("id", designationId)
          .eq("account_id", ctx.accountId)
          .is("deleted_at", null)
          .maybeSingle();
        if (!d) {
          return NextResponse.json({ error: "role not found" }, { status: 400 });
        }
        roleName = String(d.name ?? "");
        rolePermissions = d.permissions;
      }
      if (designationId !== undefined) update.designation_id = designationId;
      // The access level follows the role (owners keep theirs).
      if (designationId !== undefined && target.account_role !== "owner") {
        update.account_role = accessLevelFromRole(roleName, rolePermissions);
      }
      if (branchId !== undefined) update.branch_id = branchId;
      if (staffType !== undefined) update.staff_type = staffType;
      // A new role decides whether they're a doctor, unless told outright.
      else if (designationId !== undefined) update.staff_type = roleName ? staffTypeFromRole(roleName) : null;
      const { error } = await admin
        .from("profiles")
        .update(update)
        .eq("user_id", userId)
        .eq("account_id", ctx.accountId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      // Keep their doctor record (bookable in Appointments) in step.
      if ("staff_type" in update || "branch_id" in update) {
        const { data: now } = await admin
          .from("profiles")
          .select("staff_type, branch_id")
          .eq("user_id", userId)
          .eq("account_id", ctx.accountId)
          .maybeSingle();
        await syncDoctorForUser(admin, {
          accountId: ctx.accountId,
          userId,
          isDoctor: now?.staff_type === "doctor",
          branchId: (now?.branch_id as string | null | undefined) ?? null,
        }).catch((err) => console.error("[members] doctor sync failed:", err));
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
    const ctx = await requirePermission("users", "delete");

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

    // They're gone from the clinic, so they can't be booked any more.
    await retireDoctorForUser(supabaseAdmin(), ctx.accountId, userId).catch((err) =>
      console.error("[members] retiring doctor record failed:", err),
    );

    return NextResponse.json({ ok: true, newPersonalAccountId: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
