"use client";

import { useTranslations } from "next-intl";
import { Loader2, Pencil } from "lucide-react";

import { cn } from "@/lib/utils";
import { chipTone, patientLabel, type Appointment, type ChipTone } from "@/lib/appointments/model";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const BADGE: Record<ChipTone, string> = {
  blue: "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
  green: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  amber: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  grey: "bg-muted text-muted-foreground",
};

interface Props {
  appointments: Appointment[];
  loading?: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onEdit: (a: Appointment) => void;
  canEdit: boolean;
}

/** Tabular view of the same window the calendar shows. */
export function AppointmentList({ appointments, loading, selectedId, onSelect, onEdit, canEdit }: Props) {
  const t = useTranslations("Appointments");
  const tStatus = useTranslations("Appointments.status");
  const tSource = useTranslations("Appointments.source");
  const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (appointments.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
        {t("emptyWeek")}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-muted-foreground">{t("list.when")}</TableHead>
            <TableHead className="text-muted-foreground">{t("list.patient")}</TableHead>
            <TableHead className="text-muted-foreground">{t("list.service")}</TableHead>
            <TableHead className="text-muted-foreground">{t("list.doctor")}</TableHead>
            <TableHead className="text-muted-foreground">{t("list.clinic")}</TableHead>
            <TableHead className="text-muted-foreground">{t("list.status")}</TableHead>
            <TableHead className="text-muted-foreground">{t("list.source")}</TableHead>
            {canEdit && <TableHead className="w-12" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {appointments.map((a) => {
            const s = new Date(a.starts_at);
            const e = new Date(a.ends_at);
            const isSel = a.id === selectedId;
            return (
              <TableRow
                key={a.id}
                onClick={() => onSelect(isSel ? null : a.id)}
                aria-selected={isSel}
                className={cn("cursor-pointer", isSel && "bg-primary/5")}
              >
                <TableCell className="whitespace-nowrap">
                  <div className="font-medium text-foreground">{dateFmt.format(s)}</div>
                  <div className="text-xs text-muted-foreground">
                    {timeFmt.format(s)} – {timeFmt.format(e)}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="font-medium text-foreground">{patientLabel(a.contact)}</div>
                  {a.contact?.name ? (
                    <div className="text-xs text-muted-foreground">{a.contact.phone}</div>
                  ) : null}
                </TableCell>
                <TableCell className="text-foreground">{a.service}</TableCell>
                <TableCell className="text-muted-foreground">{a.doctor?.name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{a.clinic?.name ?? "—"}</TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      BADGE[chipTone(a)],
                    )}
                  >
                    {tStatus(a.status)}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{tSource(a.source)}</TableCell>
                {canEdit && (
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("actions.edit")}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(a);
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
