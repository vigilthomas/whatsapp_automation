"use client";

import { useTranslations } from "next-intl";
import { Loader2, MoreHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { chipTone, patientLabel, type Appointment, type ChipTone } from "@/lib/appointments/model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CalendarAction } from "@/components/appointments/appointment-calendar";

const TONE_VARIANT: Record<ChipTone, "info" | "success" | "warn" | "neutral"> = {
  blue: "info",
  green: "success",
  amber: "warn",
  grey: "neutral",
};

interface Props {
  appointments: Appointment[];
  loading?: boolean;
  /** Show the date column (week window); the day view hides it. */
  showDate?: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAction: (action: CalendarAction, a: Appointment) => void;
  canEdit: boolean;
  emptyLabel: string;
}

/**
 * Reference Appointments table: Time · Patient (+ masked phone) ·
 * Service · Doctor · Duration · Status · inline Reschedule / Confirm.
 * Clicking a row selects it for the shared action bar.
 */
export function AppointmentList({
  appointments,
  loading,
  showDate = false,
  selectedId,
  onSelect,
  onAction,
  canEdit,
  emptyLabel,
}: Props) {
  const t = useTranslations("Appointments");
  const tStatus = useTranslations("Appointments.status");
  const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

  const th = "px-5 py-2.5 text-left text-[11.5px] font-semibold tracking-[0.04em] text-muted-foreground/80 uppercase bg-card-2 border-b border-border";
  const td = "px-5 py-[13px] border-b border-border align-middle";

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {showDate && <th className={cn(th, "w-[120px]")}>{t("list.date")}</th>}
              <th className={cn(th, "w-[110px]")}>{t("list.time")}</th>
              <th className={th}>{t("list.patient")}</th>
              <th className={th}>{t("list.service")}</th>
              <th className={th}>{t("list.doctor")}</th>
              <th className={th}>{t("list.duration")}</th>
              <th className={th}>{t("list.status")}</th>
              {canEdit && <th className={cn(th, "w-[230px]")}>{t("list.actions")}</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="py-10 text-center">
                  <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                </td>
              </tr>
            ) : appointments.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              appointments.map((a) => {
                const s = new Date(a.starts_at);
                const e = new Date(a.ends_at);
                const mins = Math.max(0, Math.round((e.getTime() - s.getTime()) / 60000));
                const isSel = a.id === selectedId;
                const phone = a.contact?.phone ?? "";
                const maskedPhone = phone.length > 6 ? `${phone.slice(0, -6)}••• ••${phone.slice(-3)}` : phone;
                return (
                  <tr
                    key={a.id}
                    onClick={() => onSelect(isSel ? null : a.id)}
                    aria-selected={isSel}
                    className={cn(
                      "cursor-pointer transition-colors last:[&>td]:border-b-0 hover:[&>td]:bg-card-2",
                      isSel && "[&>td]:bg-mint/60 dark:[&>td]:bg-mint",
                    )}
                  >
                    {showDate && (
                      <td className={cn(td, "whitespace-nowrap font-medium text-foreground")}>{dateFmt.format(s)}</td>
                    )}
                    <td className={cn(td, "whitespace-nowrap font-medium text-muted-foreground tabular-nums")}>
                      {timeFmt.format(s)}
                    </td>
                    <td className={td}>
                      <div className="flex flex-col">
                        <span className="font-semibold text-foreground">{patientLabel(a.contact)}</span>
                        {a.contact?.name && phone ? (
                          <span className="text-[11px] text-muted-foreground">{maskedPhone}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className={cn(td, "text-foreground")}>{a.service}</td>
                    <td className={cn(td, "text-foreground")}>{a.doctor?.name ?? "—"}</td>
                    <td className={cn(td, "text-muted-foreground")}>{t("list.minutes", { count: mins })}</td>
                    <td className={td}>
                      <Badge variant={TONE_VARIANT[chipTone(a)]}>
                        {a.status === "scheduled" && a.source === "whatsapp" ? t("viaWhatsApp") : tStatus(a.status)}
                      </Badge>
                    </td>
                    {canEdit && (
                      <td className={td}>
                        <div className="flex items-center gap-1.5" onClick={(ev) => ev.stopPropagation()}>
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
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
