"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Download, Plus, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import {
  addDays,
  startOfWeek,
  type Appointment,
  type AppointmentStatus,
} from "@/lib/appointments/model";
import type { MasterRecord } from "@/lib/master/entities";
import { downloadCsv, recordsToCsv } from "@/lib/master/csv";
import { patientLabel } from "@/lib/appointments/model";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  AppointmentCalendar,
  CALENDAR_DAYS,
  type CalendarAction,
} from "@/components/appointments/appointment-calendar";
import { AppointmentList, useAppointmentTable } from "@/components/appointments/appointment-list";
import { exportColumns } from "@/components/ui/data-table";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeading } from "@/components/layout/page-heading";
import { parseAppointmentsLink } from "@/lib/appointments/deep-link";
import { AppointmentActions } from "@/components/appointments/appointment-actions";
import {
  AppointmentDialog,
  draftFromAppointment,
  emptyDraft,
  type AppointmentDraft,
} from "@/components/appointments/appointment-dialog";

type View = "day" | "week";

/**
 * Appointments — Day (table) / Week (calendar) views of one fetched
 * week, filterable by branch, doctor and a patient/phone search. Both
 * views share one selection and one action bar, mirroring the
 * reference Appointments page.
 */
export default function AppointmentsPage() {
  // useSearchParams() needs a Suspense boundary for the static build.
  return (
    <Suspense fallback={null}>
      <AppointmentsPageInner />
    </Suspense>
  );
}

