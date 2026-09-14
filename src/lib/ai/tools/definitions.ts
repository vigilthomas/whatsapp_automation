// ============================================================
// Tool definitions — OpenAI function-calling JSON schemas.
//
// Each definition describes a tool the clinic AI can call. The
// schemas are sent to the model as part of the chat completions
// request; the model returns `tool_calls` with the function name
// and arguments. The executor validates and runs them.
//
// Permissions: each tool has a `permission` field that maps to
// a boolean on `ClinicAiConfig` (e.g., `allow_booking`). When the
// permission is false, the tool is excluded from the request.
// ============================================================

import type { ToolDefinition } from '../providers/shared'

export interface ToolSpec extends ToolDefinition {
  /** Which clinic_ai_configs permission gates this tool.
   *  null means always available (no permission needed). */
  permission: string | null
}

export const TOOL_SPECS: ToolSpec[] = [
  // ── Patient tools ──────────────────────────────────────────

  {
    type: 'function',
    permission: null,
    function: {
      name: 'get_patient',
      description:
        'Look up a patient by their phone number. Returns the patient\'s name, phone, and ID if they exist in the clinic\'s records.',
      parameters: {
        type: 'object',
        properties: {
          phone: {
            type: 'string',
            description: 'The patient\'s phone number (with country code, e.g. +919876543210).',
          },
        },
        required: ['phone'],
        additionalProperties: false,
      },
    },
  },

  {
    type: 'function',
    permission: 'allow_patient_creation',
    function: {
      name: 'create_patient',
      description:
        'Register a new patient. Use only when the patient does not already exist (checked with get_patient first). Returns the created patient record.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The patient\'s full name.',
          },
          phone: {
            type: 'string',
            description: 'The patient\'s phone number with country code.',
          },
        },
        required: ['name', 'phone'],
        additionalProperties: false,
      },
    },
  },

  {
    type: 'function',
    permission: null,
    function: {
      name: 'update_patient',
      description:
        'Update a patient\'s name. The patient must already exist.',
      parameters: {
        type: 'object',
        properties: {
          patient_id: { type: 'string', description: 'The patient\'s UUID.' },
          name: { type: 'string', description: 'The new name for the patient.' },
        },
        required: ['patient_id', 'name'],
        additionalProperties: false,
      },
    },
  },

  // ── Doctor tools ───────────────────────────────────────────

  {
    type: 'function',
    permission: null,
    function: {
      name: 'list_doctors',
      description:
        'List all active doctors at this clinic. Returns each doctor\'s name, speciality, and ID.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },

  {
    type: 'function',
    permission: null,
    function: {
      name: 'get_doctor',
      description:
        'Get details for a specific doctor by ID. Returns name, speciality, and contact information.',
      parameters: {
        type: 'object',
        properties: {
          doctor_id: { type: 'string', description: 'The doctor\'s UUID.' },
        },
        required: ['doctor_id'],
        additionalProperties: false,
      },
    },
  },

  {
    type: 'function',
    permission: null,
    function: {
      name: 'get_doctor_schedule',
      description:
        'Get a doctor\'s booked appointment slots for a specific date. Returns a list of times that are already booked, so you can determine which slots are available.',
      parameters: {
        type: 'object',
        properties: {
          doctor_id: { type: 'string', description: 'The doctor\'s UUID.' },
          date: {
            type: 'string',
            description: 'The date to check, in YYYY-MM-DD format.',
          },
        },
        required: ['doctor_id', 'date'],
        additionalProperties: false,
      },
    },
  },

  // ── Appointment tools ──────────────────────────────────────

  {
    type: 'function',
    permission: null,
    function: {
      name: 'get_patient_appointments',
      description:
        'Get a patient\'s upcoming and recent past appointments (last 30 days, next 30 days). Returns appointment details including doctor, service, time, and status.',
      parameters: {
        type: 'object',
        properties: {
          patient_id: { type: 'string', description: 'The patient\'s UUID (contact ID).' },
        },
        required: ['patient_id'],
        additionalProperties: false,
      },
    },
  },

  {
    type: 'function',
    permission: null,
    function: {
      name: 'check_availability',
      description:
        'Check which time slots are available for a doctor on a given date. Returns a list of available 30-minute slots during working hours (9 AM to 6 PM).',
      parameters: {
        type: 'object',
        properties: {
          doctor_id: { type: 'string', description: 'The doctor\'s UUID.' },
          date: {
            type: 'string',
            description: 'The date to check availability, in YYYY-MM-DD format.',
          },
        },
        required: ['doctor_id', 'date'],
        additionalProperties: false,
      },
    },
  },

  {
    type: 'function',
    permission: 'allow_booking',
    function: {
      name: 'book_appointment',
      description:
        'Book a new appointment for a patient with a doctor. The slot must be available (use check_availability first). Returns the created appointment.',
      parameters: {
        type: 'object',
        properties: {
          patient_id: { type: 'string', description: 'The patient\'s UUID (contact ID).' },
          doctor_id: { type: 'string', description: 'The doctor\'s UUID.' },
          service: {
            type: 'string',
            description: 'The service/reason for the appointment (e.g. "General Checkup", "Dental Cleaning").',
          },
          starts_at: {
            type: 'string',
            description: 'Appointment start time in ISO 8601 format (e.g. "2024-03-15T10:00:00+05:30").',
          },
          ends_at: {
            type: 'string',
            description: 'Appointment end time in ISO 8601 format (e.g. "2024-03-15T10:30:00+05:30").',
          },
          notes: {
            type: 'string',
            description: 'Optional notes about the appointment.',
          },
        },
        required: ['patient_id', 'doctor_id', 'service', 'starts_at', 'ends_at'],
        additionalProperties: false,
      },
    },
  },

  {
    type: 'function',
    permission: 'allow_rescheduling',
    function: {
      name: 'reschedule_appointment',
      description:
        'Reschedule an existing appointment to a new time. The appointment must be in scheduled or confirmed status. The new slot must be available.',
      parameters: {
        type: 'object',
        properties: {
          appointment_id: { type: 'string', description: 'The appointment\'s UUID.' },
          starts_at: {
            type: 'string',
            description: 'New start time in ISO 8601 format.',
          },
          ends_at: {
            type: 'string',
            description: 'New end time in ISO 8601 format.',
          },
        },
        required: ['appointment_id', 'starts_at', 'ends_at'],
        additionalProperties: false,
      },
    },
  },

  {
    type: 'function',
    permission: 'allow_cancellation',
    function: {
      name: 'cancel_appointment',
      description:
        'Cancel an existing appointment. The appointment must be in scheduled or confirmed status.',
      parameters: {
        type: 'object',
        properties: {
          appointment_id: { type: 'string', description: 'The appointment\'s UUID.' },
          reason: {
            type: 'string',
            description: 'Reason for cancellation (stored in notes).',
          },
        },
        required: ['appointment_id'],
        additionalProperties: false,
      },
    },
  },
]

/** Filter tool specs to only those the clinic's config allows. */
export function filterAllowedTools(
  config: Record<string, boolean>,
): ToolSpec[] {
  return TOOL_SPECS.filter((spec) => {
    if (!spec.permission) return true
    return config[spec.permission] === true
  })
}

/** Extract just the ToolDefinition shape (no permission field)
 *  for sending to the provider. */
export function toToolDefinitions(specs: ToolSpec[]): ToolDefinition[] {
  return specs.map(({ type, function: fn }) => ({ type, function: fn }))
}
