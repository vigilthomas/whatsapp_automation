// ============================================================
// Clinic master-data registry — pure, no I/O.
//
// One declarative description per entity (branches, doctors, clinic
// admins, services, roles) drives everything else: the API route validates request
// bodies against it, and the Master pages render list columns and
// the add/edit form from it. Adding a field is one entry here plus
// the column in the migration — no per-entity route or form code.
//
// Tables come from migration 041_clinic_master_data.sql; keep the two
// in sync when adding fields.
// ============================================================

import { parsePermissions } from "@/lib/auth/permissions";
import type { ModuleId } from "@/lib/auth/module-access";

export const MASTER_ENTITY_SLUGS = [
  "branches",
  "doctors",
  "staff",
  "services",
  "doctor-services",
  "leaves",
  "designations",
] as const;
export type MasterEntitySlug = (typeof MASTER_ENTITY_SLUGS)[number];

/**
 * `number` — numeric input (see `min` / `step`); `branch` — pick from
 * the branches list (one clinic per install, many branches); `permissions` — the designation matrix, edited on
 * the Access control page rather than in the CRUD form (`form: false`).
 */
/** Fields that pick a record from another list (stored as its id). */
export const REF_TYPES = ["branch", "doctor", "service", "user"] as const;
export type RefType = (typeof REF_TYPES)[number];

export type MasterFieldType =
  | "text"
  | "textarea"
  | "boolean"
  | "number"
  | "date"
  | "select"
  | "duration"
  | RefType
  | "permissions";

export function isRefType(t: MasterFieldType): t is RefType {
  return (REF_TYPES as readonly string[]).includes(t);
}

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
  /** Hide from the add/edit dialog (still validated by the API). */
  form?: false;
  /** `number` fields: lower bound (inclusive) and input step. */
  min?: number;
  step?: number;
  /** `number` fields: render as money in the account currency. */
  money?: boolean;
  /** `number` fields: suffix shown in the list, e.g. "min". */
  unit?: string;
  /** Optional `number` fields: stored when left empty (else null). */
  empty?: number;
  /** `select` fields: allowed values; labels are `Master.options.<key>.<value>`. */
  options?: readonly string[];
  /** Only shown (and kept) when another field has this value. */
  showIf?: { key: string; equals: string | boolean };
  /**
   * A form-only switch (a checkbox in the dialog) that isn't saved: the
   * API ignores it, and its value on an existing record is worked out
   * from the record with `derive`.
   */
  virtual?: { derive: (record: Record<string, unknown>) => unknown; initial: unknown };
  /** Use another label while another field has this value (e.g. "Date" vs "From"). */
  labelIf?: { key: string; equals: string | boolean; labelKey: string };
  /**
   * Ref fields: when adding, pick several at once — one record is saved
   * per pick (the API takes `<key>s: [{ <key>, ...perPick }]`).
   */
  multiOnCreate?: true;
  /**
   * `duration` fields: empty means "use the default time of the service
   * picked in this field", and the form shows that default.
   */
  defaultFrom?: string;
}

export interface MasterEntity {
  slug: MasterEntitySlug;
  /** Postgres table name. */
  table: "branches" | "doctors" | "services" | "doctor_services" | "user_leaves" | "designations";
  /** Access-control module id checked by the API and the UI. */
  module: ModuleId;
  /**
   * Listed by the API but not edited through it, and with no Master
   * page of its own. Doctors: managed from Users (a user with a doctor
   * role gets a doctor record), read by Appointments and the booking
   * assistant.
   */
  readOnly?: true;
  /** i18n key under `Master.entities`. */
  labelKey: string;
  fields: MasterField[];
  /** List order; default name A→Z. */
  orderBy?: { column: string; ascending: boolean };
  /** Checks across fields after each one is valid; returns an error or null. */
  validate?: (values: Record<string, unknown>) => string | null;
}

const name: MasterField = { key: "name", labelKey: "name", type: "text", required: true, list: true };
const phone: MasterField = { key: "phone", labelKey: "phone", type: "text", list: true };
const email: MasterField = { key: "email", labelKey: "email", type: "text", list: true };
const notes: MasterField = { key: "notes", labelKey: "notes", type: "textarea" };
const isActive: MasterField = { key: "is_active", labelKey: "isActive", type: "boolean", list: true };
const branch: MasterField = { key: "branch_id", labelKey: "branch", type: "branch", list: true };

