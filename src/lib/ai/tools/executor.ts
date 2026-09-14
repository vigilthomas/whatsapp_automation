// ============================================================
// Secure tool executor.
//
// Dispatches a tool call from the model to the right implementation,
// always injecting the server-side ClinicContext. The model may pass
// doctor_id, date, etc. — but NEVER clinic_id or account_id.
//
// Every execution is timed and logged to ai_tool_calls_log.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ToolCallResult } from '../types'
import type { ClinicContext } from './types'
export type { ClinicContext }

// Patient tools
import { getPatient, createPatient, updatePatient } from './patient'
// Doctor tools
import { listDoctors, getDoctor, getDoctorSchedule } from './doctor'
// Appointment tools
import {
  getPatientAppointments,
  checkAvailability,
  bookAppointment,
  rescheduleAppointment,
  cancelAppointment,
} from './appointment'

/**
 * Execute a single tool call and return the result.
 * The model's arguments are passed through, but clinic/account
 * scoping always comes from `ctx`.
 */
export async function executeTool(
  ctx: ClinicContext,
  db: SupabaseClient,
  toolName: string,
  toolArgs: Record<string, unknown>,
): Promise<{ result: unknown; executionMs: number }> {
  const start = Date.now()

  let result: unknown
  try {
    switch (toolName) {
      // Patient
      case 'get_patient':
        result = await getPatient(db, ctx, toolArgs as { phone: string })
        break
      case 'create_patient':
        result = await createPatient(db, ctx, toolArgs as { name: string; phone: string })
        break
      case 'update_patient':
        result = await updatePatient(
          db,
          ctx,
          toolArgs as { patient_id: string; name: string },
        )
        break

      // Doctor
      case 'list_doctors':
        result = await listDoctors(db, ctx)
        break
      case 'get_doctor':
        result = await getDoctor(db, ctx, toolArgs as { doctor_id: string })
        break
      case 'get_doctor_schedule':
        result = await getDoctorSchedule(
          db,
          ctx,
          toolArgs as { doctor_id: string; date: string },
        )
        break

      // Appointment
      case 'get_patient_appointments':
        result = await getPatientAppointments(
          db,
          ctx,
          toolArgs as { patient_id: string },
        )
        break
      case 'check_availability':
        result = await checkAvailability(
          db,
          ctx,
          toolArgs as { doctor_id: string; date: string },
        )
        break
      case 'book_appointment':
        result = await bookAppointment(db, ctx, toolArgs as {
          patient_id: string
          doctor_id: string
          service: string
          starts_at: string
          ends_at: string
          notes?: string
        })
        break
      case 'reschedule_appointment':
        result = await rescheduleAppointment(db, ctx, toolArgs as {
          appointment_id: string
          starts_at: string
          ends_at: string
        })
        break
      case 'cancel_appointment':
        result = await cancelAppointment(db, ctx, toolArgs as {
          appointment_id: string
          reason?: string
        })
        break

      default:
        result = { error: `Unknown tool: ${toolName}` }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[tool executor] ${toolName} failed:`, err)
    result = { error: `Tool execution failed: ${msg}` }
  }

  const executionMs = Date.now() - start
  return { result, executionMs }
}

/**
 * Execute a tool call, log it to the audit table, and return a
 * `ToolCallResult` ready for the generate loop.
 */
export async function executeAndLogTool(
  ctx: ClinicContext,
  db: SupabaseClient,
  toolCallId: string,
  toolName: string,
  toolArgs: Record<string, unknown>,
): Promise<ToolCallResult> {
  const { result, executionMs } = await executeTool(ctx, db, toolName, toolArgs)

  // Best-effort audit log — never block the reply on a failed insert.
  try {
    await db.from('ai_tool_calls_log').insert({
      account_id: ctx.accountId,
      clinic_id: ctx.clinicId,
      conversation_id: ctx.conversationId,
      tool_name: toolName,
      tool_args: toolArgs,
      tool_result: result,
      execution_ms: executionMs,
    })
  } catch (err) {
    console.error('[tool executor] audit log insert failed:', err)
  }

  return {
    toolCallId,
    toolName,
    args: toolArgs,
    result,
    executionMs,
  }
}
