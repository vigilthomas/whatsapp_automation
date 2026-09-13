// ============================================================
// GET /api/account/members
//
// Lists every member of the caller's account. Any member can call
// it (the Members tab is shown to admins+, but agents/viewers see
// a read-only roster too).
//
// Field visibility
//   Sensitive fields (email) are returned only when the caller is
//   admin+. Agents and viewers see name + avatar + role + joined
//   date only. This mirrors the design decision from the planning
//   phase: "agent/viewer sees names only".
// ============================================================

import { NextResponse } from "next/server";

import { getCurrentAccount, toErrorResponse } from "@/lib/auth/account";
import { canManageMembers, isAccountRole } from "@/lib/auth/roles";
import type { AccountMember } from "@/types";

interface ProfileRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  account_role: string;
  created_at: string;
  designation_id?: string | null;
}

export async function GET() {
  try {
    const ctx = await getCurrentAccount();

    // RLS on profiles allows reading any row whose account matches
    // the caller's, so this query is naturally account-scoped.
    const { data, error } = await ctx.supabase
      .from("profiles")
      // designation_id arrives with migration 043; on an older schema
      // the select would fail, so it is fetched separately below.
      .select("user_id, full_name, email, avatar_url, account_role, created_at")
      .eq("account_id", ctx.accountId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[GET /api/account/members] fetch error:", error);
      return NextResponse.json(
        { error: "Failed to load members" },
        { status: 500 },
      );
    }

    const canSeeEmails = canManageMembers(ctx.role);

    // Best-effort lookup of the 043/044 columns — tolerated when those
    // migrations aren't applied (the fields just read as null).
    type Extra = { designation_id: string | null; clinic_id: string | null; staff_type: string | null };
    const extras = new Map<string, Extra>();
    const eRes = await ctx.supabase
      .from("profiles")
      .select("user_id, designation_id, clinic_id, staff_type")
      .eq("account_id", ctx.accountId);
    if (!eRes.error) {
      for (const r of eRes.data as ({ user_id: string } & Extra)[]) {
        extras.set(r.user_id, { designation_id: r.designation_id, clinic_id: r.clinic_id, staff_type: r.staff_type });
      }
    }

    const members: AccountMember[] = (data as ProfileRow[]).flatMap((row) => {
      // Defensive: the DB enum should never let an unknown role
      // through, but if a migration ever broadens the enum without
      // updating TS, skip the row rather than crash the page.
      if (!isAccountRole(row.account_role)) return [];
      return [
        {
          user_id: row.user_id,
          full_name: row.full_name ?? "",
          email: canSeeEmails ? row.email : null,
          avatar_url: row.avatar_url,
          role: row.account_role,
          joined_at: row.created_at,
          designation_id: extras.get(row.user_id)?.designation_id ?? null,
          clinic_id: extras.get(row.user_id)?.clinic_id ?? null,
          staff_type: extras.get(row.user_id)?.staff_type ?? null,
        },
      ];
    });

    return NextResponse.json({ members });
  } catch (err) {
    return toErrorResponse(err);
  }
}
