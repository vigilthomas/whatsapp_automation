// ============================================================
// Appointments — pure model helpers, no I/O.
//
// Shared by the API route (validation), the calendar / list pages
// (week maths, chip styling) and the dashboard (today's counts).
// Table shape comes from migration 042_appointments.sql.
// ============================================================

export const APPOINTMENT_STATUSES = [
  "scheduled",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_SOURCES = ["manual", "whatsapp"] as const;
export type AppointmentSource = (typeof APPOINTMENT_SOURCES)[number];

/** Row as returned by /api/appointments — joined display names included. */
export interface Appointment {
  id: string;
  clinic_id: string | null;
  doctor_id: string | null;
  contact_id: string;
  service: string;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  source: AppointmentSource;
  notes: string | null;
  created_at: string;
  updated_at: string;
  /** Joined for display; null when the FK is null or the row was removed. */
  contact: { id: string; name: string | null; phone: string } | null;
  doctor: { id: string; name: string } | null;
  clinic: { id: string; name: string } | null;
}

export function isAppointmentStatus(v: unknown): v is AppointmentStatus {
  return typeof v === "string" && (APPOINTMENT_STATUSES as readonly string[]).includes(v);
}
export function isAppointmentSource(v: unknown): v is AppointmentSource {
  return typeof v === "string" && (APPOINTMENT_SOURCES as readonly string[]).includes(v);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AppointmentInput = {
  clinic_id?: string | null;
  doctor_id?: string | null;
  contact_id?: string;
  service?: string;
  starts_at?: string;
  ends_at?: string;
  status?: AppointmentStatus;
  source?: AppointmentSource;
  notes?: string | null;
};

export type ValidationResult =
  | { ok: true; values: AppointmentInput }
  | { ok: false; error: string };

/**
 * Validate a create (`partial: false`) or update (`partial: true`)
 * body. Timestamps must be ISO strings that parse; `ends_at` must be
 * after `starts_at` when both are present (on a partial update with
 * only one side supplied the DB CHECK is the backstop). Unknown keys
 * are ignored.
 */
export function validateAppointmentInput(
  body: unknown,
  { partial }: { partial: boolean },
): ValidationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid JSON body" };
  }
  const b = body as Record<string, unknown>;
  const v: AppointmentInput = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(b, k);

  const optionalUuid = (k: "clinic_id" | "doctor_id"): string | null | undefined => {
    if (!has(k)) return undefined;
    const raw = b[k];
    if (raw === null || raw === "") return null;
    if (typeof raw !== "string" || !UUID_RE.test(raw)) throw new Error(`${k} must be an id`);
    return raw;
  };

  try {
    const clinic = optionalUuid("clinic_id");
    if (clinic !== undefined) v.clinic_id = clinic;
    const doctor = optionalUuid("doctor_id");
    if (doctor !== undefined) v.doctor_id = doctor;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  if (has("contact_id")) {
    if (typeof b.contact_id !== "string" || !UUID_RE.test(b.contact_id)) {
      return { ok: false, error: "contact_id must be an id" };
    }
    v.contact_id = b.contact_id;
  } else if (!partial) {
    return { ok: false, error: "contact_id is required" };
  }

  if (has("service")) {
    const s = typeof b.service === "string" ? b.service.trim() : "";
    if (!s) return { ok: false, error: "service is required" };
    if (s.length > 200) return { ok: false, error: "service must be at most 200 characters" };
    v.service = s;
  } else if (!partial) {
    return { ok: false, error: "service is required" };
  }

  for (const k of ["starts_at", "ends_at"] as const) {
    if (has(k)) {
      const raw = b[k];
      const d = typeof raw === "string" ? new Date(raw) : null;
      if (!d || Number.isNaN(d.getTime())) return { ok: false, error: `${k} must be an ISO date` };
      v[k] = d.toISOString();
    } else if (!partial) {
      return { ok: false, error: `${k} is required` };
    }
  }
  if (v.starts_at && v.ends_at && v.ends_at <= v.starts_at) {
    return { ok: false, error: "ends_at must be after starts_at" };
  }

  if (has("status")) {
    if (!isAppointmentStatus(b.status)) return { ok: false, error: "invalid status" };
    v.status = b.status;
  }
  if (has("source")) {
    if (!isAppointmentSource(b.source)) return { ok: false, error: "invalid source" };
    v.source = b.source;
  }
  if (has("notes")) {
    if (b.notes !== null && typeof b.notes !== "string") {
      return { ok: false, error: "notes must be a string" };
    }
    const n = (b.notes ?? "").trim();
    if (n.length > 2000) return { ok: false, error: "notes must be at most 2000 characters" };
    v.notes = n || null;
  }

  if (partial && Object.keys(v).length === 0) {
    return { ok: false, error: "No editable fields supplied" };
  }
  return { ok: true, values: v };
}

// ------------------------------------------------------------
// Calendar maths
// ------------------------------------------------------------

/** Monday 00:00 local of the week containing `d`. */
export function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  // getDay(): Sun=0 … Sat=6 → shift so Monday is the first column.
  const shift = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - shift);
  return out;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** The `count` consecutive days starting at `start` (local dates). */
