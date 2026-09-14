// ============================================================
// Doctor tool implementations.
//
// All queries are scoped by clinicId and accountId from the
// server-side ClinicContext — never from model-generated args.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClinicContext } from './types'

/** List all active doctors at the clinic. */
export async function listDoctors(
  db: SupabaseClient,
  ctx: ClinicContext,
): Promise<unknown> {
  const { data, error } = await db
    .from('doctors')
    .select('id, name, speciality, phone')
    .eq('account_id', ctx.accountId)
    .eq('clinic_id', ctx.clinicId)
    .eq('is_active', true)
    .order('name')

  if (error) throw error
  if (!data || data.length === 0) {
    return { doctors: [], message: 'No active doctors found at this clinic.' }
  }
  return { doctors: data }
}

/** Get details for a specific doctor. */
export async function getDoctor(
  db: SupabaseClient,
  ctx: ClinicContext,
  args: { doctor_id: string },
): Promise<unknown> {
  const { data, error } = await db
    .from('doctors')
    .select('id, name, speciality, phone, email, notes')
    .eq('id', args.doctor_id)
    .eq('account_id', ctx.accountId)
    .eq('clinic_id', ctx.clinicId) // ← clinic guard
    .eq('is_active', true)
    .maybeSingle()

  if (error) throw error
  if (!data) return { found: false, message: 'Doctor not found at this clinic.' }
  return { found: true, doctor: data }
}

/** Get a doctor's booked appointments for a specific date. */
export async function getDoctorSchedule(
  db: SupabaseClient,
  ctx: ClinicContext,
  args: { doctor_id: string; date: string },
): Promise<unknown> {
  // Parse the date and create start/end boundaries for the day.
  const dayStart = new Date(`${args.date}T00:00:00`)
  const dayEnd = new Date(`${args.date}T23:59:59`)

  if (Number.isNaN(dayStart.getTime())) {
    return { error: 'Invalid date format. Use YYYY-MM-DD.' }
  }

  const { data, error } = await db
    .from('appointments')
    .select('id, starts_at, ends_at, service, status, contact:contacts!inner(name, phone)')
    .eq('doctor_id', args.doctor_id)
    .eq('account_id', ctx.accountId)
    .eq('clinic_id', ctx.clinicId)
    .gte('starts_at', dayStart.toISOString())
    .lte('starts_at', dayEnd.toISOString())
    .in('status', ['scheduled', 'confirmed'])
    .order('starts_at')

  if (error) throw error
  return {
    doctor_id: args.doctor_id,
    date: args.date,
    booked_slots: (data ?? []).map((a) => ({
      id: a.id,
      starts_at: a.starts_at,
      ends_at: a.ends_at,
      service: a.service,
      status: a.status,
      patient_name: a.contact?.[0]?.name ?? 'Unknown',
    })),
  }
}
