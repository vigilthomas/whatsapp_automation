// ============================================================
// Appointment tool implementations.
//
// All queries are scoped by clinicId and accountId from the
// server-side ClinicContext. The model's arguments provide
// doctor_id, dates, etc. but never clinic_id or account_id.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClinicContext } from './types'

/** Get a patient's upcoming and recent past appointments. */
export async function getPatientAppointments(
  db: SupabaseClient,
  ctx: ClinicContext,
  args: { patient_id: string },
): Promise<unknown> {
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const thirtyDaysAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const { data, error } = await db
    .from('appointments')
    .select(
      'id, starts_at, ends_at, service, status, source, notes, ' +
      'doctor:doctors(id, name, speciality), clinic:clinics(id, name)',
    )
    .eq('contact_id', args.patient_id)
    .eq('account_id', ctx.accountId)
    .eq('clinic_id', ctx.clinicId) // ← only this clinic's appointments
    .gte('starts_at', thirtyDaysAgo.toISOString())
    .lte('starts_at', thirtyDaysAhead.toISOString())
    .order('starts_at', { ascending: true })

  if (error) throw error
  return { appointments: data ?? [] }
}

/** Check which time slots are available for a doctor on a date. */
export async function checkAvailability(
  db: SupabaseClient,
  ctx: ClinicContext,
  args: { doctor_id: string; date: string },
): Promise<unknown> {
  const dayStart = new Date(`${args.date}T00:00:00`)
  if (Number.isNaN(dayStart.getTime())) {
    return { error: 'Invalid date format. Use YYYY-MM-DD.' }
  }

  // Working hours: 9 AM to 6 PM, 30-minute slots. TODO: make
  // configurable per clinic/doctor.
  const WORK_START = 9
  const WORK_END = 18
  const SLOT_MINUTES = 30

  // Get all booked appointments for this doctor on this date.
  const dayEnd = new Date(`${args.date}T23:59:59`)
  const { data: booked, error } = await db
    .from('appointments')
    .select('starts_at, ends_at')
    .eq('doctor_id', args.doctor_id)
    .eq('account_id', ctx.accountId)
    .eq('clinic_id', ctx.clinicId)
    .gte('starts_at', dayStart.toISOString())
    .lte('starts_at', dayEnd.toISOString())
    .in('status', ['scheduled', 'confirmed'])

  if (error) throw error

  // Build all possible slots, then filter out booked ones.
  const bookedRanges = (booked ?? []).map((a) => ({
    start: new Date(a.starts_at).getTime(),
    end: new Date(a.ends_at).getTime(),
  }))

  const available: { starts_at: string; ends_at: string }[] = []
  for (let hour = WORK_START; hour < WORK_END; hour++) {
    for (let min = 0; min < 60; min += SLOT_MINUTES) {
      const slotStart = new Date(dayStart)
      slotStart.setHours(hour, min, 0, 0)
      const slotEnd = new Date(slotStart.getTime() + SLOT_MINUTES * 60 * 1000)

      // Skip slots in the past.
      if (slotStart.getTime() < Date.now()) continue

      // Check overlap with booked slots.
      const overlaps = bookedRanges.some(
        (b) => slotStart.getTime() < b.end && slotEnd.getTime() > b.start,
      )
      if (!overlaps) {
        available.push({
          starts_at: slotStart.toISOString(),
          ends_at: slotEnd.toISOString(),
        })
      }
    }
  }

  return {
    doctor_id: args.doctor_id,
    date: args.date,
    available_slots: available,
    total_available: available.length,
  }
}

