"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import {
  APPOINTMENT_STATUSES,
  type Appointment,
  type AppointmentStatus,
} from "@/lib/appointments/model";
import type { MasterRecord } from "@/lib/master/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PatientPick = { id: string; name: string | null; phone: string };

export interface AppointmentDraft {
  id?: string;
  contact: PatientPick | null;
  doctor_id: string | null;
  clinic_id: string | null;
  service: string;
  /** yyyy-mm-dd, local. */
  date: string;
  /** HH:mm, local. */
  time: string;
  durationMin: number;
  status: AppointmentStatus;
  notes: string;
}

export function draftFromAppointment(a: Appointment): AppointmentDraft {
  const s = new Date(a.starts_at);
  const e = new Date(a.ends_at);
  return {
    id: a.id,
    contact: a.contact,
    doctor_id: a.doctor_id,
    clinic_id: a.clinic_id,
    service: a.service,
    date: toDateInput(s),
    time: toTimeInput(s),
    durationMin: Math.max(5, Math.round((e.getTime() - s.getTime()) / 60000)),
    status: a.status,
    notes: a.notes ?? "",
  };
}

export function emptyDraft(start?: Date): AppointmentDraft {
  const s = start ?? nextHalfHour();
  return {
    contact: null,
    doctor_id: null,
    clinic_id: null,
    service: "",
    date: toDateInput(s),
    time: toTimeInput(s),
    durationMin: 30,
    status: "scheduled",
    notes: "",
  };
}

