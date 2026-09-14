"use client";

import { useTranslations } from "next-intl";

import { patientLabel, type Appointment } from "@/lib/appointments/model";
import { Button } from "@/components/ui/button";
import type { CalendarAction } from "@/components/appointments/appointment-calendar";

interface Props {
  selected: Appointment | null;
  canEdit: boolean;
  onAdd: () => void;
  onAction: (action: CalendarAction, appointment: Appointment) => void;
}

/**
 * "Actions on a selected appointment" card from the reference
 * Appointments page. Shared by the day table and the week calendar so
 * the one selection drives the same button set everywhere.
 */
export function AppointmentActions({ selected, canEdit, onAdd, onAction }: Props) {
  const t = useTranslations("Appointments");
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  if (!canEdit) return null;
  const disabled = !selected;
  const act = (a: CalendarAction) => selected && onAction(a, selected);

  return (
    <section className="rounded-2xl border border-border bg-card px-5 py-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[11.5px] font-bold tracking-[0.06em] text-muted-foreground/80 uppercase">
          {t("selectedActions")}
        </span>
        <span className="truncate text-[11px] text-muted-foreground/80">
          {selected
            ? t("selectedLabel", {
                patient: patientLabel(selected.contact),
                time: timeFmt.format(new Date(selected.starts_at)),
              })
            : t("noneSelected")}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onAdd}>
          {t("actions.add")}
        </Button>
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => act("edit")}>
          {t("actions.edit")}
        </Button>
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => act("reschedule")}>
          {t("actions.reschedule")}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={disabled || selected?.status === "cancelled"}
          onClick={() => act("cancel")}
        >
          {t("actions.cancel")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || selected?.status !== "scheduled"}
          onClick={() => act("confirm")}
        >
          {t("actions.confirm")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || selected?.status === "completed"}
          onClick={() => act("complete")}
        >
          {t("actions.complete")}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={disabled || selected?.status === "no_show"}
          onClick={() => act("noShow")}
        >
          {t("actions.noShow")}
        </Button>
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => act("changeDoctor")}>
          {t("actions.changeDoctor")}
        </Button>
      </div>
    </section>
  );
}