function AppointmentsPageInner() {
  const t = useTranslations("Appointments");
  const searchParams = useSearchParams();
  const confirm = useConfirm();
  // Mirrors the API's requirePermission('appointments', …) checks.
  const { can } = useAuth();
  const canCreate = can("appointments", "write");
  const canEdit = can("appointments", "edit");
  const canExport = can("appointments", "export");

  // Dashboard cards link here with ?from=&to=&branch=&status= (read once).
  const [link] = useState(() => parseAppointmentsLink(new URLSearchParams(searchParams.toString())));
  const [view, setView] = useState<View>(link.view ?? "day");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(link.day ?? new Date()));
  // Day view cursor — always inside the fetched week.
  const [day, setDay] = useState(() => {
    const d = new Date(link.day ?? new Date());
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [search, setSearch] = useState("");
  const [branchId, setBranchId] = useState(link.branch ?? "");
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | null>(link.status);
  const [doctorId, setDoctorId] = useState("");

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [doctors, setDoctors] = useState<MasterRecord[]>([]);
  const [branches, setBranches] = useState<MasterRecord[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AppointmentDraft | null>(null);

  // `/appointments?new=1` (dashboard CTA) opens the booking dialog.
  const wantsNew = searchParams.get("new") === "1";
  useEffect(() => {
    if (wantsNew) setDraft(emptyDraft());
  }, [wantsNew]);
  const [dialogMode, setDialogMode] = useState<"edit" | "reschedule" | "changeDoctor">("edit");

  // Master lists — once.
  useEffect(() => {
    (async () => {
      const [d, c] = await Promise.all([
        fetch("/api/master/doctors", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
        fetch("/api/master/branches", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      ]);
      setDoctors(Array.isArray(d.records) ? d.records : []);
      const list: MasterRecord[] = Array.isArray(c.records) ? c.records : [];
      setBranches(list);
      // A linked branch this member can't see: show all instead of nothing.
      setBranchId((b) => (b && !list.some((x) => x.id === b) ? "" : b));
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        from: weekStart.toISOString(),
        to: addDays(weekStart, CALENDAR_DAYS).toISOString(),
      });
      if (branchId) params.set("branch_id", branchId);
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
  }, [weekStart, branchId, doctorId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Doctors narrowed to the chosen branch so the two filters agree.
  const doctorOptions = useMemo(
    () => (branchId ? doctors.filter((d) => d.branch_id === branchId) : doctors),
    [doctors, branchId],
  );

  const subject = useMemo(() => {
    if (doctorId) return String(doctors.find((d) => d.id === doctorId)?.name ?? "");
    if (branchId) return String(branches.find((c) => c.id === branchId)?.name ?? "");
    return t("allDoctors");
  }, [doctorId, branchId, doctors, branches, t]);

  const patch = useCallback(
    async (a: Appointment, body: { status: AppointmentStatus }) => {
      const ok = await confirm({
        title: t(`confirmStatus.${body.status}`, { patient: patientLabel(a.contact) }),
        description: t("confirmStatusDesc"),
        tone: body.status === "cancelled" ? "danger" : "default",
      });
      if (!ok) return;
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
    [load, t, confirm],
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
        // Cancelling keeps the row (status change) — a write, not a delete.
        return void patch(a, { status: "cancelled" });
      case "confirm":
        return void patch(a, { status: "confirmed" });
      case "complete":
        return void patch(a, { status: "completed" });
      case "noShow":
        return void patch(a, { status: "no_show" });
    }
  };

  // One layout for the list and the export: "Export" writes the columns
  // shown in the list, in the same order.
  const table = useAppointmentTable(true);
  const exportCsv = () => {
    downloadCsv(
      `appointments-${weekStart.toISOString().slice(0, 10)}.csv`,
      recordsToCsv(appointments, exportColumns(table)),
    );
  };

  const q = search.trim().toLowerCase();
  const matches = (a: Appointment) =>
    (!statusFilter || a.status === statusFilter) &&
    (!q ||
    patientLabel(a.contact).toLowerCase().includes(q) ||
    (a.contact?.phone ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, "") || "\u0000"));
  const dayRows = useMemo(() => {
    const start = day.getTime();
    const end = start + 86_400_000;
    return appointments
      .filter((a) => {
        const s = new Date(a.starts_at).getTime();
        return s >= start && s < end && matches(a);
      })
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointments, day, q, statusFilter]);
  const selected = appointments.find((a) => a.id === selectedId) ?? null;

  const step = (dir: -1 | 1) => {
    if (view === "day") {
      const next = addDays(day, dir);
      setDay(next);
      const ws = startOfWeek(next);
      if (ws.getTime() !== weekStart.getTime()) setWeekStart(ws);
    } else {
      setWeekStart((w) => addDays(w, dir * 7));
    }
  };
  const goToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setDay(d);
    setWeekStart(startOfWeek(d));
  };
  const selectCls =
    "h-8 rounded-full border border-input bg-card px-3 text-[12.5px] font-semibold text-foreground outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/20";

  return (
    <div className="flex flex-col gap-[22px]">
      <PageHeading
        actions={
          <>
          {canExport && appointments.length > 0 && (
            <Button variant="outline" onClick={exportCsv}>
              <Download className="size-4" strokeWidth={1.75} />
              {t("actions.export")}
            </Button>
          )}
          {canCreate && (
            <Button variant="outline" onClick={() => openDialog(emptyDraft())}>
              <Plus className="size-4" strokeWidth={2.2} />
              {t("actions.add")}
            </Button>
          )}
          </>
        }
      />

      {/* Toolbar — reference `.toolbar`: segmented view, date nav, filters, search. */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="inline-flex gap-0.5 rounded-[9px] bg-sunken p-[3px]" role="tablist">
          {(["day", "week"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn(
                "h-7 rounded-[7px] px-3 text-[12.5px] font-semibold transition-colors",
                view === v ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`view.${v}`)}
            </button>
          ))}
        </div>
        <div className="ml-1 flex items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label={t("prev")} onClick={() => step(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            {t("today")}
          </Button>
          <Button variant="outline" size="icon-sm" aria-label={t("next")} onClick={() => step(1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <NativeSelect
          value={branchId}
          onChange={(e) => {
            setBranchId(e.target.value);
            setDoctorId("");
          }}
          className={selectCls}
          aria-label={t("filterBranch")}
        >
          <option value="">{t("allBranches")}</option>
          {branches.map((c) => (
            <option key={c.id} value={c.id}>
              {String(c.name)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
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
        </NativeSelect>
        {statusFilter ? (
          <button
            type="button"
            onClick={() => setStatusFilter(null)}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-input bg-card px-3 text-[13px] text-foreground hover:bg-muted"
            aria-label={t("clearStatusFilter")}
          >
            {t("statusFilter", { status: t(`status.${statusFilter}`) })}
            <X className="size-3.5 text-muted-foreground" strokeWidth={2} />
          </button>
        ) : null}
        <label className="ml-auto flex h-9 w-full items-center gap-2 rounded-[10px] border border-input bg-card px-3 text-[13.5px] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/20 sm:w-[260px]">
          <Search className="size-4 shrink-0 text-muted-foreground/70" strokeWidth={1.75} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground/70"
          />
        </label>
      </div>

      <AppointmentActions
        selected={selected}
        canCreate={canCreate}
        canEdit={canEdit}
        onAdd={() => openDialog(emptyDraft())}
        onAction={onAction}
      />

      {view === "week" ? (
        <AppointmentCalendar
          weekStart={weekStart}
          appointments={appointments.filter(matches)}
          loading={loading}
          subject={subject}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAdd={() => openDialog(emptyDraft())}
          onAction={onAction}
          canEdit={canEdit}
          onSlotClick={canCreate ? (start) => openDialog(emptyDraft(start)) : undefined}
        />
      ) : (
        <AppointmentList
          table={table}
          appointments={dayRows}
          loading={loading}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAction={onAction}
          canEdit={canEdit}
          emptyLabel={t("emptyDay")}
        />
      )}

      <AppointmentDialog
        draft={draft}
        mode={dialogMode}
        doctors={doctors}
        branches={branches}
        onClose={() => setDraft(null)}
        onSaved={() => {
          setDraft(null);
          void load();
        }}
      />
    </div>
  );
}
