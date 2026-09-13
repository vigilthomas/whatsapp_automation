"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Check, GripVertical, Loader2, LockKeyhole, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import type { ModuleId } from "@/lib/auth/module-access";
import {
  ACTIONS,
  can,
  editorRows,
  movePermission,
  parsePermissions,
  togglePermission,
  type Action,
  type Permissions,
} from "@/lib/auth/permissions";
import type { MasterRecord } from "@/lib/master/entities";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SettingsPanelHead } from "./settings-panel-head";
import { useConfirm } from "@/components/ui/confirm-dialog";

/**
 * Circular tick toggle for one matrix cell. Colours come straight from
 * the theme tokens so it follows light/dark and the colour theme.
 */
function AccessToggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-full border transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-60",
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-transparent hover:border-primary/60",
      )}
    >
      <Check className="size-3.5" strokeWidth={3} />
    </button>
  );
}

/**
 * Access control — pick a designation, then set what it may do.
 *
 * One row per module, five cells (view / read / write / delete /
 * export). Rows the designation grants come first, in the order the
 * admin arranged them — that order IS the sidebar order for everyone
 * holding the designation; ungranted modules follow in default order
 * so they can be switched on. Drag the handle (or use the arrows) to
 * rearrange.
 *
 * Saves to `designations.permissions` via PATCH /api/master/
 * designations/<id>, which itself is gated on `designations:write`,
 * so the same matrix governs who may edit the matrix.
 */
export function AccessControlPanel() {
  const { can: callerCan, profileLoading, refreshProfile } = useAuth();
  const t = useTranslations("Settings.access");
  const tModules = useTranslations("Settings.access.modules");
  const tActions = useTranslations("Settings.access.actions");
  const confirm = useConfirm();

  const [designations, setDesignations] = useState<MasterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Permissions>([]);
  const [saving, setSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/master/designations", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t("loadFailed"));
        return;
      }
      const rows: MasterRecord[] = Array.isArray(data.records) ? data.records : [];
      setDesignations(rows);
      setSelectedId((cur) => cur ?? (rows[0]?.id ?? null));
    } catch {
      toast.error(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => designations.find((d) => d.id === selectedId) ?? null,
    [designations, selectedId],
  );
  const saved = useMemo(() => parsePermissions(selected?.permissions), [selected]);

  // Re-seed the draft when the selection (or a save) changes.
  useEffect(() => {
    setDraft(saved);
  }, [saved]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const editable = !profileLoading && callerCan("designations", "write");
  const rows = useMemo(() => editorRows(draft), [draft]);
  const grantedCount = draft.length;

  const setCell = (module: ModuleId, action: Action, allowed: boolean) =>
    setDraft((d) => togglePermission(d, module, action, allowed));

  const move = (from: number, to: number) => setDraft((d) => movePermission(d, from, to));

  async function save() {
    if (!selected || !dirty) return;
    const ok = await confirm({
      title: t("confirmSaveTitle", { name: String(selected.name) }),
      description: t("confirmSaveDesc"),
      confirmLabel: t("save"),
    });
    if (!ok) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/master/designations/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: draft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t("saveFailed"));
        return;
      }
      toast.success(t("saveSuccess"));
      await load();
      // The editor may have changed their own designation.
      await refreshProfile();
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="max-w-5xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead title={t("title")} description={t("description")} />

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
        {/* Designation picker */}
        <Card className="lg:sticky lg:top-0">
          <CardHeader>
            <CardTitle className="text-sm text-foreground">{t("designations")}</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">{t("designationsHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : designations.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">{t("noDesignations")}</p>
            ) : (
              designations.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setSelectedId(d.id)}
                  aria-current={d.id === selectedId ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    d.id === selectedId
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span className="truncate">{String(d.name)}</span>
                  <span className="ml-2 shrink-0 text-xs tabular-nums opacity-70">
                    {parsePermissions(d.permissions).length}
                  </span>
                </button>
              ))
            )}
            <Link
              href="/master/designations"
              className="mt-2 flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-primary hover:underline"
            >
              <Plus className="size-3.5" /> {t("manageDesignations")}
            </Link>
          </CardContent>
        </Card>

        {/* Matrix */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <LockKeyhole className="size-4 text-primary" />
              {selected ? t("matrixTitleFor", { name: String(selected.name) }) : t("matrixTitle")}
            </CardTitle>
            <CardDescription className="text-muted-foreground">{t("matrixDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selected ? (
              <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
                {t("pickDesignation")}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead className="min-w-40 text-muted-foreground">{t("moduleColumn")}</TableHead>
                      {ACTIONS.map((a) => (
                        <TableHead key={a} className="w-20 text-center text-muted-foreground">
                          {tActions(a)}
                        </TableHead>
                      ))}
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((module, i) => {
                      const granted = i < grantedCount;
                      const isFirstUngranted = i === grantedCount && grantedCount > 0;
                      return (
                        <TableRow
                          key={module}
                          draggable={editable && granted}
                          onDragStart={() => setDragIndex(i)}
                          onDragOver={(e) => {
                            if (dragIndex !== null && granted) e.preventDefault();
                          }}
                          onDrop={() => {
                            if (dragIndex !== null && granted) move(dragIndex, i);
                            setDragIndex(null);
                          }}
                          onDragEnd={() => setDragIndex(null)}
                          className={cn(
                            granted ? "" : "bg-muted/30",
                            isFirstUngranted && "border-t-2 border-t-border",
                            dragIndex === i && "opacity-50",
                          )}
                        >
                          <TableCell className="text-muted-foreground">
                            {granted && editable ? (
                              <GripVertical className="size-4 cursor-grab" aria-hidden />
                            ) : null}
                          </TableCell>
                          <TableCell className={cn("font-medium", granted ? "text-foreground" : "text-muted-foreground")}>
                            {tModules(module)}
                          </TableCell>
                          {ACTIONS.map((a) => (
                            <TableCell key={a} className="text-center">
                              <AccessToggle
                                checked={can(draft, module, a)}
                                disabled={!editable}
                                onChange={(v) => setCell(module, a, v)}
                                label={t("cellAria", { action: tActions(a), module: tModules(module) })}
                              />
                            </TableCell>
                          ))}
                          <TableCell>
                            {granted && editable ? (
                              <div className="flex justify-end gap-0.5">
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label={t("moveUp")}
                                  disabled={i === 0}
                                  onClick={() => move(i, i - 1)}
                                >
                                  <ArrowUp className="size-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label={t("moveDown")}
                                  disabled={i >= grantedCount - 1}
                                  onClick={() => move(i, i + 1)}
                                >
                                  <ArrowDown className="size-3.5" />
                                </Button>
                              </div>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            <p className="text-xs text-muted-foreground">{t("ownerNote")}</p>

            {editable ? (
              <Button onClick={save} disabled={saving || !dirty || !selected}>
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t("saving")}
                  </>
                ) : (
                  t("save")
                )}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">{t("adminOnlyHint")}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
