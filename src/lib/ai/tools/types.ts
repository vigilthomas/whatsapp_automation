// ============================================================
// Shared types for tool implementations.
//
// Extracted from executor.ts to break the circular dependency:
// executor → appointment/doctor/patient → executor.
// ============================================================

/**
 * Server-side context for tool execution. Determined by the backend
 * from the inbound WhatsApp message — never from model output.
 */
export interface ClinicContext {
  accountId: string
  clinicId: string
  /** The contact record of the patient who sent the message. */
  patientId: string
  conversationId: string
}
