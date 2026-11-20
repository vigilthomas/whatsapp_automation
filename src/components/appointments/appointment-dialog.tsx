"use client";

import { NativeSelect } from '@/components/ui/native-select';
import { DateInput, TimeInput } from '@/components/ui/date-time-input';
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Loader2, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  APPOINTMENT_STATUSES,
  type Appointment,
  type AppointmentStatus,
} from "@/lib/appointments/model";
import type { MasterRecord } from "@/lib/master/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DurationInput, useDurationLabel } from "@/components/ui/duration-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { avatarColor, initialsOf } from "@/components/dashboard/clinic-widgets";
import { DEFAULT_CLINIC_SETTINGS, closureOn, hoursOn, parseClinicSettings, type ClinicSettings } from "@/lib/clinic/settings";
import { dynamicStarts, hhmm } from "@/lib/booking/schedule";
import { sanitizeSearch } from "@/lib/search/sanitize";

type PatientPick = { id: string; name: string | null; phone: string };

export interface AppointmentDraft {
  id?: string;
  contact: PatientPick | null;
  doctor_id: string | null;
  branch_id: string | null;
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
    branch_id: a.branch_id,
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
    branch_id: null,
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
function parseLocal(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}

/** Days shown in the date strip (reference shows six). */
const STRIP_DAYS = 6;

interface ServiceRecord {
  id: string;
  name: string;
  duration_min: number;
  buffer_min: number;
}

/** Step between offered times when nothing is in the way. */
const SLOT_GAP_MIN = 30;

interface Props {
  draft: AppointmentDraft | null;
  onClose: () => void;
  onSaved: () => void;
  doctors: MasterRecord[];
  branches: MasterRecord[];
  /** Focus the schedule fields — used by the "Reschedule" action. */
  mode?: "edit" | "reschedule" | "changeDoctor";
}

/**
 * Create / edit an appointment, laid out like the MobileNewAppointment
 * reference: patient search → service chips → doctor cards → date strip
 * → live slot grid → one big "Book <time> with <doctor>" button. On a
 * phone the dialog is a full-height sheet; on desktop a centred card.
 *
 * Slots are derived from the working hours and the service duration;
 * the ones already taken by the chosen doctor on that day (fetched from
 * /api/appointments) render struck-through, so the slot grid reflects
 * the calendar rather than guessing. Patients are searched live from
 * the account's contacts (RLS-scoped, via the browser client).
 */
export function AppointmentDialog({ draft, onClose, onSaved, doctors, branches, mode = "edit" }: Props) {
  const t = useTranslations("Appointments.dialog");
  const tStatus = useTranslations("Appointments.status");
  const tClinic = useTranslations("Settings.clinic");
  const confirm = useConfirm();
  const durationLabel = useDurationLabel();
  const [form, setForm] = useState<AppointmentDraft | null>(draft);
  const [saving, setSaving] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientPick[]>([]);
  const [searching, setSearching] = useState(false);

  const [services, setServices] = useState<ServiceRecord[]>([]);
  // Doctor services (057): a doctor's own time for a service.
  const [ownTimes, setOwnTimes] = useState<{ doctor_id: string; service_id: string; duration_min: number }[]>([]);
  const [customService, setCustomService] = useState(false);
  const [busy, setBusy] = useState<{ start: number; end: number; id?: string; service?: string }[]>([]);
  const [showAllDates, setShowAllDates] = useState(false);
  // A new booking opens at "now + half an hour", which is usually outside
  // clinic hours. Until the user picks a time themselves (a slot or the
  // custom field), the time follows the first free slot as the service,
  // doctor and date change — otherwise "Book" kept the opening time.
  const [timeTouched, setTimeTouched] = useState(false);
  // Settings → Clinic: opening hours and closed days (defaults until loaded).
  const [clinic, setClinic] = useState<ClinicSettings>(DEFAULT_CLINIC_SETTINGS);

  useEffect(() => {
    setForm(draft);
    setQuery("");
    setResults([]);
    setShowAllDates(false);
    // Editing keeps the saved time; only a new booking snaps to a slot.
    setTimeTouched(!!draft?.id);
  }, [draft]);

  // Services master — once per open.
  useEffect(() => {
    if (!draft) return;
    fetch("/api/clinic-settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setClinic(d ? parseClinicSettings(d.settings) : DEFAULT_CLINIC_SETTINGS))
      .catch(() => setClinic(DEFAULT_CLINIC_SETTINGS));
    fetch("/api/master/services", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const recs: ServiceRecord[] = Array.isArray(d.records)
          ? d.records
              .filter((r: MasterRecord) => r.is_active !== false)
              .map((r: MasterRecord) => ({
                id: String(r.id),
                name: String(r.name ?? ""),
                duration_min: Number(r.duration_min) || 30,
                buffer_min: Number(r.buffer_min) || 0,
              }))
          : [];
        setServices(recs);
        // A service typed by hand (or from an older row) that isn't in the
        // master list falls back to the free-text field.
        setCustomService(recs.length === 0 || (!!draft.service && !recs.some((s) => s.name === draft.service)));
      })
      .catch(() => setServices([]));
    fetch("/api/master/doctor-services", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { records: [] }))
      .then((d) =>
        setOwnTimes(
          (Array.isArray(d.records) ? d.records : [])
            .filter((r: MasterRecord) => r.is_active !== false && Number(r.duration_min) > 0)
            .map((r: MasterRecord) => ({
              doctor_id: String(r.doctor_id),
              service_id: String(r.service_id),
              duration_min: Number(r.duration_min),
            })),
        ),
      )
      .catch(() => setOwnTimes([]));
  }, [draft]);

