import type { supabaseAdmin } from '@/lib/automations/admin-client'
import { can, parsePermissions } from '@/lib/auth/permissions'
import { parseVocabulary, resolveTerms } from '@/lib/vocabulary'

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

/**
 * Common titles of people customers book with, across the sectors the
 * product is sold to. A role whose name contains one of these, or the
 * install's own staff word (Settings → Branding → Business type, e.g.
 * "Barber"), makes its members bookable. "doctor" stays the internal name
 * for "bookable staff"; the UI calls them by the install's word.
 */
const BOOKABLE_TITLES =
  /\bdoctor\b|\bdr\b|physician|surgeon|dentist|therapist|consultant|stylist|barber|beautician|trainer|coach|tutor|instructor|specialist|practitioner|artist/i

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** True when a role's name says its members take bookings. */
export function isBookableRole(name: string, staffWords: readonly string[] = []): boolean {
  if (BOOKABLE_TITLES.test(name)) return true
  return staffWords.some((w) => {
    const word = w.trim()
    return word.length >= 2 && new RegExp(`(^|[^\\p{L}])${escapeRe(word)}($|[^\\p{L}])`, 'iu').test(name)
  })
}

/** Staff type implied by a role's name ("Doctor", "Stylist", the install's own staff word → bookable). */
export function staffTypeFromRole(name: string, staffWords: readonly string[] = []): StaffType {
  if (isBookableRole(name, staffWords)) return 'doctor'
  if (/assistant|nurse|receptionist/i.test(name)) return 'assistant'
  return 'other'
}

/** The install's staff words (singular and plural) for `isBookableRole`. */
export async function loadStaffWords(admin: ReturnType<typeof supabaseAdmin>): Promise<string[]> {
  const { data, error } = await admin.from('app_branding').select('vocabulary').eq('id', 1).maybeSingle()
  if (error || !data) return []
  const terms = resolveTerms(parseVocabulary((data as { vocabulary: unknown }).vocabulary))
  return [terms.staff.one, terms.staff.many]
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
