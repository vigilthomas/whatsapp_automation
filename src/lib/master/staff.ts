import type { supabaseAdmin } from '@/lib/automations/admin-client'
import { can, parsePermissions } from '@/lib/auth/permissions'

// ============================================================
// Staff ⇄ doctors.
//
// There is no separate Doctors list any more: a doctor is a user whose
// role (designation) is a doctor role. Appointments and the booking
// assistant still need a `doctors` row to book against, so the Users
// routes keep one per doctor-user in step:
//
//   user gets a doctor role  → doctor row created (or brought back)
//   user's branch / name     → copied onto the doctor row
//   user loses the role or is removed → doctor row switched off
//
// Switched off, not deleted: past appointments keep their doctor.
// ============================================================

export type StaffType = 'doctor' | 'assistant' | 'other'

/** Staff type implied by a role's name ("Doctor", "Dr", "Dentist" → doctor). */
export function staffTypeFromRole(name: string): StaffType {
  if (/\bdoctor\b|\bdr\b|physician|surgeon|dentist|consultant/i.test(name)) return 'doctor'
  if (/assistant|nurse|receptionist/i.test(name)) return 'assistant'
  return 'other'
}

/**
 * Access level (account_role) implied by a role. Permissions come from
 * the role itself (Access control); the access level is only the
 * database safety net, so it follows the role: a role that may manage
 * users (or is named Admin / Manager / Owner) → admin, anything else → agent.
 */
export function accessLevelFromRole(name: string | null, permissions: unknown): 'admin' | 'agent' {
  if (name && /admin|manager|owner/i.test(name)) return 'admin'
  const perms = parsePermissions(permissions)
  return (['write', 'edit', 'delete'] as const).some((a) => can(perms, 'users', a)) ? 'admin' : 'agent'
}

type Admin = ReturnType<typeof supabaseAdmin>

export interface DoctorSync {
  accountId: string
  userId: string
  /** Whether this user should be a bookable doctor. */
  isDoctor: boolean
  /** Only fields given are written. */
  branchId?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
  speciality?: string | null
}

/** Create / update / switch off the doctor row that belongs to a user. */
export async function syncDoctorForUser(admin: Admin, s: DoctorSync): Promise<void> {
  const { data: existing, error } = await admin
    .from('doctors')
    .select('id')
    .eq('account_id', s.accountId)
    .eq('user_id', s.userId)
    .maybeSingle()
  if (error) throw error

  const details: Record<string, unknown> = {}
  if (s.branchId !== undefined) details.branch_id = s.branchId
  if (s.name) details.name = s.name
  if (s.email !== undefined) details.email = s.email
  if (s.phone !== undefined) details.phone = s.phone
  if (s.speciality !== undefined) details.speciality = s.speciality

  if (!s.isDoctor) {
    if (existing) {
      const { error: offError } = await admin
        .from('doctors')
        .update({ is_active: false })
        .eq('id', existing.id)
      if (offError) throw offError
    }
    return
  }

  if (existing) {
    const { error: upError } = await admin
      .from('doctors')
      .update({ ...details, is_active: true, deleted_at: null })
      .eq('id', existing.id)
    if (upError) throw upError
    return
  }

  let name = s.name ?? null
  if (!name) {
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, email')
      .eq('user_id', s.userId)
      .maybeSingle()
    name = (profile?.full_name as string | null) || (profile?.email as string | null) || 'Doctor'
  }
  const { error: insError } = await admin.from('doctors').insert({
    account_id: s.accountId,
    user_id: s.userId,
    ...details,
    name,
    is_active: true,
  })
  if (insError) throw insError
}

/** A removed user's doctor row is switched off and hidden. */
export async function retireDoctorForUser(admin: Admin, accountId: string, userId: string): Promise<void> {
  const { error } = await admin
    .from('doctors')
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('user_id', userId)
  if (error) throw error
}
