"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * "1 h 30 min", "45 min", "2 h" — every time length in the app is shown
 * this way. 0 (or less) reads as "0 min".
 */
export function useDurationLabel() {
  const t = useTranslations("Duration");
  return useCallback(
    (minutes: number) => {
      const total = Math.max(0, Math.round(minutes));
      const h = Math.floor(total / 60);
      const m = total % 60;
      if (!h) return `${m} ${t("min")}`;
      return m ? `${h} ${t("h")} ${m} ${t("min")}` : `${h} ${t("h")}`;
    },
    [t],
  );
}

/**
 * Hours + minutes boxes for a time stored in minutes. Every duration
 * input in the app uses this, so nobody has to work out "90" for 1½ h.
 */
export function DurationInput({
  value,
  onChange,
  maxHours = 12,
  minuteStep = 5,
  disabled,
  id,
  className,
}: {
  value: number;
  onChange: (minutes: number) => void;
  maxHours?: number;
  minuteStep?: number;
  disabled?: boolean;
  /** Put on the hours box, so a <Label htmlFor> focuses it. */
  id?: string;
  className?: string;
}) {
  const t = useTranslations("Duration");
  const total = Math.max(0, Math.round(value || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Input
        id={id}
        type="number"
        min={0}
        max={maxHours}
        value={h}
        disabled={disabled}
        onChange={(e) => onChange(Math.min(maxHours, Math.max(0, Math.floor(Number(e.target.value) || 0))) * 60 + m)}
        className="w-20"
        aria-label={t("hours")}
      />
      <span className="text-sm text-muted-foreground">{t("h")}</span>
      <Input
        type="number"
        min={0}
        max={59}
        step={minuteStep}
        value={m}
        disabled={disabled}
        onChange={(e) => onChange(h * 60 + Math.min(59, Math.max(0, Math.floor(Number(e.target.value) || 0))))}
        className="w-20"
        aria-label={t("minutes")}
      />
      <span className="text-sm text-muted-foreground">{t("min")}</span>
    </div>
  );
}
