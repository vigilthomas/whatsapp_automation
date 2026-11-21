"use client";

/**
 * The dashboard's filter bar: date range (Today by default) and branch.
 * State lives in the URL (lib/dashboard/filters.ts); this only renders
 * it and reports changes. The branch list is already limited to what the
 * viewer's data scope allows (`branchChoices`).
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarRange } from "lucide-react";

import type { BranchOption, DashboardFilters } from "@/lib/dashboard/filters";
import { RANGE_PRESETS, type DateRange, type RangePreset } from "@/lib/dashboard/range";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

export function FilterBar({
  filters,
  range,
  today,
  branches,
  onChange,
}: {
  filters: DashboardFilters;
  /** The resolved range, for the custom inputs' starting values. */
  range: DateRange | null;
  /** Today in the business timezone (YYYY-MM-DD), the custom inputs' max. */
  today: string | null;
  branches: { options: BranchOption[]; showAll: boolean; hidden: boolean };
  onChange: (f: DashboardFilters) => void;
}) {
  const t = useTranslations("Dashboard.filters");
  const [customOpen, setCustomOpen] = useState(filters.preset === "custom");
  const [from, setFrom] = useState(filters.from ?? range?.fromDay ?? "");
  const [to, setTo] = useState(filters.to ?? range?.toDay ?? "");

  const pick = (preset: RangePreset) => {
    if (preset === "custom") {
      setFrom(range?.fromDay ?? "");
      setTo(range?.toDay ?? "");
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    onChange({ preset, branch: filters.branch });
  };
  const applyCustom = () => {
    if (from && to) onChange({ preset: "custom", from, to, branch: filters.branch });
  };

  const active = customOpen ? "custom" : filters.preset;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-card sm:flex-row sm:flex-wrap sm:items-center">
      <div role="group" aria-label={t("range")} className="flex flex-wrap items-center gap-1">
        <CalendarRange className="mr-1 hidden size-4 text-muted-foreground sm:block" strokeWidth={1.75} aria-hidden />
        {RANGE_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => pick(p)}
            aria-pressed={active === p}
            className={cn(
              "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
              active === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {t(p)}
          </button>
        ))}
      </div>

      {customOpen ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {t("from")}
            <input
              type="date"
              value={from}
              max={to || today || undefined}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8 rounded-lg border border-input bg-background px-2 text-[13px] text-foreground"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {t("to")}
            <input
              type="date"
              value={to}
              min={from || undefined}
              max={today || undefined}
              onChange={(e) => setTo(e.target.value)}
              className="h-8 rounded-lg border border-input bg-background px-2 text-[13px] text-foreground"
            />
          </label>
          <button
            type="button"
            onClick={applyCustom}
            disabled={!from || !to}
            className="h-8 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground disabled:opacity-50"
          >
            {t("apply")}
          </button>
          <span className="text-[11px] text-muted-foreground">{t("maxRange")}</span>
        </div>
      ) : null}

      {!branches.hidden ? (
        <div className="sm:ml-auto">
          <NativeSelect
            aria-label={t("branch")}
            value={filters.branch ?? ""}
            onChange={(e) => {
              const next = e.target.value || null;
              if (next !== filters.branch) onChange({ ...filters, branch: next });
            }}
            className="h-8 min-w-[180px] text-[13px]"
          >
            {branches.showAll ? <option value="">{t("allBranches")}</option> : null}
            {branches.options.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : null}
    </div>
  );
}
