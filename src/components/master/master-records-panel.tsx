"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { formatCurrency } from "@/lib/currency";
import { downloadCsv, recordsToCsv } from "@/lib/master/csv";
import { MASTER_ENTITIES, type MasterEntitySlug, type MasterField, type MasterRecord, isRefType, type RefType } from "@/lib/master/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataTable, exportColumns, useTableLayout, type DataColumn } from "@/components/ui/data-table";
import { NativeSelect } from "@/components/ui/native-select";
import { DateInput } from "@/components/ui/date-time-input";
import { SettingsPanelHead } from "@/components/settings/settings-panel-head";
import { DurationInput, useDurationLabel } from "@/components/ui/duration-input";
import { useConfirm } from "@/components/ui/confirm-dialog";

/** `minutes`: a service's default time, shown next to a doctor's own time. */
type RefOption = { id: string; name: string; minutes?: number };

/** Options for a field that points at another list. Deleted / switched-off records are left out. */
async function loadRefOptions(type: RefType): Promise<RefOption[]> {
  try {
    if (type === "user") {
      const res = await fetch("/api/account/members", { cache: "no-store" });
      const data = (await res.json()) as { members?: { user_id: string; full_name: string | null; email: string | null }[] };
      return (data.members ?? []).map((m) => ({ id: m.user_id, name: m.full_name || m.email || m.user_id }));
    }
    const slug = { branch: "branches", doctor: "doctors", service: "services" }[type];
    const res = await fetch(`/api/master/${slug}`, { cache: "no-store" });
    const data = (await res.json()) as { records?: MasterRecord[] };
    return (data.records ?? []).map((r) => ({
      id: r.id,
      name: String(r.name ?? ""),
      minutes: typeof r.duration_min === "number" ? r.duration_min : undefined,
    }));
  } catch {
    return [];
  }
}

/** One pick of a multi-select field when adding, e.g. a service and the doctor's time for it. */
type Pick = { id: string; minutes: number };

/**
 * Generic list + add/edit/delete UI for one clinic master-data entity.
 * Columns and form fields come from the registry (src/lib/master/
 * entities.ts), so branches, doctors, clinic admins, services and roles share this one
 * component. Reads and writes go through /api/master/<entity>; the
 * route enforces admin-only writes, so non-admins get a read-only
 * table with the action buttons hidden.
 */
