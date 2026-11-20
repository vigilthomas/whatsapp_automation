"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Check, ChevronDown, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ModuleId } from "@/lib/auth/module-access";
import { scopesFor, type DataScope, type ScopeType } from "@/lib/auth/permissions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface BranchOption {
  id: string;
  name: string;
}

/**
 * Data access for one granted module in Access control: whose records
 * the role sees — every branch, the member's own branch, only what's
 * assigned to them, or a custom set of branches. The choice is stored
 * on the permission entry (`scope`) and enforced by the API routes and
 * RLS (migration 063); this is only the editor.
 */
export function DataScopePicker({
  module,
  moduleName,
  scope,
  branches,
  branchesLoading,
  disabled,
  onChange,
}: {
  module: ModuleId;
  moduleName: string;
  scope: DataScope;
  branches: BranchOption[];
  branchesLoading: boolean;
  disabled?: boolean;
  onChange: (next: DataScope) => void;
}) {
  const t = useTranslations("Settings.access");
  const [open, setOpen] = useState(false);
  const picked = scope.type === "custom" ? (scope.branches ?? []) : [];
  const customEmpty = scope.type === "custom" && picked.length === 0;

  const label =
    scope.type === "custom"
      ? picked.length === 1
        ? (branches.find((b) => b.id === picked[0])?.name ?? t("customCount", { count: 1 }))
        : t("customCount", { count: picked.length })
      : t(`scope.${scope.type}`);

  const describe = (type: ScopeType) =>
    type === "own" ? t(`scopeOwnDesc.${module === "leaves" ? "leaves" : "appointments"}`) : t(`scopeDesc.${type}`);

  const choose = (type: ScopeType) => {
    if (type === "custom") onChange({ type, branches: picked });
    else {
      onChange({ type });
      setOpen(false);
    }
  };

  const toggleBranch = (id: string) =>
    onChange({
      type: "custom",
      branches: picked.includes(id) ? picked.filter((b) => b !== id) : [...picked, id],
    });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        aria-label={t("scopeAria", { module: moduleName })}
        className={cn(
          "inline-flex h-8 max-w-44 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-medium",
          "hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60",
          customEmpty ? "border-destructive/60 text-destructive" : "text-foreground",
        )}
      >
        {customEmpty ? <AlertTriangle className="size-3.5 shrink-0" /> : null}
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <p className="px-2 pt-1 pb-2 text-xs font-medium text-muted-foreground">
          {t("scopeAria", { module: moduleName })}
        </p>
        <div role="radiogroup" aria-label={t("dataAccess")} className="space-y-0.5">
          {scopesFor(module).map((type) => {
            const on = scope.type === type;
            return (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => choose(type)}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left",
                  on ? "bg-primary/10" : "hover:bg-muted",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                  )}
                >
                  {on ? <span className="size-1.5 rounded-full bg-current" /> : null}
                </span>
                <span className="min-w-0">
                  <span className={cn("block text-sm", on ? "font-medium text-primary" : "text-foreground")}>
                    {t(`scope.${type}`)}
                  </span>
                  <span className="block text-xs text-muted-foreground">{describe(type)}</span>
                </span>
              </button>
            );
          })}
        </div>

        {scope.type === "custom" ? (
          <div className="mt-2 border-t border-border pt-2">
            {branchesLoading ? (
              <p className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> {t("branchesLoading")}
              </p>
            ) : branches.length === 0 ? (
              <p className="px-2.5 py-2 text-xs text-muted-foreground">{t("noBranches")}</p>
            ) : (
              <ul className="max-h-52 space-y-0.5 overflow-y-auto" aria-label={t("scope.custom")}>
                {branches.map((b) => {
                  const on = picked.includes(b.id);
                  return (
                    <li key={b.id}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => toggleBranch(b.id)}
                        className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        <span
                          className={cn(
                            "inline-flex size-4 shrink-0 items-center justify-center rounded border",
                            on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                          )}
                        >
                          {on ? <Check className="size-3" strokeWidth={3} /> : null}
                        </span>
                        <span className="min-w-0 truncate">{b.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {customEmpty && branches.length > 0 ? (
              <p className="flex items-start gap-1.5 px-2.5 pt-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {t("customNone")}
              </p>
            ) : null}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
