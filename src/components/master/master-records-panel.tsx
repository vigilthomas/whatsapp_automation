"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { formatCurrency } from "@/lib/currency";
import { downloadCsv, recordsToCsv } from "@/lib/master/csv";
import {
  MASTER_ENTITIES,
  type MasterEntitySlug,
  type MasterField,
  type MasterRecord,
} from "@/lib/master/entities";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SettingsPanelHead } from "@/components/settings/settings-panel-head";

/**
 * Generic list + add/edit/delete UI for one clinic master-data entity.
 * Columns and form fields come from the registry (src/lib/master/
 * entities.ts), so clinics, doctors and clinic admins share this one
 * component. Reads and writes go through /api/master/<entity>; the
 * route enforces admin-only writes, so non-admins get a read-only
 * table with the action buttons hidden.
 */
export function MasterRecordsPanel({ slug }: { slug: MasterEntitySlug }) {
  const entity = MASTER_ENTITIES[slug];
  const t = useTranslations("Master");
  // Every button here mirrors a server-side `requirePermission` on the
  // same module — the UI hides what the API would refuse.
  const { can, defaultCurrency } = useAuth();
  const canWrite = can(entity.module, "write");
  const canDelete = can(entity.module, "delete");
  const canExport = can(entity.module, "export");

  const [records, setRecords] = useState<MasterRecord[]>([]);
  const [clinics, setClinics] = useState<MasterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);

  const needsClinics = entity.fields.some((f) => f.type === "clinic");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [own, cl] = await Promise.all([
        fetch(`/api/master/${slug}`, { cache: "no-store" }).then((r) => r.json()),
        needsClinics
          ? fetch(`/api/master/clinics`, { cache: "no-store" }).then((r) => r.json())
          : Promise.resolve({ records: [] }),
      ]);
      setRecords(Array.isArray(own.records) ? own.records : []);
      setClinics(Array.isArray(cl.records) ? cl.records : []);
    } catch {
      toast.error(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [slug, needsClinics, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const clinicName = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of clinics) map.set(c.id, String(c.name ?? ""));
    return (id: unknown) => (typeof id === "string" ? (map.get(id) ?? "—") : "—");
  }, [clinics]);

  const listFields = entity.fields.filter((f) => f.list);
  const formFields = entity.fields.filter((f) => f.form !== false);

  function openCreate() {
    const empty: Record<string, unknown> = {};
    for (const f of formFields) {
      empty[f.key] =
        f.type === "boolean" ? true : f.type === "clinic" ? null : f.type === "number" ? (f.min ?? 0) : "";
    }
    setDraft(empty);
  }

  function openEdit(record: MasterRecord) {
    const values: Record<string, unknown> = { id: record.id };
    for (const f of formFields) {
      values[f.key] = record[f.key] ?? (f.type === "boolean" ? true : f.type === "clinic" ? null : "");
    }
    setDraft(values);
  }

  const save = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const { id, ...values } = draft;
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
  }, [draft, slug, load, t]);

  const remove = useCallback(
    async (id: string) => {
      if (!window.confirm(t("confirmDelete"))) return;
      const res = await fetch(`/api/master/${slug}/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error(t("deleteFailed"));
        return;
      }
      await load();
    },
    [slug, load, t],
  );

  const renderCell = (field: MasterField, record: MasterRecord) => {
    const v = record[field.key];
    switch (field.type) {
      case "boolean":
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
      case "clinic":
        return clinicName(v);
      case "number": {
        const n = typeof v === "number" ? v : Number(v);
        if (!Number.isFinite(n)) return "—";
        if (field.money) return formatCurrency(n, defaultCurrency);
        return field.unit ? `${n} ${field.unit}` : String(n);
      }
      default:
        return v ? String(v) : <span className="text-muted-foreground">—</span>;
    }
  };

  const exportCsv = () => {
    const columns = entity.fields
      .filter((f) => f.type !== "permissions")
      .map((f) => ({
        key: f.key,
        label: t(`fields.${f.labelKey}`),
        value: (r: MasterRecord) => {
          const v = r[f.key];
          if (f.type === "clinic") return clinicName(v);
          if (f.type === "boolean") return v ? t("active") : t("inactive");
          return v == null ? "" : String(v);
        },
      }));
    downloadCsv(`${slug}.csv`, recordsToCsv(records, columns));
  };

  const renderInput = (field: MasterField) => {
    if (!draft) return null;
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
      case "clinic":
        return (
          <select
            value={typeof v === "string" ? v : ""}
            onChange={(e) => set(e.target.value || null)}
            className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          >
            <option value="">{t("noClinic")}</option>
            {clinics.map((c) => (
              <option key={c.id} value={c.id}>
                {String(c.name)}
              </option>
            ))}
          </select>
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

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : records.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          {t("empty", { entity: t(`entities.${entity.labelKey}`).toLowerCase() })}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                {listFields.map((f) => (
                  <TableHead key={f.key} className="text-muted-foreground">
                    {t(`fields.${f.labelKey}`)}
                  </TableHead>
                ))}
                {(canWrite || canDelete) && <TableHead className="w-24" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r) => (
                <TableRow key={r.id}>
                  {listFields.map((f) => (
                    <TableCell
                      key={f.key}
                      className={f.key === "name" ? "font-medium text-foreground" : "text-muted-foreground"}
                    >
                      {renderCell(f, r)}
                    </TableCell>
                  ))}
                  {(canWrite || canDelete) && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canWrite && (
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
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

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
            {formFields.map((f) => (
              <div key={f.key} className="grid gap-1.5">
                <Label className="text-muted-foreground">
                  {t(`fields.${f.labelKey}`)}
                  {f.required && <span className="text-red-500"> *</span>}
                </Label>
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
