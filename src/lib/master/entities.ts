// ============================================================
// Clinic master-data registry — pure, no I/O.
//
// One declarative description per entity (clinics, doctors, clinic
// admins) drives everything else: the API route validates request
// bodies against it, and the Master pages render list columns and
// the add/edit form from it. Adding a field is one entry here plus
// the column in the migration — no per-entity route or form code.
//
// Tables come from migration 038_clinic_master_data.sql; keep the two
// in sync when adding fields.
// ============================================================

export const MASTER_ENTITY_SLUGS = ["clinics", "doctors", "clinic-admins"] as const;
export type MasterEntitySlug = (typeof MASTER_ENTITY_SLUGS)[number];

export type MasterFieldType = "text" | "textarea" | "boolean" | "clinic";

export interface MasterField {
  key: string;
  /** i18n key under `Master.fields`. */
  labelKey: string;
  type: MasterFieldType;
  required?: boolean;
  /** Show as a column in the list view. */
  list?: boolean;
  /** Free-text max length (server-enforced). Defaults to 200; textarea 2000. */
  maxLength?: number;
}

export interface MasterEntity {
  slug: MasterEntitySlug;
  /** Postgres table name. */
  table: "clinics" | "doctors" | "clinic_admins";
  /** i18n key under `Master.entities`. */
  labelKey: string;
  fields: MasterField[];
}

const name: MasterField = { key: "name", labelKey: "name", type: "text", required: true, list: true };
const phone: MasterField = { key: "phone", labelKey: "phone", type: "text", list: true };
const email: MasterField = { key: "email", labelKey: "email", type: "text", list: true };
const notes: MasterField = { key: "notes", labelKey: "notes", type: "textarea" };
const isActive: MasterField = { key: "is_active", labelKey: "isActive", type: "boolean", list: true };
const clinic: MasterField = { key: "clinic_id", labelKey: "clinic", type: "clinic", list: true };

export const MASTER_ENTITIES: Record<MasterEntitySlug, MasterEntity> = {
  clinics: {
    slug: "clinics",
    table: "clinics",
    labelKey: "clinics",
    fields: [
      name,
      phone,
      email,
      { key: "address", labelKey: "address", type: "text", maxLength: 500 },
      { key: "city", labelKey: "city", type: "text", list: true },
      notes,
      isActive,
    ],
  },
  doctors: {
    slug: "doctors",
    table: "doctors",
    labelKey: "doctors",
    fields: [
      name,
      { key: "speciality", labelKey: "speciality", type: "text", list: true },
      clinic,
      phone,
      { key: "whatsapp_number", labelKey: "whatsappNumber", type: "text" },
      email,
      notes,
      isActive,
    ],
  },
  "clinic-admins": {
    slug: "clinic-admins",
    table: "clinic_admins",
    labelKey: "clinicAdmins",
    fields: [name, clinic, phone, email, notes, isActive],
  },
};

export function isMasterEntitySlug(value: unknown): value is MasterEntitySlug {
  return (
    typeof value === "string" &&
    (MASTER_ENTITY_SLUGS as readonly string[]).includes(value)
  );
}

/** A record as returned by the API: id + every field + timestamps. */
export type MasterRecord = { id: string; created_at: string; updated_at: string } & Record<
  string,
  unknown
>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SanitizeResult =
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Validate and coerce a request body into column values for `entity`.
 *
 * - `partial: false` (create): every `required` field must be present
 *   and non-empty; absent optional fields are written as null/default.
 * - `partial: true` (update): only keys present in `body` are touched;
 *   a required field may not be cleared.
 *
 * Unknown keys are ignored rather than rejected, so a client running
 * a newer field list against an older server degrades gracefully.
 * `clinic` fields must be a UUID or null — existence/tenancy of the
 * referenced clinic is the caller's job (the route checks it against
 * the account before writing).
 */
export function sanitizeMasterInput(
  entity: MasterEntity,
  body: unknown,
  { partial }: { partial: boolean },
): SanitizeResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid JSON body" };
  }
  const input = body as Record<string, unknown>;
  const values: Record<string, unknown> = {};

  for (const field of entity.fields) {
    const present = Object.prototype.hasOwnProperty.call(input, field.key);
    if (!present) {
      if (!partial && field.required) {
        return { ok: false, error: `${field.key} is required` };
      }
      continue;
    }
    const raw = input[field.key];

    switch (field.type) {
      case "text":
      case "textarea": {
        if (raw !== null && typeof raw !== "string") {
          return { ok: false, error: `${field.key} must be a string` };
        }
        const trimmed = (raw ?? "").trim();
        if (!trimmed) {
          if (field.required) return { ok: false, error: `${field.key} is required` };
          values[field.key] = null;
          break;
        }
        const max = field.maxLength ?? (field.type === "textarea" ? 2000 : 200);
        if (trimmed.length > max) {
          return { ok: false, error: `${field.key} must be at most ${max} characters` };
        }
        values[field.key] = trimmed;
        break;
      }
      case "boolean": {
        if (typeof raw !== "boolean") {
          return { ok: false, error: `${field.key} must be true or false` };
        }
        values[field.key] = raw;
        break;
      }
      case "clinic": {
        if (raw === null || raw === "") {
          values[field.key] = null;
          break;
        }
        if (typeof raw !== "string" || !UUID_RE.test(raw)) {
          return { ok: false, error: `${field.key} must be a clinic id` };
        }
        values[field.key] = raw;
        break;
      }
    }
  }

  if (partial && Object.keys(values).length === 0) {
    return { ok: false, error: "No editable fields supplied" };
  }
  return { ok: true, values };
}
