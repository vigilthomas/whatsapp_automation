"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft, ChevronRight, List, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import {
  addDays,
  startOfWeek,
  type Appointment,
  type AppointmentStatus,
} from "@/lib/appointments/model";
import type { MasterRecord } from "@/lib/master/entities";
import { Button } from "@/components/ui/button";
import {
  AppointmentCalendar,
  CALENDAR_DAYS,
  type CalendarAction,
} from "@/components/appointments/appointment-calendar";
import { AppointmentList } from "@/components/appointments/appointment-list";
import {
  AppointmentDialog,
  draftFromAppointment,
  emptyDraft,
  type AppointmentDraft,
} from "@/components/appointments/appointment-dialog";

type View = "calendar" | "list";

/**
 * Appointments — weekly calendar (the reference design) with a list
 * view of the same window, filterable by clinic and doctor. Both views
 * share one fetch per visible week, one selection, and one dialog.
 */
export default function AppointmentsPage() {
  const t = useTranslations("Appointments");
  const { canSendMessages } = useAuth();
  const canEdit = canSendMessages; // agent+ — matches the API's requireRole('agent')

  const [view, setView] = useState<View>("calendar");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [clinicId, setClinicId] = useState("");
  const [doctorId, setDoctorId] = useState("");

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [doctors, setDoctors] = useState<MasterRecord[]>([]);
  const [clinics, setClinics] = useState<MasterRecord[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AppointmentDraft | null>(null);
  const [dialogMode, setDialogMode] = useState<"edit" | "reschedule" | "changeDoctor">("edit");

  // Master lists — once.
  useEffect(() => {
    (async () => {
      const [d, c] = await Promise.all([
        fetch("/api/master/doctors", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
        fetch("/api/master/clinics", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      ]);
      setDoctors(Array.isArray(d.records) ? d.records : []);
      setClinics(Array.isArray(c.records) ? c.records : []);
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        from: weekStart.toISOString(),
        to: addDays(weekStart, CALENDAR_DAYS).toISOString(),
      });
      if (clinicId) params.set("clinic_id", clinicId);
      if (doctorId) params.set("doctor_id", doctorId);
      const res = await fetch(`/api/appointments?${params}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t("loadFailed"));
        setAppointments([]);
        return;
      }
      setAppointments(Array.isArray(data.appointments) ? data.appointments : []);
    } catch {
      toast.error(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [weekStart, clinicId, doctorId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Doctors narrowed to the chosen clinic so the two filters agree.
  const doctorOptions = useMemo(
    () => (clinicId ? doctors.filter((d) => d.clinic_id === clinicId) : doctors),
    [doctors, clinicId],
  );

  const subject = useMemo(() => {
    if (doctorId) return String(doctors.find((d) => d.id === doctorId)?.name ?? "");
    if (clinicId) return String(clinics.find((c) => c.id === clinicId)?.name ?? "");
    return t("allDoctors");
  }, [doctorId, clinicId, doctors, clinics, t]);

  const patch = useCallback(
    async (a: Appointment, body: { status: AppointmentStatus }) => {
      const res = await fetch(`/api/appointments/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t("updateFailed"));
        return;
      }
      toast.success(t("statusUpdated"));
      await load();
    },
    [load, t],
  );

  const openDialog = (d: AppointmentDraft, mode: typeof dialogMode = "edit") => {
    setDialogMode(mode);
    setDraft(d);
  };

  const onAction = (action: CalendarAction, a: Appointment) => {
    switch (action) {
      case "edit":
        return openDialog(draftFromAppointment(a), "edit");
      case "reschedule":
        return openDialog(draftFromAppointment(a), "reschedule");
      case "changeDoctor":
        return openDialog(draftFromAppointment(a), "changeDoctor");
      case "cancel":
        if (!window.confirm(t("confirmCancel"))) return;
        return void patch(a, { status: "cancelled" });
      case "confirm":
        return void patch(a, { status: "confirmed" });
      case "complete":
        return void patch(a, { status: "completed" });
      case "noShow":
        return void patch(a, { status: "no_show" });
    }
  };

  const weekLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(weekStart);
  const selectCls =
    "h-8 rounded-lg border border-border bg-card px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary";

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("pageTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("pageDesc")}</p>
        </div>
        {canEdit && (
          <Button onClick={() => openDialog(emptyDraft())}>
            <Plus className="size-4" />
            {t("actions.add")}
          </Button>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label={t("prevWeek")} onClick={() => setWeekStart((w) => addDays(w, -7))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" onClick={() => setWeekStart(startOfWeek(new Date()))}>
            {t("today")}
          </Button>
          <Button variant="outline" size="icon" aria-label={t("nextWeek")} onClick={() => setWeekStart((w) => addDays(w, 7))}>
            <ChevronRight className="size-4" />
          </Button>
          <span className="ml-2 text-sm font-medium text-foreground">{weekLabel}</span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            value={clinicId}
            onChange={(e) => {
              setClinicId(e.target.value);
              setDoctorId("");
            }}
            className={selectCls}
            aria-label={t("filterClinic")}
          >
            <option value="">{t("allClinics")}</option>
            {clinics.map((c) => (
              <option key={c.id} value={c.id}>
                {String(c.name)}
              </option>
            ))}
          </select>
          <select
            value={doctorId}
            onChange={(e) => setDoctorId(e.target.value)}
            className={selectCls}
            aria-label={t("filterDoctor")}
          >
            <option value="">{t("allDoctors")}</option>
            {doctorOptions.map((d) => (
              <option key={d.id} value={d.id}>
                {String(d.name)}
              </option>
            ))}
          </select>

          <div className="flex rounded-lg border border-border bg-card p-0.5" role="tablist">
            {(["calendar", "list"] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
                  view === v
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v === "calendar" ? <CalendarDays className="size-4" /> : <List className="size-4" />}
                {t(`view.${v}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === "calendar" ? (
        <AppointmentCalendar
          weekStart={weekStart}
          appointments={appointments}
          loading={loading}
          subject={subject}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAdd={() => openDialog(emptyDraft())}
          onAction={onAction}
          canEdit={canEdit}
          onSlotClick={(start) => openDialog(emptyDraft(start))}
        />
      ) : (
        <AppointmentList
          appointments={appointments}
          loading={loading}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onEdit={(a) => openDialog(draftFromAppointment(a))}
          canEdit={canEdit}
        />
      )}

      <AppointmentDialog
        draft={draft}
        mode={dialogMode}
        doctors={doctors}
        clinics={clinics}
        onClose={() => setDraft(null)}
        onSaved={() => {
          setDraft(null);
          void load();
        }}
      />
    </div>
  );
}
