"use client";

/**
 * Access Control → (role) → Dashboard: one switch per dashboard card of
 * the current business type. Switched-off cards are stored on the role
 * (designations.dashboard_cards, migration 069) and hidden from its
 * dashboard.
 *
 * This decides what the dashboard SHOWS, not what the role can read:
 * a card whose module the role can't read is marked "Needs … → Read"
 * (it won't show until that is granted) but its switch still works, so
 * an admin can set up the dashboard before or after the permissions —
 * the order the two tabs are visited in mustn't matter. Cards built on modules
 * without data scope are marked as whole-business numbers so an admin
 * can switch them off for, say, doctors with "Own" scope.
 */
import { useTranslations } from "next-intl";

import { BRAND_ICONS } from "@/lib/branding-icons";
import type { ModuleId } from "@/lib/auth/module-access";
import { cardDef, isScopedCard } from "@/lib/dashboard/cards";
import { SECTOR_CARDS } from "@/lib/dashboard/sectors";
import type { Sector } from "@/lib/vocabulary";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function DashboardCardsTab({
  sector,
  disabled,
  canRead,
  moduleName,
  editable,
  onToggle,
}: {
  sector: Sector;
  /** Card ids switched off for this role (the draft). */
  disabled: string[];
  /** Whether the role (draft permissions) can read a module. */
  canRead: (m: ModuleId) => boolean;
  moduleName: (m: ModuleId) => string;
  editable: boolean;
  onToggle: (id: string, on: boolean) => void;
}) {
  const t = useTranslations("Settings.access");
  const td = useTranslations("Dashboard");
  const off = new Set(disabled);

  return (
    <div className="space-y-3">
      <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">{t("dashboardNote")}</p>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {SECTOR_CARDS[sector].map((id) => {
          const def = cardDef(id);
          if (!def) return null;
          const Icon = BRAND_ICONS[def.icon];
          const readable = !def.module || canRead(def.module);
          const title = td(`cards.${id}`, { range: "", day: "" }).trim();
          const on = !off.has(id);
          return (
            <li key={id} className={cn("flex items-center gap-3 px-4 py-3", !readable && "opacity-60")}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                {Icon ? <Icon className="size-4" strokeWidth={1.75} /> : null}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {!def.module
                    ? t("cardEveryone")
                    : !readable
                      ? t("needsRead", { module: moduleName(def.module) })
                      : isScopedCard(def)
                        ? moduleName(def.module)
                        : `${moduleName(def.module)} · ${t("wholeBusinessNumbers")}`}
                </p>
              </div>
              <Switch
                checked={on}
                disabled={!editable}
                onCheckedChange={(v) => onToggle(id, v)}
                aria-label={title}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
