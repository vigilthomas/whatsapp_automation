import { NextResponse } from "next/server";

import { toErrorResponse } from "@/lib/auth/account";
import { requirePermission } from "@/lib/auth/permission-guard";
import { isAccountRole, type AccountRole } from "@/lib/auth/roles";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

// ============================================================
// POST /api/account/users — create a login for a staff member and
// place it straight into the caller's clinic (account).
//
// The invite-link flow (Settings → Team members) asks the person to
// sign up themselves. Clinic admins adding a doctor or assistant want
// to type name / email / password and be done, so this route does the
// signup on their behalf:
//
//   1. auth.admin.createUser  — email pre-confirmed; the 017
//      `handle_new_user` trigger bootstraps a personal account + an
//      owner profile for it, exactly as a self-signup would.
//   2. Move the profile into the caller's account with the requested
//      role / designation / clinic / staff type (service role — the
//      034/043/044 trigger blocks `authenticated` from these columns).
//   3. Delete the now-empty personal account (same clean-up
//      `redeem_invitation` does).
//   4. For doctors, insert a `doctors` row linked by user_id so they
//      can be booked immediately.
//
// Gated on `users:write` — the designation matrix, not just the role.
// Owner can't be granted here (ownership goes through transfer).
// ============================================================

const STAFF_TYPES = ["doctor", "assistant", "other"] as const;
type StaffType = (typeof STAFF_TYPES)[number];

interface Body {
  full_name?: unknown;
  email?: unknown;
  password?: unknown;
  role?: unknown;
  designation_id?: unknown;
  clinic_id?: unknown;
  staff_type?: unknown;
  speciality?: unknown;
  phone?: unknown;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requirePermission("users", "write");
  } catch (err) {
    return toErrorResponse(err);
  }

  const limit = checkRateLimit(`admin:createUser:${ctx.userId}`, RATE_LIMITS.adminAction);
  if (!limit.success) return rateLimitResponse(limit);

  const body = ((await request.json().catch(() => null)) ?? {}) as Body;

  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const role: AccountRole = isAccountRole(body.role) ? body.role : "agent";
  const staffType: StaffType | null =
    typeof body.staff_type === "string" && (STAFF_TYPES as readonly string[]).includes(body.staff_type)
      ? (body.staff_type as StaffType)
      : null;
  const designationId = typeof body.designation_id === "string" && body.designation_id ? body.designation_id : null;
  const clinicId = typeof body.clinic_id === "string" && body.clinic_id ? body.clinic_id : null;
  const speciality = typeof body.speciality === "string" ? body.speciality.trim() || null : null;
  const phone = typeof body.phone === "string" ? body.phone.trim() || null : null;

  if (!fullName) return NextResponse.json({ error: "full_name is required" }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  if (role === "owner") {
    return NextResponse.json({ error: "Use transfer-ownership to make someone owner" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // Referenced designation / clinic must be this account's.
  if (designationId) {
    const { data } = await admin
      .from("designations")
      .select("id")
      .eq("id", designationId)
      .eq("account_id", ctx.accountId)
      .maybeSingle();
    if (!data) return NextResponse.json({ error: "designation not found" }, { status: 400 });
  }
  if (clinicId) {
    const { data } = await admin
      .from("clinics")
      .select("id")
      .eq("id", clinicId)
      .eq("account_id", ctx.accountId)
      .maybeSingle();
    if (!data) return NextResponse.json({ error: "clinic not found" }, { status: 400 });
  }

  // 1. Create the login.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createErr || !created.user) {
    const msg = createErr?.message ?? "Could not create user";
    const status = /already|exists|registered/i.test(msg) ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
  const newUserId = created.user.id;

  // The trigger runs inside the same transaction as the auth insert, so
  // the profile exists by the time createUser resolves.
  const { data: profile } = await admin
    .from("profiles")
    .select("account_id")
    .eq("user_id", newUserId)
    .maybeSingle();
  const personalAccountId = profile?.account_id as string | undefined;

  // 2. Move into this account.
  const { error: moveErr } = await admin
    .from("profiles")
    .update({
      account_id: ctx.accountId,
      account_role: role,
      designation_id: designationId,
      clinic_id: clinicId,
      staff_type: staffType,
    })
    .eq("user_id", newUserId);
  if (moveErr) {
    // Don't leave a half-made login around.
    await admin.auth.admin.deleteUser(newUserId);
    return NextResponse.json({ error: moveErr.message }, { status: 500 });
  }

  // 3. Drop the bootstrap personal account (empty by construction).
  if (personalAccountId && personalAccountId !== ctx.accountId) {
    await admin.from("accounts").delete().eq("id", personalAccountId).eq("owner_user_id", newUserId);
  }

  // 4. Doctors get a bookable record.
  let doctorId: string | null = null;
  if (staffType === "doctor") {
    const { data: doc } = await admin
      .from("doctors")
      .insert({
        account_id: ctx.accountId,
        clinic_id: clinicId,
        user_id: newUserId,
        name: fullName,
        email,
        phone,
        speciality,
      })
      .select("id")
      .single();
    doctorId = doc?.id ?? null;
  }

  return NextResponse.json(
    { user_id: newUserId, doctor_id: doctorId },
    { status: 201 },
  );
}
