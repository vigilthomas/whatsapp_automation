import type { supabaseAdmin } from '@/lib/automations/admin-client'

/**
 * Login on/off for members, and giving an existing doctor a login
 * (Master → Users and Master → Doctors → Login switch).
 *
 * The block is a Supabase Auth ban: it stops sign-in and token refresh
 * at once, though an access token already issued keeps working until
 * it expires (about an hour). `profiles.login_disabled` (migration 070)
 * mirrors it so the lists can show the state without an Auth admin call
 * per row. The ban goes first and is undone if the mirror can't be
 * written, so the two never disagree for long.
 *
 * All of this runs on the service-role client; every query is pinned
 * to the caller's account by hand (no RLS on this path).
 */

type Admin = ReturnType<typeof supabaseAdmin>

export type LoginResult = { ok: true } | { ok: false; status: number; error: string }

/** Supabase has no "forever" ban; 100 years is the usual stand-in. */
export const BAN_FOREVER = '876000h'

const fail = (status: number, error: string) => ({ ok: false as const, status, error })

export async function setLoginEnabled(
  admin: Admin,
  who: { accountId: string; callerId: string },
  userId: string,
  enabled: boolean,
): Promise<LoginResult> {
  if (!enabled && userId === who.callerId) return fail(400, "You can't switch off your own login")
  const { data: target } = await admin
    .from('profiles')
    .select('account_role')
    .eq('user_id', userId)
    .eq('account_id', who.accountId)
    .maybeSingle()
  if (!target) return fail(404, 'user not found')
  if (!enabled && (target as { account_role?: string }).account_role === 'owner') {
    return fail(400, "The owner's login can't be switched off")
  }

  const ban = (on: boolean) => admin.auth.admin.updateUserById(userId, { ban_duration: on ? BAN_FOREVER : 'none' })
  const { error: banError } = await ban(!enabled)
  if (banError) {
    console.error('[login-access] ban change failed:', banError)
    return fail(500, 'Could not change the login')
  }
  const { error } = await admin
    .from('profiles')
    .update({ login_disabled: !enabled })
    .eq('user_id', userId)
    .eq('account_id', who.accountId)
  if (error) {
    await ban(enabled)
    console.error('[login-access] login_disabled not saved (is migration 070 applied?):', error)
    return fail(500, 'Could not change the login. Has migration 070 been run?')
  }
  return { ok: true }
}

export interface DoctorForLogin {
  id: string
  name: string
  branch_id: string | null
  email: string | null
  user_id: string | null
}

/** The doctor to give a login to: this account's, not deleted, no login yet. */
export async function doctorForLogin(
  admin: Admin,
  accountId: string,
  doctorId: string,
): Promise<{ ok: true; doctor: DoctorForLogin } | { ok: false; status: number; error: string }> {
  const { data } = await admin
    .from('doctors')
    .select('id, name, branch_id, email, user_id')
    .eq('id', doctorId)
    .eq('account_id', accountId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!data) return fail(400, 'doctor not found')
  const doctor = data as DoctorForLogin
  if (doctor.user_id) return fail(409, 'This doctor already has a login')
  return { ok: true, doctor }
}

/** Point the doctor row at the new login; false if it got one meanwhile. */
export async function linkDoctorLogin(admin: Admin, accountId: string, doctorId: string, userId: string): Promise<boolean> {
  const { data, error } = await admin
    .from('doctors')
    .update({ user_id: userId })
    .eq('id', doctorId)
    .eq('account_id', accountId)
    .is('user_id', null)
    .select('id')
  if (error) throw error
  return Array.isArray(data) && data.length > 0
}
