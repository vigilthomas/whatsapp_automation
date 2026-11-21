import { NextResponse } from "next/server";

import { toErrorResponse } from "@/lib/auth/account";
import { requirePermission } from "@/lib/auth/permission-guard";
import { isAccountRole, type AccountRole } from "@/lib/auth/roles";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { accessLevelFromRole, loadStaffWords, staffTypeFromRole, syncDoctorForUser, type StaffType } from "@/lib/master/staff";
import { doctorForLogin, linkDoctorLogin, type DoctorForLogin } from "@/lib/master/login-access";
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
// The form asks only for name / email / password / clinic /
// designation. Staff type and access level are DERIVED from the
// designation so admins don't juggle three overlapping concepts:
//   - a designation named like "Doctor" → staff_type 'doctor' (and a
//     bookable `doctors` row); "Assistant" → 'assistant'; else 'other'
//   - a designation named like "Admin" → account_role 'admin'; else
//     'agent'. What they can actually do comes from the designation's
//     permission matrix either way; the role only sets the RLS tier.
//
// `doctor_id` gives an EXISTING doctor (Master → Doctors → Login) the
// login instead: the doctor must be this account's and have none yet;
// they become staff type 'doctor' in the doctor's branch, and the row is
// linked by user_id rather than a second doctors row being made.
//
// Gated on `users:write` — the designation matrix, not just the role.
// Owner can't be granted here (ownership goes through transfer).
// ============================================================

const STAFF_TYPES = ["doctor", "assistant", "other"] as const satisfies readonly StaffType[];

interface Body {
  full_name?: unknown;
  email?: unknown;
  password?: unknown;
  role?: unknown;
  designation_id?: unknown;
  branch_id?: unknown;
  staff_type?: unknown;
  speciality?: unknown;
  phone?: unknown;
  doctor_id?: unknown;
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
  // Explicit values still accepted (API clients); the UI sends neither.
  let role: AccountRole = isAccountRole(body.role) ? body.role : "agent";
  let staffType: StaffType | null =
    typeof body.staff_type === "string" && (STAFF_TYPES as readonly string[]).includes(body.staff_type)
      ? (body.staff_type as StaffType)
      : null;
  const designationId = typeof body.designation_id === "string" && body.designation_id ? body.designation_id : null;
  let branchId = typeof body.branch_id === "string" && body.branch_id ? body.branch_id : null;
  const doctorId = typeof body.doctor_id === "string" && body.doctor_id ? body.doctor_id : null;
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

  // An existing doctor getting a login: they are a doctor, in their branch.
  let doctor: DoctorForLogin | null = null;
  if (doctorId) {
    const found = await doctorForLogin(admin, ctx.accountId, doctorId);
    if (!found.ok) return NextResponse.json({ error: found.error }, { status: found.status });
    doctor = found.doctor;
    staffType = "doctor";
    if (!branchId) branchId = doctor.branch_id;
  }

  // Referenced role / branch must be this account's.
  if (designationId) {
    const { data } = await admin
      .from("designations")
      .select("id, name, permissions")
      .eq("id", designationId)
      .eq("account_id", ctx.accountId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) return NextResponse.json({ error: "role not found" }, { status: 400 });
    const name = String(data.name ?? "");
    if (staffType === null) {
      staffType = staffTypeFromRole(name, await loadStaffWords(admin));
    }
    if (!isAccountRole(body.role)) {
      role = accessLevelFromRole(name, data.permissions);
    }
  }
  if (branchId) {
    const { data } = await admin
      .from("branches")
      .select("id")
      .eq("id", branchId)
      .eq("account_id", ctx.accountId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) return NextResponse.json({ error: "branch not found" }, { status: 400 });
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
      branch_id: branchId,
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

  // 4a. An existing doctor: link their row to the new login.
  if (doctor) {
    const linked = await linkDoctorLogin(admin, ctx.accountId, doctor.id, newUserId).catch((err) => {
      console.error("[users] doctor link failed:", err);
      return false;
    });
    if (!linked) {
      await admin.auth.admin.deleteUser(newUserId);
      return NextResponse.json({ error: "This doctor already has a login" }, { status: 409 });
    }
    if (!doctor.email) await admin.from("doctors").update({ email }).eq("id", doctor.id).eq("account_id", ctx.accountId);
  }
  // 4b. Otherwise doctors get a bookable record.
  else if (staffType === "doctor") {
    await syncDoctorForUser(admin, {
      accountId: ctx.accountId,
      userId: newUserId,
      isDoctor: true,
      branchId,
      name: fullName,
      email,
      phone,
      speciality,
    }).catch((err) => console.error("[users] doctor record failed:", err));
  }

  return NextResponse.json(
    { user_id: newUserId },
    { status: 201 },
  );
}
