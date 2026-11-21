"use client";

/**
 * Cards added with the per-business-type dashboards: ranked bars
 * (bookings by staff, top services) and broadcast results. Same shell
 * and look as clinic-widgets.
 */
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import type { BroadcastResults } from "@/lib/dashboard/range-queries";
import { CardShell } from "./clinic-widgets";

function Spinner() {
  return (
    <div className="flex flex-1 items-center justify-center py-8">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}

/** Horizontal bars, longest first. */
export function RankList({
  title,
  rows,
  loading,
  hrefLabel,
}: {
  title: string;
  rows: { label: string; count: number }[] | null;
  loading: boolean;
  hrefLabel: string;
}) {
  const t = useTranslations("Dashboard.range");
  const max = Math.max(1, ...(rows ?? []).map((r) => r.count));
  return (
    <CardShell title={title} href="/appointments" hrefLabel={hrefLabel}>
      {loading || !rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="px-5 pb-6 text-center text-sm text-muted-foreground">{t("nothingBooked")}</p>
      ) : (
        <ul className="flex flex-col gap-3 px-5 pt-1 pb-[18px]">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-3">
              <span className="w-[38%] min-w-0 truncate text-[13px] font-medium text-foreground">{r.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-sunken">
                <div className="h-full rounded-full bg-teal" style={{ width: `${Math.round((r.count / max) * 100)}%` }} />
              </div>
              <span className="w-10 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{r.count}</span>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

export function BroadcastResultsCard({ data, loading }: { data: BroadcastResults | null; loading: boolean }) {
  const t = useTranslations("Dashboard.range");
  const pct = (n: number) => (data?.sent ? `${Math.round((n / data.sent) * 100)}%` : "—");
  const cells = data
    ? [
        { label: t("sent"), value: data.sent.toLocaleString(), sub: t("broadcastCount", { count: data.count }) },
        { label: t("delivered"), value: data.delivered.toLocaleString(), sub: pct(data.delivered) },
        { label: t("read"), value: data.read.toLocaleString(), sub: pct(data.read) },
      ]
    : [];
  return (
    <CardShell title={t("broadcasts")} href="/broadcasts" hrefLabel={t("viewAll")}>
      {loading || !data ? (
        <Spinner />
      ) : data.count === 0 ? (
        <p className="px-5 pb-6 text-center text-sm text-muted-foreground">{t("noBroadcasts")}</p>
      ) : (
        <div className="grid grid-cols-3 gap-3 px-5 pt-1 pb-5">
          {cells.map((c) => (
            <div key={c.label} className="rounded-xl bg-sunken p-3">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="mt-1 font-heading text-2xl font-semibold tabular-nums text-foreground">{c.value}</p>
              <p className="text-[11px] text-muted-foreground">{c.sub}</p>
            </div>
          ))}
        </div>
      )}
    </CardShell>
  );
}