  // Debounced patient search. Skipped once a patient is picked.
  useEffect(() => {
    if (!form || form.contact || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      // Security audit F-12: strip PostgREST filter grammar first.
      const like = `%${sanitizeSearch(query)}%`;
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

  // Booked windows for the chosen doctor + day, to strike through slots.
  const dateKey = form?.date ?? "";
  const doctorKey = form?.doctor_id ?? "";
  useEffect(() => {
    if (!dateKey) return;
    const from = parseLocal(dateKey, "00:00");
    const to = new Date(from.getTime() + 86_400_000);
    const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
    if (doctorKey) params.set("doctor_id", doctorKey);
    let cancelled = false;
    fetch(`/api/appointments?${params}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const rows: Appointment[] = Array.isArray(d.appointments) ? d.appointments : [];
        setBusy(
          rows
            .filter((a) => a.status !== "cancelled")
            .map((a) => ({
              id: a.id,
              start: new Date(a.starts_at).getTime(),
              end: new Date(a.ends_at).getTime(),
              service: a.service,
            })),
        );
      })
      .catch(() => setBusy([]));
    return () => {
      cancelled = true;
    };
  }, [dateKey, doctorKey]);

  const set = <K extends keyof AppointmentDraft>(k: K, v: AppointmentDraft[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  /** Time for a listed service with a doctor: the doctor's own, else the service's default. */
  const minutesFor = (serviceName: string, doctorId: string | null) => {
    const s = services.find((x) => x.name === serviceName);
    if (!s) return null;
    const own = doctorId ? ownTimes.find((o) => o.doctor_id === doctorId && o.service_id === s.id) : undefined;
    return own?.duration_min ?? s.duration_min;
  };

  /** Pick a doctor; a listed service switches to that doctor's time. */
  const pickDoctor = (doctorId: string | null) =>
    setForm((f) => {
      if (!f) return f;
      const minutes = customService ? null : minutesFor(f.service, doctorId);
      return { ...f, doctor_id: doctorId, ...(minutes ? { durationMin: minutes } : {}) };
    });

  const doctorBranchHint = useMemo(() => {
    if (!form?.doctor_id) return null;
    const d = doctors.find((x) => x.id === form.doctor_id);
    return typeof d?.branch_id === "string" ? d.branch_id : null;
  }, [form?.doctor_id, doctors]);

  const selectedDoctor = doctors.find((d) => d.id === form?.doctor_id) ?? null;

  // Date strip: today + the next STRIP_DAYS-1 days.
  const strip = useMemo(() => {
    const out: { key: string; day: string; num: number }[] = [];
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const wd = new Intl.DateTimeFormat(undefined, { weekday: "short" });
    for (let i = 0; i < STRIP_DAYS; i++) {
      const x = new Date(d.getTime() + i * 86_400_000);
      out.push({ key: toDateInput(x), day: wd.format(x), num: x.getDate() });
    }
    return out;
  }, []);
  const dateInStrip = strip.some((s) => s.key === form?.date);

  // Dynamic times (same rules as the booking assistant, schedule.ts): every
  // 30 min, but straight after the chosen doctor's previous booking plus
  // half of each service's buffer. Without a doctor there's nothing to
  // work around, so it's the plain 30-minute grid.
  const slots = useMemo(() => {
    if (!form) return [];
    const fmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
    const dayStart = parseLocal(form.date, "00:00").getTime();
    const bufferOf = (name?: string) => services.find((x) => x.name === name)?.buffer_min ?? 0;
    const blocks = form.doctor_id
      ? busy
          .filter((b) => b.id !== form.id)
          .map((b) => ({ start: (b.start - dayStart) / 60000, end: (b.end - dayStart) / 60000, bufferMin: bufferOf(b.service) }))
      : [];
    // A closed day (weekly day off, holiday, closed dates) offers no slots;
    // staff can still type a custom time on purpose.
    const window = hoursOn(clinic, form.date);
    if (!window) return [];
    const starts = dynamicStarts({
      open: window.open,
      close: window.close,
      durationMin: form.durationMin,
      bufferMin: bufferOf(form.service),
      gapMin: SLOT_GAP_MIN,
      blocks,
    });
    const now = Date.now();
    return starts.map((m) => {
      const s = dayStart + m * 60000;
      return { time: hhmm(m), label: fmt.format(new Date(s)), taken: false, past: s + form.durationMin * 60000 < now };
    });
  }, [form, busy, services, clinic]);

  // Why the chosen day is closed, for the notice above the (empty) slot grid.
  const closure = form ? closureOn(clinic, form.date) : null;
  const closedWhy = !closure
    ? null
    : closure.kind === "holiday"
      ? closure.name || tClinic("holidays")
      : closure.kind === "closed"
        ? closure.reason || tClinic("closures")
        : tClinic("closed");

  const firstFree = slots.find((s) => !s.taken && !s.past)?.time ?? null;
  useEffect(() => {
    if (timeTouched || !firstFree) return;
    setForm((f) => (f && !f.id && f.time !== firstFree ? { ...f, time: firstFree } : f));
  }, [firstFree, timeTouched]);
  const pickTime = (time: string) => {
    setTimeTouched(true);
    set("time", time);
  };

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
    const start = parseLocal(form.date, form.time);
    if (Number.isNaN(start.getTime())) {
      toast.error(t("invalidTime"));
      return;
    }
    const end = new Date(start.getTime() + form.durationMin * 60000);

    const ok = await confirm({
      title: form.id ? t("confirmSaveTitle") : t("confirmCreateTitle"),
      description: t("confirmSaveDesc", {
        patient: form.contact.name?.trim() || form.contact.phone,
        when: new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(start),
      }),
      confirmLabel: form.id ? t("save") : t("create"),
    });
    if (!ok) return;

    setSaving(true);
    try {
      const body = {
        contact_id: form.contact.id,
        doctor_id: form.doctor_id,
        // Default the branch to the doctor's when the user left it blank.
        branch_id: form.branch_id ?? doctorBranchHint,
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
    "h-10 w-full rounded-[10px] border border-input bg-card px-3 text-[13.5px] text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/20";
  const labelCls = "text-[12.5px] font-semibold text-foreground";
  const chip = (on: boolean, extra?: string) =>
    cn(
      "inline-flex h-[38px] items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] font-semibold whitespace-nowrap transition-colors",
      on ? "border-navy bg-navy text-white dark:border-teal dark:bg-teal dark:text-[#06201f]" : "border-input bg-card text-foreground hover:bg-sunken",
      extra,
    );

  const title =
    mode === "reschedule"
      ? t("rescheduleTitle")
      : mode === "changeDoctor"
        ? t("changeDoctorTitle")
        : form?.id
          ? t("editTitle")
          : t("addTitle");

  const slotLabel = form
    ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(parseLocal(form.date, form.time))
    : "";
  const cta = form?.id
    ? t("save")
    : selectedDoctor
      ? t("bookWith", { time: slotLabel, doctor: String(selectedDoctor.name) })
      : t("bookAt", { time: slotLabel });

  return (
    <Dialog open={!!form} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        // Phone: full-height sheet. Desktop: centred card, capped height.
        className="flex h-dvh max-h-dvh w-full max-w-none flex-col gap-0 rounded-none p-0 sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl"
        showCloseButton={false}
      >
        <DialogHeader className="flex-row items-center gap-3 border-b border-border px-4 py-3.5 text-left sm:px-5">
          <button
            type="button"
            onClick={onClose}
            aria-label={t("cancel")}
            className="flex size-9 shrink-0 items-center justify-center rounded-[10px] text-foreground hover:bg-sunken"
          >
            <X className="size-5" strokeWidth={1.75} />
          </button>
          <div className="min-w-0 flex-1">
            <DialogTitle className="font-heading text-[17px] leading-tight font-semibold">{title}</DialogTitle>
            <DialogDescription className="text-[11px]">{t("quickHint")}</DialogDescription>
          </div>
        </DialogHeader>

        {form && (
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto p-4 sm:px-5">
              {/* Patient */}
              <div className="flex flex-col gap-1.5">
                <Label className={labelCls}>{t("patient")} *</Label>
                {form.contact ? (
                  <div className="flex h-12 items-center gap-2.5 rounded-[10px] border border-teal bg-card px-3 shadow-[0_0_0_3px_rgba(14,159,154,.15)]">
                    <span
                      className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      style={{ background: avatarColor(form.contact.id) }}
                    >
                      {initialsOf(form.contact.name?.trim() || form.contact.phone)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-foreground">
                      {form.contact.name?.trim() || form.contact.phone}
                      {form.contact.name ? <span className="text-muted-foreground"> · {form.contact.phone}</span> : null}
                    </span>
                    <button
                      type="button"
                      onClick={() => set("contact", null)}
                      className="text-xs font-semibold text-teal-700 hover:text-teal"
                    >
                      {t("change")}
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground/70" />
                    <Input
                      autoFocus={mode === "edit"}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t("patientPlaceholder")}
                      className="h-12 rounded-[10px] border-input pl-9 text-[13.5px]"
                    />
                    {(results.length > 0 || searching) && (
                      <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-[10px] border border-border bg-popover p-1 shadow-float">
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
                                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-sunken"
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
              <div className="flex flex-col gap-1.5">
                <Label className={labelCls}>{t("service")} *</Label>
                {services.length > 0 && !customService ? (
                  <div className="flex flex-wrap gap-2">
                    {services.map((s) => {
                      const on = form.service === s.name;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          className={chip(on)}
                          onClick={() => {
                            set("service", s.name);
                            set("durationMin", minutesFor(s.name, form.doctor_id) ?? s.duration_min);
                          }}
                        >
                          {s.name} · {durationLabel(minutesFor(s.name, form.doctor_id) ?? s.duration_min)}
                        </button>
                      );
                    })}
                    <button type="button" className={chip(false, "border-dashed")} onClick={() => setCustomService(true)}>
                      {t("otherService")}
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      value={form.service}
                      onChange={(e) => set("service", e.target.value)}
                      placeholder={t("servicePlaceholder")}
                      className="h-10 rounded-[10px] border-input text-[13.5px]"
                    />
                    <DurationInput
                      value={form.durationMin}
                      onChange={(v) => set("durationMin", Math.max(5, v))}
                      className="shrink-0"
                    />
                    {services.length > 0 && (
                      <Button type="button" variant="outline" size="sm" className="h-10" onClick={() => setCustomService(false)}>
                        {t("pickService")}
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Doctor */}
              <div className="flex flex-col gap-1.5">
                <Label className={labelCls}>{t("doctor")}</Label>
                {doctors.length > 0 && doctors.length <= 6 ? (
                  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(3, doctors.length)}, minmax(0, 1fr))` }}>
                    {doctors.map((d) => {
                      const on = form.doctor_id === d.id;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          autoFocus={mode === "changeDoctor" && on}
                          onClick={() => pickDoctor(on ? null : d.id)}
                          className={cn(
                            "flex flex-col items-center gap-1.5 rounded-xl border px-1.5 py-2.5 transition-colors",
                            on ? "border-teal bg-mint" : "border-input bg-card hover:bg-sunken",
                          )}
                        >
                          <span
                            className="flex size-7 items-center justify-center rounded-full text-[10px] font-bold text-white"
                            style={{ background: avatarColor(d.id) }}
                          >
                            {initialsOf(String(d.name))}
                          </span>
                          <span className="max-w-full truncate text-[11px] font-semibold text-foreground">{String(d.name)}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <NativeSelect
                    autoFocus={mode === "changeDoctor"}
                    value={form.doctor_id ?? ""}
                    onChange={(e) => pickDoctor(e.target.value || null)}
                    className={selectCls}
                  >
                    <option value="">{t("noDoctor")}</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {String(d.name)}
                      </option>
                    ))}
                  </NativeSelect>
                )}
                {branches.length > 1 && (
                  <NativeSelect
                    value={form.branch_id ?? ""}
                    onChange={(e) => set("branch_id", e.target.value || null)}
                    className={cn(selectCls, "mt-1")}
                    aria-label={t("branch")}
                  >
                    <option value="">{t("noBranch")}</option>
                    {branches.map((c) => (
                      <option key={c.id} value={c.id}>
                        {String(c.name)}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </div>

              {/* Date */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label className={labelCls}>{t("date")}</Label>
                  <button
                    type="button"
                    onClick={() => setShowAllDates((v) => !v)}
                    className="text-xs font-semibold text-teal-700 hover:text-teal"
                  >
                    {showAllDates || !dateInStrip ? t("nextDays") : t("pickDate")}
                  </button>
                </div>
                {showAllDates || !dateInStrip ? (
                  <DateInput
                    autoFocus={mode === "reschedule"}
                    value={form.date}
                    onChange={(e) => set("date", e.target.value)}
                    className="h-10 rounded-[10px] border-input"
                    required
                  />
                ) : (
                  <div className="flex gap-1.5">
                    {strip.map((d) => {
                      const on = form.date === d.key;
                      const shut = !!closureOn(clinic, d.key);
                      return (
                        <button
                          key={d.key}
                          type="button"
                          onClick={() => set("date", d.key)}
                          title={shut ? tClinic("closed") : undefined}
                          className={cn(
                            "flex flex-1 flex-col items-center rounded-[10px] border py-2 transition-colors",
                            on
                              ? "border-navy bg-navy text-white dark:border-teal dark:bg-teal dark:text-[#06201f]"
                              : shut
                                ? "border-border bg-sunken text-muted-foreground/70 line-through hover:bg-sunken"
                                : "border-input bg-card text-foreground hover:bg-sunken",
                          )}
                        >
                          <span className="text-[11px]">{d.day}</span>
                          <span className="text-[15px] font-semibold">{d.num}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Slots */}
              <div className="flex flex-col gap-1.5">
                <Label className={labelCls}>
                  {t("slots")}{" "}
                  <span className="font-medium text-muted-foreground/80">
                    · {selectedDoctor ? t("slotsFrom", { doctor: String(selectedDoctor.name) }) : t("slotsAll")}
                  </span>
                </Label>
                {closedWhy && (
                  <p className="rounded-[10px] border border-warn-fg/30 bg-warn-bg px-3 py-2 text-xs text-warn-fg">
                    {tClinic("closedNotice", { why: closedWhy })}
                  </p>
                )}
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {slots.map((s) => {
                    const on = form.time === s.time;
                    const off = s.taken || s.past;
                    return (
                      <button
                        key={s.time}
                        type="button"
                        disabled={off && !on}
                        onClick={() => pickTime(s.time)}
                        className={cn(
                          "flex h-11 items-center justify-center rounded-[10px] border text-[13px] font-semibold transition-colors",
                          on
                            ? "border-teal bg-mint text-teal-700"
                            : off
                              ? "border-border bg-sunken text-muted-foreground/70 line-through"
                              : "border-input bg-card text-foreground hover:bg-sunken",
                        )}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                  <span>{t("customTime")}</span>
                  <TimeInput
                    minuteStep={5}
                    value={form.time}
                    onChange={(e) => pickTime(e.target.value)}
                    className="h-8 w-28 rounded-lg border-input"
                    required
                  />
                </div>
              </div>

              {/* Status (edit only) */}
              {form.id && (
                <div className="flex flex-col gap-1.5">
                  <Label className={labelCls}>{t("status")}</Label>
                  <NativeSelect
                    value={form.status}
                    onChange={(e) => set("status", e.target.value as AppointmentStatus)}
                    className={selectCls}
                  >
                    {APPOINTMENT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {tStatus(s)}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label className={labelCls}>{t("notes")}</Label>
                <Textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  className="rounded-[10px] border-input text-[13.5px]"
                />
              </div>
            </div>

            {/* Sticky CTA (reference: full-width navy button) */}
            <div className="border-t border-border bg-card px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-5 sm:pb-4">
              <Button type="submit" disabled={saving} className="h-[52px] w-full rounded-[14px] text-[15px] sm:h-11">
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" strokeWidth={2.2} />}
                {cta}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
