"use client";

import { useTranslations } from "next-intl";
import { MoreHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { chipTone, patientLabel, type Appointment, type ChipTone } from "@/lib/appointments/model";
import { Badge } from "@/components/ui/badge";
import { useDurationLabel } from "@/components/ui/duration-input";
import { Button } from "@/components/ui/button";
import { DataTable, useTableLayout, type DataColumn, type TableController } from "@/components/ui/data-table";
import type { CalendarAction } from "@/components/appointments/appointment-calendar";

const TONE_VARIANT: Record<ChipTone, "info" | "success" | "warn" | "neutral"> = {
  blue: "info",
  green: "success",
  amber: "warn",
  grey: "neutral",
};

/**
 * The Appointments table's columns and layout. The page creates it (so
 * its "Export CSV" exports exactly the columns on screen) and passes it
 * to <AppointmentList>. Phone, branch, source, end time and notes are
 * available from the column menu but hidden by default.
 */
export function useAppointmentTable(showDate: boolean): TableController<Appointment> {
  const t = useTranslations("Appointments");
  const tStatus = useTranslations("Appointments.status");
  const durationLabel = useDurationLabel();
  const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  const minutes = (a: Appointment) =>
    Math.max(0, Math.round((new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60000));
  const statusText = (a: Appointment) =>
    a.status === "scheduled" && a.source === "whatsapp" ? t("viaWhatsApp") : tStatus(a.status);

  const columns: DataColumn<Appointment>[] = [
    ...(showDate
      ? [
          {
            id: "date",
            header: t("list.date"),
            width: 130,
            className: "whitespace-nowrap font-medium text-foreground",
            exportValue: (a: Appointment) => dateFmt.format(new Date(a.starts_at)),
            cell: (a: Appointment) => dateFmt.format(new Date(a.starts_at)),
          },
        ]
      : []),
    {
      id: "time",
      header: t("list.time"),
      width: 110,
      className: "whitespace-nowrap font-medium tabular-nums",
      exportValue: (a) => timeFmt.format(new Date(a.starts_at)),
      cell: (a) => timeFmt.format(new Date(a.starts_at)),
    },
    {
      id: "patient",
      header: t("list.patient"),
      hideable: false,
      width: 220,
      exportValue: (a) => patientLabel(a.contact),
      cell: (a) => {
        const phone = a.contact?.phone ?? "";
        const masked = phone.length > 6 ? `${phone.slice(0, -6)}••• ••${phone.slice(-3)}` : phone;
        return (
          <div className="flex flex-col">
            <span className="font-semibold text-foreground">{patientLabel(a.contact)}</span>
            {a.contact?.name && phone ? <span className="text-[11px] text-muted-foreground">{masked}</span> : null}
          </div>
        );
      },
    },
    {
      id: "phone",
      header: "Phone",
      width: 150,
      defaultHidden: true,
      className: "font-mono text-xs",
      exportValue: (a) => a.contact?.phone ?? "",
      cell: (a) => a.contact?.phone || "—",
    },
    {
      id: "service",
      header: t("list.service"),
      width: 180,
      className: "text-foreground",
      exportValue: (a) => a.service,
      cell: (a) => a.service,
    },
    {
      id: "doctor",
      header: t("list.doctor"),
      width: 170,
      className: "text-foreground",
      exportValue: (a) => a.doctor?.name ?? "",
      cell: (a) => a.doctor?.name ?? "—",
    },
    {
      id: "branch",
      header: t("list.branch"),
      width: 150,
      defaultHidden: true,
      exportValue: (a) => a.branch?.name ?? "",
      cell: (a) => a.branch?.name ?? "—",
    },
    {
      id: "duration",
      header: t("list.duration"),
      width: 120,
      exportValue: (a) => durationLabel(minutes(a)),
      cell: (a) => durationLabel(minutes(a)),
    },
    {
      id: "ends",
      header: "Ends",
      width: 110,
      defaultHidden: true,
      className: "tabular-nums",
      exportValue: (a) => timeFmt.format(new Date(a.ends_at)),
      cell: (a) => timeFmt.format(new Date(a.ends_at)),
    },
    {
      id: "status",
      header: t("list.status"),
      width: 150,
      exportValue: statusText,
      cell: (a) => <Badge variant={TONE_VARIANT[chipTone(a)]}>{statusText(a)}</Badge>,
    },
    {
      id: "source",
      header: t("list.source"),
      width: 120,
      defaultHidden: true,
      exportValue: (a) => a.source,
      cell: (a) => a.source,
    },
    {
      id: "notes",
      header: "Notes",
      width: 220,
      defaultHidden: true,
      exportValue: (a) => a.notes ?? "",
      cell: (a) => a.notes || "—",
    },
  ];
  return useTableLayout("appointments", columns);
}

interface Props {
  table: TableController<Appointment>;
  appointments: Appointment[];
  loading?: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAction: (action: CalendarAction, a: Appointment) => void;
  canEdit: boolean;
  emptyLabel: string;
}

/**
 * Appointments table (modular: columns can be moved, resized, hidden and
 * saved as a preset). Clicking a row selects it for the shared action
 * bar; the inline Reschedule / Confirm / ⋯ buttons stay as a fixed
 * column on the right.
 */
export function AppointmentList({
  table,
  appointments,
  loading,
  selectedId,
  onSelect,
  onAction,
  canEdit,
  emptyLabel,
}: Props) {
  const t = useTranslations("Appointments");
  return (
    <DataTable
      table={table}
      rows={appointments}
      rowKey={(a) => a.id}
      loading={loading}
      empty={emptyLabel}
      onRowClick={(a) => onSelect(a.id === selectedId ? null : a.id)}
      rowClassName={(a) => cn(a.id === selectedId && "bg-mint/60 hover:bg-mint/60 dark:bg-mint")}
      trailing={
        canEdit
          ? {
              width: 250,
              header: (
                <span className="mr-auto text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t("list.actions")}
                </span>
              ),
              cell: (a) => (
                <div className="flex items-center justify-end gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => onAction("reschedule", a)}>
                    {t("actions.reschedule")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={a.status !== "scheduled"}
                    onClick={() => onAction("confirm", a)}
                  >
                    {t("actions.confirm")}
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label={t("actions.edit")}
                    onClick={() => onAction("edit", a)}
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </div>
              ),
            }
          : undefined
      }
    />
  );
}