/** Book a new appointment. */
export async function bookAppointment(
  db: SupabaseClient,
  ctx: ClinicContext,
  args: {
    patient_id: string
    doctor_id: string
    service: string
    starts_at: string
    ends_at: string
    notes?: string
  },
): Promise<unknown> {
  // Validate the doctor belongs to this clinic.
  const { data: doctor } = await db
    .from('doctors')
    .select('id, name')
    .eq('id', args.doctor_id)
    .eq('clinic_id', ctx.clinicId)
    .eq('is_active', true)
    .maybeSingle()

  if (!doctor) {
    return { booked: false, error: 'Doctor not found at this clinic.' }
  }

  // Validate start/end times.
  const startsAt = new Date(args.starts_at)
  const endsAt = new Date(args.ends_at)
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return { booked: false, error: 'Invalid date/time format.' }
  }
  if (endsAt <= startsAt) {
    return { booked: false, error: 'End time must be after start time.' }
  }
  if (startsAt.getTime() < Date.now()) {
    return { booked: false, error: 'Cannot book an appointment in the past.' }
  }

  // Check for conflicts.
  const { data: conflicts } = await db
    .from('appointments')
    .select('id')
    .eq('doctor_id', args.doctor_id)
    .eq('clinic_id', ctx.clinicId)
    .in('status', ['scheduled', 'confirmed'])
    .lt('starts_at', endsAt.toISOString())
    .gt('ends_at', startsAt.toISOString())
    .limit(1)

  if (conflicts && conflicts.length > 0) {
    return { booked: false, error: 'This time slot is already booked.' }
  }

  const { data, error } = await db
    .from('appointments')
    .insert({
      account_id: ctx.accountId,
      clinic_id: ctx.clinicId,
      doctor_id: args.doctor_id,
      contact_id: args.patient_id,
      service: args.service.trim(),
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: 'scheduled',
      source: 'ai',
      notes: args.notes?.trim() || null,
    })
    .select('id, starts_at, ends_at, service, status, source')
    .single()

  if (error) throw error
  return {
    booked: true,
    appointment: data,
    doctor_name: doctor.name,
  }
}

/** Reschedule an existing appointment to a new time. */
export async function rescheduleAppointment(
  db: SupabaseClient,
  ctx: ClinicContext,
  args: { appointment_id: string; starts_at: string; ends_at: string },
): Promise<unknown> {
  // Find the appointment — must be in this clinic + reschedulable status.
  const { data: appt } = await db
    .from('appointments')
    .select('id, doctor_id, status')
    .eq('id', args.appointment_id)
    .eq('clinic_id', ctx.clinicId)
    .eq('account_id', ctx.accountId)
    .in('status', ['scheduled', 'confirmed'])
    .maybeSingle()

  if (!appt) {
    return { rescheduled: false, error: 'Appointment not found or cannot be rescheduled.' }
  }

  const startsAt = new Date(args.starts_at)
  const endsAt = new Date(args.ends_at)
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return { rescheduled: false, error: 'Invalid date/time format.' }
  }
  if (endsAt <= startsAt) {
    return { rescheduled: false, error: 'End time must be after start time.' }
  }
  if (startsAt.getTime() < Date.now()) {
    return { rescheduled: false, error: 'Cannot reschedule to a past time.' }
  }

  // Check for conflicts at the new time (exclude this appointment).
  const { data: conflicts } = await db
    .from('appointments')
    .select('id')
    .eq('doctor_id', appt.doctor_id)
    .eq('clinic_id', ctx.clinicId)
    .neq('id', args.appointment_id)
    .in('status', ['scheduled', 'confirmed'])
    .lt('starts_at', endsAt.toISOString())
    .gt('ends_at', startsAt.toISOString())
    .limit(1)

  if (conflicts && conflicts.length > 0) {
    return { rescheduled: false, error: 'The new time slot is already booked.' }
  }

  const { data, error } = await db
    .from('appointments')
    .update({
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
    })
    .eq('id', args.appointment_id)
    .eq('clinic_id', ctx.clinicId) // ← tenant guard
    .select('id, starts_at, ends_at, service, status')
    .single()

  if (error) throw error
  return { rescheduled: true, appointment: data }
}

/** Cancel an appointment. */
export async function cancelAppointment(
  db: SupabaseClient,
  ctx: ClinicContext,
  args: { appointment_id: string; reason?: string },
): Promise<unknown> {
  const { data: appt } = await db
    .from('appointments')
    .select('id, status')
    .eq('id', args.appointment_id)
    .eq('clinic_id', ctx.clinicId)
    .eq('account_id', ctx.accountId)
    .in('status', ['scheduled', 'confirmed'])
    .maybeSingle()

  if (!appt) {
    return { cancelled: false, error: 'Appointment not found or already cancelled/completed.' }
  }

  const update: Record<string, unknown> = { status: 'cancelled' }
  if (args.reason) {
    update.notes = `Cancelled by AI: ${args.reason.trim()}`
  }

  const { data, error } = await db
    .from('appointments')
    .update(update)
    .eq('id', args.appointment_id)
    .eq('clinic_id', ctx.clinicId) // ← tenant guard
    .select('id, status, notes')
    .single()

  if (error) throw error
  return { cancelled: true, appointment: data }
}
