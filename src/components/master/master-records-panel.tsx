"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
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
  const { canEditSettings } = useAuth();

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

  function openCreate() {
    const empty: Record<string, unknown> = {};
    for (const f of entity.fields) {
      empty[f.key] = f.type === "boolean" ? true : f.type === "clinic" ? null : "";
    }
    setDraft(empty);
  }

  function openEdit(record: MasterRecord) {
    const values: Record<string, unknown> = { id: record.id };
    for (const f of entity.fields) values[f.key] = record[f.key] ?? (f.type === "boolean" ? true : f.type === "clinic" ? null : "");
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
      default:
        return v ? String(v) : <span className="text-muted-foreground">—</span>;
    }
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
          canEditSettings ? (
            <Button onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" />
              {t("add", { entity: t(`entitySingular.${entity.labelKey}`) })}
            </Button>
          ) : null
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
                {canEditSettings && <TableHead className="w-24" />}
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
                  {canEditSettings && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(r)} aria-label={t("edit")}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => remove(r.id)}
                          aria-label={t("delete")}
                          className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
            {entity.fields.map((f) => (
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