export const MASTER_ENTITIES: Record<MasterEntitySlug, MasterEntity> = {
  branches: {
    slug: "branches",
    table: "branches",
    module: "branches",
    labelKey: "branches",
    fields: [
      name,
      { key: "address", labelKey: "address", type: "text", maxLength: 500 },
      { key: "city", labelKey: "city", type: "text", list: true },
      phone,
      notes,
      isActive,
    ],
  },
  doctors: {
    slug: "doctors",
    table: "doctors",
    module: "appointments",
    readOnly: true,
    labelKey: "doctors",
    fields: [
      name,
      { key: "speciality", labelKey: "speciality", type: "text", list: true },
      branch,
      phone,
      { key: "whatsapp_number", labelKey: "whatsappNumber", type: "text" },
      email,
      notes,
      isActive,
    ],
  },
  // The same `doctors` table as above, as an editable Master page
  // (Master → Stylists / Doctors…, in the install's staff word). Two
  // entries on purpose: `doctors` stays gated by Appointments so anyone
  // who can book can still list who to book with, while adding and
  // editing bookable staff needs this page's own module. Bookable staff
  // can exist without a login (a stylist who never signs in); one who
  // has a login is still kept in step from Users (syncDoctorForUser),
  // so the API refuses to delete those here.
  staff: {
    slug: "staff",
    table: "doctors",
    module: "staff",
    labelKey: "doctors",
    fields: [
      name,
      { key: "speciality", labelKey: "speciality", type: "text", list: true },
      branch,
      phone,
      { key: "whatsapp_number", labelKey: "whatsappNumber", type: "text" },
      email,
      notes,
      isActive,
    ],
  },
  services: {
    slug: "services",
    table: "services",
    module: "services",
    labelKey: "services",
    fields: [
      name,
      { key: "duration_min", labelKey: "duration", type: "duration", required: true, list: true, min: 5 },
      { key: "buffer_min", labelKey: "buffer", type: "duration", list: true, empty: 0 },
      { key: "price", labelKey: "price", type: "number", list: true, min: 0, step: 0.01, money: true },
      { key: "description", labelKey: "description", type: "textarea" },
      isActive,
    ],
  },
  "doctor-services": {
    slug: "doctor-services",
    table: "doctor_services",
    module: "doctor-services",
    labelKey: "doctorServices",
    orderBy: { column: "created_at", ascending: true },
    fields: [
      { key: "doctor_id", labelKey: "doctor", type: "doctor", required: true, list: true },
      { key: "service_id", labelKey: "service", type: "service", required: true, list: true, multiOnCreate: true },
      { key: "duration_min", labelKey: "doctorTime", type: "duration", list: true, defaultFrom: "service_id" },
      { key: "notes", labelKey: "notes", type: "text", list: true, maxLength: 300 },
      isActive,
    ],
  },
  leaves: {
    slug: "leaves",
    table: "user_leaves",
    module: "leaves",
    labelKey: "leaves",
    orderBy: { column: "starts_on", ascending: false },
    fields: [
      { key: "user_id", labelKey: "user", type: "user", required: true, list: true },
      {
        key: "leave_type",
        labelKey: "leaveType",
        type: "select",
        required: true,
        list: true,
        options: ["full", "half_am", "half_pm", "late"],
      },
      {
        key: "late_minutes",
        labelKey: "lateBy",
        type: "duration",
        list: true,
        showIf: { key: "leave_type", equals: "late" },
      },
      {
        key: "multi_day",
        labelKey: "multiDay",
        type: "boolean",
        virtual: { derive: (r) => !!r.ends_on && r.ends_on !== r.starts_on, initial: false },
      },
      {
        key: "starts_on",
        labelKey: "startsOn",
        type: "date",
        required: true,
        list: true,
        labelIf: { key: "multi_day", equals: false, labelKey: "date" },
      },
      // Empty (one day) → the same day as starts_on.
      { key: "ends_on", labelKey: "endsOn", type: "date", list: true, showIf: { key: "multi_day", equals: true } },
      { key: "reason", labelKey: "reason", type: "text", list: true, maxLength: 300 },
      isActive,
    ],
    validate: (v) => {
      // One day: an empty end date means the start day.
      if (typeof v.starts_on === "string" && v.ends_on === null) {
        v.ends_on = v.starts_on;
      }
      if (typeof v.starts_on === "string" && typeof v.ends_on === "string" && v.ends_on < v.starts_on) {
        return "ends_on must be on or after starts_on";
      }
      if (v.leave_type === "late" && !(typeof v.late_minutes === "number" && v.late_minutes > 0)) {
        return "Enter how late (hours and minutes)";
      }
      if (typeof v.leave_type === "string" && v.leave_type !== "late") v.late_minutes = null;
      return null;
    },
  },
  designations: {
    slug: "designations",
    table: "designations",
    module: "designations",
    labelKey: "designations",
    fields: [
      name,
      { key: "description", labelKey: "description", type: "text", list: true, maxLength: 500 },
      { key: "permissions", labelKey: "permissions", type: "permissions", form: false },
      isActive,
    ],
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
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
 * `branch` fields must be a UUID or null — existence/tenancy of the
 * referenced branch is the caller's job (the route checks it against
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
    if (field.virtual) continue;
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
      case "branch":
      case "doctor":
      case "service":
      case "user": {
        if (raw === null || raw === "") {
          if (field.required) return { ok: false, error: `${field.key} is required` };
          values[field.key] = null;
          break;
        }
        if (typeof raw !== "string" || !UUID_RE.test(raw)) {
          return { ok: false, error: `${field.key} must be a ${field.type} id` };
        }
        values[field.key] = raw;
        break;
      }
      case "select": {
        if (raw === null || raw === "") {
          if (field.required) return { ok: false, error: `${field.key} is required` };
          values[field.key] = null;
          break;
        }
        if (typeof raw !== "string" || !(field.options ?? []).includes(raw)) {
          return { ok: false, error: `${field.key} must be one of ${(field.options ?? []).join(", ")}` };
        }
        values[field.key] = raw;
        break;
      }
      case "duration": {
        if (raw === null || raw === "" || raw === 0) {
          if (field.required) return { ok: false, error: `${field.key} is required` };
          values[field.key] = field.empty ?? null;
          break;
        }
        const n = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isInteger(n) || n < 0 || n > 24 * 60) {
          return { ok: false, error: `${field.key} must be minutes between 0 and 1440` };
        }
        if (field.min !== undefined && n < field.min) {
          return { ok: false, error: `${field.key} must be at least ${field.min} minutes` };
        }
        values[field.key] = n;
        break;
      }
      case "date": {
        if (raw === null || raw === "") {
          if (field.required) return { ok: false, error: `${field.key} is required` };
          values[field.key] = null;
          break;
        }
        if (typeof raw !== "string" || !DATE_RE.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) {
          return { ok: false, error: `${field.key} must be a date (YYYY-MM-DD)` };
        }
        values[field.key] = raw;
        break;
      }
      case "number": {
        if (!field.required && (raw === null || raw === "")) {
          values[field.key] = field.empty ?? null;
          break;
        }
        const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : NaN;
        if (!Number.isFinite(n)) return { ok: false, error: `${field.key} must be a number` };
        if (field.min !== undefined && n < field.min) {
          return { ok: false, error: `${field.key} must be at least ${field.min}` };
        }
        // Integer steps (minutes) reject fractions; money keeps 2 dp.
        values[field.key] = field.step && Number.isInteger(field.step) ? Math.round(n) : Math.round(n * 100) / 100;
        break;
      }
      case "permissions": {
        if (!Array.isArray(raw)) {
          return { ok: false, error: `${field.key} must be an array` };
        }
        values[field.key] = parsePermissions(raw);
        break;
      }
    }
  }

  if (partial && Object.keys(values).length === 0) {
    return { ok: false, error: "No editable fields supplied" };
  }
  const crossError = entity.validate?.(values);
  if (crossError) return { ok: false, error: crossError };
  return { ok: true, values };
}