export function MasterRecordsPanel({
  slug,
  extraColumns,
  reloadKey = 0,
}: {
  slug: MasterEntitySlug;
  /** Columns a page adds after the entity's own (e.g. Doctors → Login). */
  extraColumns?: DataColumn<MasterRecord>[];
  /** Bump to reload the list after a change made outside this panel. */
  reloadKey?: number;
}) {
  const entity = MASTER_ENTITIES[slug];
  const t = useTranslations("Master");
  const confirm = useConfirm();
  // Every button here mirrors a server-side `requirePermission` on the
  // same module — the UI hides what the API would refuse.
  const { can, defaultCurrency } = useAuth();
  const canWrite = can(entity.module, "write");
  const canEdit = can(entity.module, "edit");
  const canDelete = can(entity.module, "delete");
  const canExport = can(entity.module, "export");

  const [records, setRecords] = useState<MasterRecord[]>([]);
  // Options for fields that point at another list (branch, doctor, service, user).
  const [refs, setRefs] = useState<Record<RefType, RefOption[]>>({ branch: [], doctor: [], service: [], user: [] });
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);

  const refTypes = useMemo(
    () => [...new Set(entity.fields.map((f) => f.type).filter(isRefType))],
    [entity.fields],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [own, ...lists] = await Promise.all([
        fetch(`/api/master/${slug}`, { cache: "no-store" }).then((r) => r.json()),
        ...refTypes.map((type) => loadRefOptions(type)),
      ]);
      // Form-only switches (e.g. "More than one day") worked out per record.
      const virtuals = entity.fields.filter((f) => f.virtual);
      setRecords(
        (Array.isArray(own.records) ? (own.records as MasterRecord[]) : []).map((r) =>
          virtuals.length ? { ...r, ...Object.fromEntries(virtuals.map((f) => [f.key, f.virtual!.derive(r)])) } : r,
        ),
      );
      setRefs((cur) => {
        const next = { ...cur };
        refTypes.forEach((type, i) => (next[type] = lists[i]));
        return next;
      });
    } catch {
      toast.error(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [slug, refTypes, t]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const refName = useMemo(() => {
    const maps = Object.fromEntries(
      Object.entries(refs).map(([type, list]) => [type, new Map(list.map((o) => [o.id, o.name]))]),
    ) as Record<RefType, Map<string, string>>;
    return (type: RefType, id: unknown) => (typeof id === "string" ? (maps[type].get(id) ?? "—") : "—");
  }, [refs]);

  const durationLabel = useDurationLabel();

  const dateLabel = (v: unknown) =>
    typeof v === "string" && v
      ? new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(
          new Date(`${v}T12:00:00`),
        )
      : "—";

  const formFields = entity.fields.filter((f) => f.form !== false);
  // Adding several at once: the multi field becomes a checklist, and a
  // time that defaults from it is set per pick inside that list.
  const multiField = entity.fields.find((f) => f.multiOnCreate && isRefType(f.type));
  const perPickTime = multiField ? formFields.find((f) => f.type === "duration" && f.defaultFrom === multiField.key) : undefined;

  /** Default minutes of the record a `defaultFrom` field points at. */
  const defaultMinutes = (field: MasterField, values: Record<string, unknown> | null | undefined) => {
    if (!field.defaultFrom || !values) return undefined;
    const from = entity.fields.find((f) => f.key === field.defaultFrom);
    if (!from || !isRefType(from.type)) return undefined;
    const id = values[from.key];
    return refs[from.type].find((o) => o.id === id)?.minutes;
  };

  function openCreate() {
    const empty: Record<string, unknown> = {};
    for (const f of formFields) {
      if (f.virtual) {
        empty[f.key] = f.virtual.initial;
        continue;
      }
      if (f === multiField) {
        empty.picks = [] as Pick[];
        continue;
      }
      if (f === perPickTime) continue;
      empty[f.key] =
        f.type === "boolean"
          ? true
          : isRefType(f.type)
            ? null
            : f.type === "select"
              ? (f.options?.[0] ?? "")
              : f.type === "number"
              ? (f.required ? (f.min ?? 0) : "")
              : f.type === "duration"
                ? (f.required ? 30 : 0)
                : "";
    }
    setDraft(empty);
  }

  function openEdit(record: MasterRecord) {
    const values: Record<string, unknown> = { id: record.id };
    for (const f of formFields) {
      values[f.key] = record[f.key] ?? (f.type === "boolean" ? true : isRefType(f.type) ? null : "");
    }
    setDraft(values);
  }

  const save = useCallback(async () => {
    if (!draft) return;
    if (!draft.id && multiField && ((draft.picks as Pick[] | undefined) ?? []).length === 0) {
      toast.error(t("pickOne", { field: t(`fields.${multiField.labelKey}`) }));
      return;
    }
    const singular = t(`entitySingular.${entity.labelKey}`);
    const ok = await confirm({
      title: draft.id ? t("confirmSaveTitle", { entity: singular }) : t("confirmCreateTitle", { entity: singular }),
      description: t("confirmSaveDesc"),
      confirmLabel: draft.id ? t("saveChanges") : t("create"),
    });
    if (!ok) return;
    setSaving(true);
    try {
      const { id, picks, ...rest } = draft;
      const values: Record<string, unknown> = { ...rest };
      // Hidden fields are cleared, and form-only switches aren't sent.
      for (const f of formFields) {
        if (f.virtual) delete values[f.key];
        else if (f.showIf && draft[f.showIf.key] !== f.showIf.equals) values[f.key] = null;
      }
      if (!id && multiField && Array.isArray(picks)) {
        values[`${multiField.key}s`] = (picks as Pick[]).map((p) => ({
          [multiField.key]: p.id,
          ...(perPickTime ? { [perPickTime.key]: p.minutes || null } : {}),
        }));
      }
      const res = await fetch(
        id ? `/api/master/${slug}/${id}` : `/api/master/${slug}`,
        {
          method: id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t("saveFailed"));
        return;
      }
      toast.success(id ? t("updated") : t("created"));
      setDraft(null);
      await load();
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [draft, slug, load, t, confirm, entity.labelKey, multiField, perPickTime]);

  const remove = useCallback(
    async (id: string) => {
      const ok = await confirm({
        title: t("confirmDeleteTitle", { entity: t(`entitySingular.${entity.labelKey}`) }),
        description: t("confirmDelete"),
        tone: "danger",
        confirmLabel: t("delete"),
      });
      if (!ok) return;
      const res = await fetch(`/api/master/${slug}/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? t("deleteFailed"));
        return;
      }
      toast.success(t("deleted"));
      await load();
    },
    [slug, load, t, confirm, entity.labelKey],
  );

  // Enable / disable straight from the list (needs Edit).
  const setActive = useCallback(
    async (record: MasterRecord, key: string, next: boolean) => {
      setRecords((rows) => rows.map((r) => (r.id === record.id ? { ...r, [key]: next } : r)));
      const res = await fetch(`/api/master/${slug}/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? t("saveFailed"));
        await load();
        return;
      }
      toast.success(next ? t("enabled") : t("disabled"));
    },
    [slug, load, t],
  );

  const renderCell = (field: MasterField, record: MasterRecord) => {
    const v = record[field.key];
    switch (field.type) {
      case "boolean":
        if (canEdit) {
          return (
            <span className="inline-flex items-center gap-2">
              <Switch
                checked={!!v}
                onCheckedChange={(next: boolean) => void setActive(record, field.key, next)}
                aria-label={v ? t("disable") : t("enable")}
              />
              <span className="text-xs text-muted-foreground">{v ? t("active") : t("inactive")}</span>
            </span>
          );
        }
        return (
          <span
            className={
              v
                ? "rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
            }
          >
            {v ? t("active") : t("inactive")}
          </span>
        );
      case "branch":
      case "doctor":
      case "service":
      case "user":
        return refName(field.type, v);
      case "date":
        return dateLabel(v);
      case "select":
        return typeof v === "string" && v ? t(`options.${field.key}.${v}`) : "—";
      case "duration": {
        if (typeof v === "number" && v > 0) return durationLabel(v);
        const fallback = defaultMinutes(field, record);
        return (
          <span className="text-muted-foreground">
            {fallback ? t("defaultTime", { time: durationLabel(fallback) }) : "—"}
          </span>
        );
      }
      case "number": {
        if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">—</span>;
        const n = typeof v === "number" ? v : Number(v);
        if (!Number.isFinite(n)) return "—";
        if (field.money) return formatCurrency(n, defaultCurrency);
        return field.unit ? `${n} ${field.unit}` : String(n);
      }
      default:
        return v ? String(v) : <span className="text-muted-foreground">—</span>;
    }
  };

  // Every saved field is a column: the list's usual ones show by default,
  // the rest can be switched on from the column menu.
  const columns: DataColumn<MasterRecord>[] = entity.fields
    .filter((f) => f.type !== "permissions" && !f.virtual)
    .map((f) => ({
      id: f.key,
      header: t(`fields.${f.labelKey}`),
      hideable: f.key !== "name",
      defaultHidden: !f.list,
      width: f.type === "boolean" ? 150 : f.key === "name" ? 220 : f.type === "textarea" ? 260 : 170,
      className: f.key === "name" ? "font-medium text-foreground" : undefined,
      cell: (r: MasterRecord) => (f.showIf && r[f.showIf.key] !== f.showIf.equals ? "" : renderCell(f, r)),
      exportValue: (r: MasterRecord) => {
        const v = r[f.key];
        if (f.showIf && r[f.showIf.key] !== f.showIf.equals) return "";
        if (isRefType(f.type)) return refName(f.type, v);
        if (f.type === "boolean") return v ? t("active") : t("inactive");
        if (f.type === "select") return typeof v === "string" && v ? t(`options.${f.key}.${v}`) : "";
        return v == null ? "" : String(v);
      },
    }));
  if (extraColumns) columns.push(...extraColumns);
  const table = useTableLayout(`master.${slug}`, columns);

  // Only the columns on screen, in their on-screen order.
  const exportCsv = () => {
    downloadCsv(`${slug}.csv`, recordsToCsv(records, exportColumns(table)));
  };

  const renderPicks = (field: MasterField & { type: RefType }) => {
    const picks = (draft?.picks as Pick[] | undefined) ?? [];
    const setPicks = (next: Pick[]) => setDraft((d) => (d ? { ...d, picks: next } : d));
    const options = refs[field.type];
    if (options.length === 0) {
      return <p className="text-sm text-muted-foreground">{t("noOptions")}</p>;
    }
    return (
      <div className="grid max-h-72 gap-1 overflow-y-auto rounded-lg border border-border p-1.5">
        {options.map((o) => {
          const pick = picks.find((p) => p.id === o.id);
          return (
            <div key={o.id} className={pick ? "rounded-md bg-muted/60 p-2" : "rounded-md p-2"}>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={!!pick}
                  onChange={(e) =>
                    setPicks(e.target.checked ? [...picks, { id: o.id, minutes: 0 }] : picks.filter((p) => p.id !== o.id))
                  }
                />
                <span className="flex-1">{o.name}</span>
                {o.minutes ? (
                  <span className="text-xs text-muted-foreground">{t("defaultTime", { time: durationLabel(o.minutes) })}</span>
                ) : null}
              </label>
              {pick && perPickTime ? (
                <div className="mt-2 grid gap-1 pl-6">
                  <span className="text-xs text-muted-foreground">{t(`fields.${perPickTime.labelKey}`)}</span>
                  <DurationInput
                    value={pick.minutes}
                    onChange={(minutes) => setPicks(picks.map((p) => (p.id === o.id ? { ...p, minutes } : p)))}
                   
                  />
                  <span className="text-xs text-muted-foreground">
                    {o.minutes ? t("defaultTimeHint", { time: durationLabel(o.minutes) }) : t("defaultTimeEmpty")}
                  </span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  const renderInput = (field: MasterField) => {
    if (!draft) return null;
    if (!draft.id && field === multiField) return renderPicks(multiField as MasterField & { type: RefType });
    const v = draft[field.key];
    const set = (next: unknown) => setDraft((d) => (d ? { ...d, [field.key]: next } : d));
    switch (field.type) {
      case "textarea":
        return (
          <Textarea
            value={typeof v === "string" ? v : ""}
            onChange={(e) => set(e.target.value)}
            rows={3}
          />
        );
      case "boolean":
        if (field.virtual) {
          return (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <input type="checkbox" className="size-4 accent-primary" checked={!!v} onChange={(e) => set(e.target.checked)} />
              {t(`fields.${field.labelKey}`)}
            </label>
          );
        }
        return (
          <div className="flex items-center gap-2">
            <Switch checked={!!v} onCheckedChange={(c) => set(!!c)} />
            <span className="text-sm text-muted-foreground">
              {v ? t("active") : t("inactive")}
            </span>
          </div>
        );
      case "number":
        return (
          <Input
            type="number"
            min={field.min}
            step={field.step}
            value={typeof v === "number" ? v : typeof v === "string" ? v : ""}
            onChange={(e) => set(e.target.value === "" ? "" : Number(e.target.value))}
            required={field.required}
          />
        );
      case "branch":
      case "doctor":
      case "service":
      case "user":
        return (
          <NativeSelect
            value={typeof v === "string" ? v : ""}
            onChange={(e) => set(e.target.value || null)}
            required={field.required}
            className="w-full"
          >
            <option value="">{field.required ? t("choose") : t(`none.${field.type}`)}</option>
            {refs[field.type].map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </NativeSelect>
        );
      case "select":
        return (
          <NativeSelect
            value={typeof v === "string" ? v : ""}
            onChange={(e) => set(e.target.value)}
            required={field.required}
            className="w-full"
          >
            {(field.options ?? []).map((o) => (
              <option key={o} value={o}>
                {t(`options.${field.key}.${o}`)}
              </option>
            ))}
          </NativeSelect>
        );
      case "duration": {
        const fallback = defaultMinutes(field, draft);
        return (
          <div className="grid gap-1">
            <DurationInput value={typeof v === "number" ? v : 0} onChange={set} />
            {field.defaultFrom ? (
              <span className="text-xs text-muted-foreground">
                {fallback ? t("defaultTimeHint", { time: durationLabel(fallback) }) : t("defaultTimeEmpty")}
              </span>
            ) : null}
          </div>
        );
      }
      case "date":
        return (
          <DateInput
            value={typeof v === "string" ? v : ""}
            onChange={(e) => set(e.target.value)}
            required={field.required}
          />
        );
      default:
        return (
          <Input
            value={typeof v === "string" ? v : ""}
            onChange={(e) => set(e.target.value)}
            required={field.required}
          />
        );
    }
  };

  return (
    <div>
      <SettingsPanelHead
        title={t(`entities.${entity.labelKey}`)}
        description={t(`entityDesc.${entity.labelKey}`)}
        action={
          <div className="flex items-center gap-2">
            {canExport && records.length > 0 ? (
              <Button variant="outline" onClick={exportCsv}>
                <Download className="h-4 w-4" />
                {t("export")}
              </Button>
            ) : null}
            {canWrite ? (
              <Button onClick={openCreate}>
                <Plus className="mr-1 h-4 w-4" />
                {t("add", { entity: t(`entitySingular.${entity.labelKey}`) })}
              </Button>
            ) : null}
          </div>
        }
      />

      <DataTable
        table={table}
        rows={records}
        rowKey={(r) => r.id}
        loading={loading}
        empty={t("empty", { entity: t(`entities.${entity.labelKey}`).toLowerCase() })}
        trailing={
          canEdit || canDelete
            ? {
                width: 96,
                cell: (r) => (
                  <div className="flex justify-end gap-1">
                    {canEdit && (
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(r)} aria-label={t("edit")}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => remove(r.id)}
                        aria-label={t("delete")}
                        className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ),
              }
            : undefined
        }
      />

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {draft?.id
                ? t("editTitle", { entity: t(`entitySingular.${entity.labelKey}`) })
                : t("addTitle", { entity: t(`entitySingular.${entity.labelKey}`) })}
            </DialogTitle>
            <DialogDescription>{t("dialogDesc")}</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {formFields
              .filter((f) => !f.showIf || draft?.[f.showIf.key] === f.showIf.equals)
              .filter((f) => draft?.id || f !== perPickTime)
              .map((f) => (
              <div key={f.key} className="grid gap-1.5">
                {f.virtual ? null : (
                <Label className="text-muted-foreground">
                  {!draft?.id && f === multiField
                    ? t("pickMany", { field: t(`fields.${f.labelKey}`) })
                    : f.labelIf && draft?.[f.labelIf.key] === f.labelIf.equals
                      ? t(`fields.${f.labelIf.labelKey}`)
                      : t(`fields.${f.labelKey}`)}
                  {f.required && <span className="text-red-500"> *</span>}
                </Label>
                )}
                {renderInput(f)}
              </div>
            ))}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDraft(null)} disabled={saving}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {draft?.id ? t("saveChanges") : t("create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