function nextHalfHour(): Date {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60);
  return d;
}
const pad = (n: number) => String(n).padStart(2, "0");
function toDateInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toTimeInput(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const DURATIONS = [15, 20, 30, 45, 60, 90, 120];

interface Props {
  draft: AppointmentDraft | null;
  onClose: () => void;
  onSaved: () => void;
  doctors: MasterRecord[];
  clinics: MasterRecord[];
  /** Focus the schedule fields — used by the "Reschedule" action. */
  mode?: "edit" | "reschedule" | "changeDoctor";
}

/**
 * Create / edit an appointment. Patients are searched live from the
 * account's contacts (RLS-scoped, via the browser client); doctors
 * and clinics come from the master lists the page already holds.
 * Date + time + duration are combined into starts_at / ends_at on
 * save so the API only ever sees ISO timestamps.
 */
export function AppointmentDialog({ draft, onClose, onSaved, doctors, clinics, mode = "edit" }: Props) {
  const t = useTranslations("Appointments.dialog");
  const tStatus = useTranslations("Appointments.status");
  const [form, setForm] = useState<AppointmentDraft | null>(draft);
  const [saving, setSaving] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientPick[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    setForm(draft);
    setQuery("");
    setResults([]);
  }, [draft]);

  // Debounced patient search. Skipped once a patient is picked.
  useEffect(() => {
    if (!form || form.contact || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      const like = `%${query.trim()}%`;
      const { data } = await createClient()
        .from("contacts")
        .select("id, name, phone")
        .or(`name.ilike.${like},phone.ilike.${like}`)
        .order("name", { ascending: true })
        .limit(8);
      setResults((data as PatientPick[] | null) ?? []);
      setSearching(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [query, form]);

  const set = <K extends keyof AppointmentDraft>(k: K, v: AppointmentDraft[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const doctorClinicHint = useMemo(() => {
    if (!form?.doctor_id) return null;
    const d = doctors.find((x) => x.id === form.doctor_id);
    return typeof d?.clinic_id === "string" ? d.clinic_id : null;
  }, [form?.doctor_id, doctors]);

  async function save() {
    if (!form) return;
    if (!form.contact) {
      toast.error(t("patientRequired"));
      return;
    }
    if (!form.service.trim()) {
      toast.error(t("serviceRequired"));
      return;
    }
    const start = new Date(`${form.date}T${form.time}:00`);
    if (Number.isNaN(start.getTime())) {
      toast.error(t("invalidTime"));
      return;
    }
    const end = new Date(start.getTime() + form.durationMin * 60000);

    setSaving(true);
    try {
      const body = {
        contact_id: form.contact.id,
        doctor_id: form.doctor_id,
        // Default the clinic to the doctor's when the user left it blank.
        clinic_id: form.clinic_id ?? doctorClinicHint,
        service: form.service.trim(),
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        status: form.status,
        notes: form.notes.trim() || null,
      };
      const res = await fetch(form.id ? `/api/appointments/${form.id}` : "/api/appointments", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t("saveFailed"));
        return;
      }
      toast.success(form.id ? t("updated") : t("created"));
      onSaved();
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const selectCls =
    "h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary";

  const title =
    mode === "reschedule"
      ? t("rescheduleTitle")
      : mode === "changeDoctor"
        ? t("changeDoctorTitle")
        : form?.id
          ? t("editTitle")
          : t("addTitle");

  return (
    <Dialog open={!!form} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t("desc")}</DialogDescription>
        </DialogHeader>
        {form && (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {/* Patient */}
            <div className="grid gap-1.5">
              <Label className="text-muted-foreground">
                {t("patient")} <span className="text-red-500">*</span>
              </Label>
              {form.contact ? (
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted px-3 py-2 text-sm">
                  <span className="text-foreground">
                    {form.contact.name?.trim() || form.contact.phone}
                    {form.contact.name ? (
                      <span className="ml-2 text-muted-foreground">{form.contact.phone}</span>
                    ) : null}
                  </span>
                  <Button type="button" variant="ghost" size="xs" onClick={() => set("contact", null)}>
                    {t("change")}
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                  <Input
                    autoFocus={mode === "edit"}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("patientPlaceholder")}
                    className="pl-8"
                  />
                  {(results.length > 0 || searching) && (
                    <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md">
                      {searching && results.length === 0 ? (
                        <li className="px-2 py-1.5 text-xs text-muted-foreground">{t("searching")}</li>
                      ) : (
                        results.map((r) => (
                          <li key={r.id}>
                            <button
                              type="button"
                              onClick={() => {
                                set("contact", r);
                                setQuery("");
                              }}
                              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                            >
                              <span className="text-foreground">{r.name?.trim() || r.phone}</span>
                              <span className="text-xs text-muted-foreground">{r.phone}</span>
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Service */}
            <div className="grid gap-1.5">
              <Label className="text-muted-foreground">
                {t("service")} <span className="text-red-500">*</span>
              </Label>
              <Input
                value={form.service}
                onChange={(e) => set("service", e.target.value)}
                placeholder={t("servicePlaceholder")}
              />
            </div>

            {/* Doctor / clinic */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label className="text-muted-foreground">{t("doctor")}</Label>
                <select
                  autoFocus={mode === "changeDoctor"}
                  value={form.doctor_id ?? ""}
                  onChange={(e) => set("doctor_id", e.target.value || null)}
                  className={selectCls}
                >
                  <option value="">{t("noDoctor")}</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {String(d.name)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-muted-foreground">{t("clinic")}</Label>
                <select
                  value={form.clinic_id ?? ""}
                  onChange={(e) => set("clinic_id", e.target.value || null)}
                  className={selectCls}
                >
                  <option value="">{t("noClinic")}</option>
                  {clinics.map((c) => (
                    <option key={c.id} value={c.id}>
                      {String(c.name)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* When */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label className="text-muted-foreground">{t("date")}</Label>
                <Input
                  type="date"
                  autoFocus={mode === "reschedule"}
                  value={form.date}
                  onChange={(e) => set("date", e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-muted-foreground">{t("time")}</Label>
                <Input
                  type="time"
                  step={300}
                  value={form.time}
                  onChange={(e) => set("time", e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-muted-foreground">{t("duration")}</Label>
                <select
                  value={form.durationMin}
                  onChange={(e) => set("durationMin", Number(e.target.value))}
                  className={selectCls}
                >
                  {DURATIONS.map((m) => (
                    <option key={m} value={m}>
                      {t("minutes", { count: m })}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Status (edit only) */}
            {form.id && (
              <div className="grid gap-1.5">
                <Label className="text-muted-foreground">{t("status")}</Label>
                <select
                  value={form.status}
                  onChange={(e) => set("status", e.target.value as AppointmentStatus)}
                  className={selectCls}
                >
                  {APPOINTMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {tStatus(s)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid gap-1.5">
              <Label className="text-muted-foreground">{t("notes")}</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                {form.id ? t("save") : t("create")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
