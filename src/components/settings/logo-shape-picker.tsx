"use client";

import { useTranslations } from "next-intl";
import { LOGO_SHAPES, type LogoShape } from "@/lib/branding";
import { cn } from "@/lib/utils";

/** As uploaded / Circle / Rounded square. `null` (never chosen) shows as "As uploaded". */
export function LogoShapePicker({
  value,
  onChange,
  disabled,
}: {
  value: LogoShape | null;
  onChange: (s: LogoShape) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("Settings.branding");
  const current = value ?? "original";
  return (
    <div role="radiogroup" aria-label={t("logoShape")} className="inline-flex rounded-lg border border-border p-0.5">
      {LOGO_SHAPES.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={current === s}
          disabled={disabled}
          onClick={() => onChange(s)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground disabled:opacity-60",
            current === s ? "bg-primary-soft text-primary" : "hover:bg-muted",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "inline-block size-3 border-[1.5px] border-current",
              s === "circle" ? "rounded-full" : s === "rounded" ? "rounded-[3px]" : "h-2.5 w-3.5",
            )}
          />
          {t(`shapes.${s}`)}
        </button>
      ))}
    </div>
  );
}