export function weekDays(start: Date, count: number): Date[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Bucket appointments by (day column, hour row) for the week grid.
 * Key is `${dayIndex}:${hour}`; an appointment lands in the hour its
 * `starts_at` falls in (the mockup renders chips per hour row rather
 * than proportional blocks). Appointments outside `days` are dropped.
 */
export function bucketByDayHour(
  appointments: Appointment[],
  days: Date[],
): Map<string, Appointment[]> {
  const out = new Map<string, Appointment[]>();
  for (const a of appointments) {
    const s = new Date(a.starts_at);
    const dayIndex = days.findIndex((d) => isSameLocalDay(d, s));
    if (dayIndex < 0) continue;
    const key = `${dayIndex}:${s.getHours()}`;
    const list = out.get(key) ?? [];
    list.push(a);
    out.set(key, list);
  }
  for (const list of out.values()) {
    list.sort((x, y) => x.starts_at.localeCompare(y.starts_at));
  }
  return out;
}

/**
 * Which hour rows to render: the configured working window, widened
 * to include any appointment that falls outside it so nothing is
 * silently hidden.
 */
export function hourRange(
  appointments: Appointment[],
  workStart: number,
  workEnd: number,
): number[] {
  let lo = workStart;
  let hi = workEnd;
  for (const a of appointments) {
    const h = new Date(a.starts_at).getHours();
    if (h < lo) lo = h;
    if (h >= hi) hi = h + 1;
  }
  return Array.from({ length: hi - lo }, (_, i) => lo + i);
}

/**
 * Visual tone for a chip. Mirrors the mockup: blue = upcoming,
 * green = done or booked by the AI, amber = needs attention, grey =
 * cancelled.
 */
export type ChipTone = "blue" | "green" | "amber" | "grey";

export function chipTone(a: Pick<Appointment, "status" | "source">): ChipTone {
  switch (a.status) {
    case "completed":
      return "green";
    case "no_show":
      return "amber";
    case "cancelled":
      return "grey";
    case "confirmed":
      return "blue";
    case "scheduled":
      return a.source === "whatsapp" ? "green" : "blue";
  }
}

/** Short subtitle for a chip / list row. */
export function chipSubtitle(
  a: Pick<Appointment, "status" | "source" | "contact">,
  labels: Record<AppointmentStatus | "viaWhatsApp", string>,
): string {
  if (a.status === "scheduled" && a.source === "whatsapp") return labels.viaWhatsApp;
  if (a.status === "scheduled") return a.contact?.name ?? a.contact?.phone ?? "";
  return labels[a.status];
}

/** Display name for a patient: name, else phone. */
export function patientLabel(c: Appointment["contact"]): string {
  if (!c) return "—";
  return c.name?.trim() || c.phone;
}
