"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, UserPlus } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import type { AccountMember } from "@/types";
import type { AccountRole } from "@/lib/auth/roles";
import type { MasterRecord } from "@/lib/master/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { useConfirm } from "@/components/ui/confirm-dialog";

const STAFF_TYPES = ["doctor", "assistant", "other"] as const;
type StaffType = (typeof STAFF_TYPES)[number];
const ROLES: AccountRole[] = ["admin", "agent", "viewer"];

interface NewUser {
  full_name: string;
  email: string;
  password: string;
  clinic_id: string;
  staff_type: StaffType;
  designation_id: string;
  role: AccountRole;
  speciality: string;
  phone: string;
}

const EMPTY: NewUser = {
  full_name: "",
  email: "",
  password: "",
  clinic_id: "",
  staff_type: "doctor",
  designation_id: "",
  role: "agent",
  speciality: "",
  phone: "",
};

const selectCls =
  "h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60";

/**
 * Master → Users. A clinic admin adds a doctor / assistant / other
 * staff member with a login in one step (name, email, password,
 * clinic, designation), and edits each user's clinic, designation
 * and staff type inline. Removing a user goes through the existing
 * members API (remove_account_member).
 *
 * Every control is gated on the caller's `users` permissions; the
 * routes behind them check the same matrix.
 */
export function UsersPanel() {
  const t = useTranslations("Master.users");
  const tRoles = useTranslations("Settings.roles");
  const confirm = useConfirm();
  const { user, can } = useAuth();
  const canWrite = can("users", "write");
  const canDelete = can("users", "delete");

  const [members, setMembers] = useState<AccountMember[]>([]);
  const [clinics, setClinics] = useState<MasterRecord[]>([]);
  const [designations, setDesignations] = useState<MasterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [draft, setDraft] = useState<NewUser | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, c, d] = await Promise.all([
        fetch("/api/account/members", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/master/clinics", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
        fetch("/api/master/designations", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      ]);
      setMembers(Array.isArray(m.members) ? m.members : []);
      setClinics(Array.isArray(c.records) ? c.records : []);
      setDesignations(Array.isArray(d.records) ? d.records : []);
    } catch {
      toast.error(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const clinicName = useMemo(() => {
    const map = new Map(clinics.map((c) => [c.id, String(c.name)]));
    return (id: string | null) => (id ? (map.get(id) ?? "—") : "—");
  }, [clinics]);

  async function patchMember(
    m: AccountMember,
    body: Partial<{ clinic_id: string | null; designation_id: string | null; staff_type: string | null; role: AccountRole }>,
    confirmTitle: string,
  ) {
    if (!(await confirm({ title: confirmTitle, description: t("confirmChangeDesc") }))) return;
    setBusyId(m.user_id);
    try {
      const res = await fetch(`/api/account/members/${m.user_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t("updateFailed"));
        return;
      }
      toast.success(t("updated"));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function removeMember(m: AccountMember) {
    const ok = await confirm({
      title: t("confirmRemoveTitle", { name: m.full_name || m.email || "" }),
      description: t("confirmRemoveDesc"),
      tone: "danger",
      confirmLabel: t("remove"),
    });
    if (!ok) return;
    setBusyId(m.user_id);
    try {
      const res = await fetch(`/api/account/members/${m.user_id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t("removeFailed"));
        return;
      }
      toast.success(t("removed"));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function createUser() {
    if (!draft) return;
    if (!draft.full_name.trim() || !draft.email.trim() || draft.password.length < 8) {
      toast.error(t("validation"));
      return;
    }
    const ok = await confirm({
      title: t("confirmCreateTitle", { name: draft.full_name.trim() }),
      description: t("confirmCreateDesc", { email: draft.email.trim() }),
      confirmLabel: t("create"),
    });
    if (!ok) return;
    setSaving(true);
    try {
      const res = await fetch("/api/account/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          clinic_id: draft.clinic_id || null,
          designation_id: draft.designation_id || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t("createFailed"));
        return;
      }
      toast.success(t("created"));
      setDraft(null);
      await load();
    } catch {
      toast.error(t("createFailed"));
    } finally {
      setSaving(false);
    }
  }

  const set = <K extends keyof NewUser>(k: K, v: NewUser[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  return (
    <div>
      <SettingsPanelHead
        title={t("title")}
        description={t("description")}
        action={
          canWrite ? (
            <Button onClick={() => setDraft(EMPTY)}>
              <UserPlus className="mr-1 size-4" />
              {t("addUser")}
            </Button>
          ) : null
        }
      />

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-muted-foreground">{t("cols.user")}</TableHead>
                <TableHead className="text-muted-foreground">{t("cols.clinic")}</TableHead>
                <TableHead className="text-muted-foreground">{t("cols.staffType")}</TableHead>
                <TableHead className="text-muted-foreground">{t("cols.designation")}</TableHead>
                <TableHead className="text-muted-foreground">{t("cols.role")}</TableHead>
                {canDelete && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => {
                const isSelf = m.user_id === user?.id;
                const isOwner = m.role === "owner";
                const editable = canWrite && !isOwner && !isSelf;
                const busy = busyId === m.user_id;
                return (
                  <TableRow key={m.user_id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8">
                          {m.avatar_url ? <AvatarImage src={m.avatar_url} alt="" /> : null}
                          <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                            {(m.full_name || m.email || "U").charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">
                            {m.full_name || t("unnamed")}
                            {isSelf ? <span className="ml-2 text-xs text-muted-foreground">({t("you")})</span> : null}
                          </div>
                          {m.email ? <div className="truncate text-xs text-muted-foreground">{m.email}</div> : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {editable ? (
                        <select
                          value={m.clinic_id ?? ""}
                          disabled={busy}
                          onChange={(e) =>
                            patchMember(m, { clinic_id: e.target.value || null }, t("confirmClinic", { name: m.full_name || "" }))
                          }
                          className={selectCls}
                        >
                          <option value="">—</option>
                          {clinics.map((c) => (
                            <option key={c.id} value={c.id}>
                              {String(c.name)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-sm text-muted-foreground">{clinicName(m.clinic_id)}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editable ? (
                        <select
                          value={m.staff_type ?? ""}
                          disabled={busy}
                          onChange={(e) =>
                            patchMember(m, { staff_type: e.target.value || null }, t("confirmStaffType", { name: m.full_name || "" }))
                          }
                          className={selectCls}
                        >
                          <option value="">—</option>
                          {STAFF_TYPES.map((s) => (
                            <option key={s} value={s}>
                              {t(`staff.${s}`)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {m.staff_type ? t(`staff.${m.staff_type}`) : "—"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editable ? (
                        <select
                          value={m.designation_id ?? ""}
                          disabled={busy}
                          onChange={(e) =>
                            patchMember(m, { designation_id: e.target.value || null }, t("confirmDesignation", { name: m.full_name || "" }))
                          }
                          className={selectCls}
                        >
                          <option value="">{t("noDesignation")}</option>
                          {designations.map((d) => (
                            <option key={d.id} value={d.id}>
                              {String(d.name)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {designations.find((d) => d.id === m.designation_id)?.name
                            ? String(designations.find((d) => d.id === m.designation_id)?.name)
                            : t("noDesignation")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editable ? (
                        <select
                          value={m.role}
                          disabled={busy}
                          onChange={(e) =>
                            patchMember(m, { role: e.target.value as AccountRole }, t("confirmRole", { name: m.full_name || "" }))
                          }
                          className={selectCls}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {tRoles(r)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {tRoles(m.role)}
                        </span>
                      )}
                    </TableCell>
                    {canDelete && (
                      <TableCell>
                        {editable ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={busy}
                            aria-label={t("remove")}
                            onClick={() => removeMember(m)}
                            className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        ) : null}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("addUser")}</DialogTitle>
            <DialogDescription>{t("addDesc")}</DialogDescription>
          </DialogHeader>
          {draft && (
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void createUser();
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label className="text-muted-foreground">{t("fields.name")} *</Label>
                  <Input value={draft.full_name} onChange={(e) => set("full_name", e.target.value)} required autoFocus />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-muted-foreground">{t("fields.staffType")}</Label>
                  <select value={draft.staff_type} onChange={(e) => set("staff_type", e.target.value as StaffType)} className={selectCls}>
                    {STAFF_TYPES.map((s) => (
                      <option key={s} value={s}>
                        {t(`staff.${s}`)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label className="text-muted-foreground">{t("fields.email")} *</Label>
                  <Input type="email" value={draft.email} onChange={(e) => set("email", e.target.value)} required />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-muted-foreground">{t("fields.password")} *</Label>
                  <Input
                    type="password"
                    value={draft.password}
                    onChange={(e) => set("password", e.target.value)}
                    minLength={8}
                    required
                    placeholder={t("fields.passwordHint")}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label className="text-muted-foreground">{t("fields.clinic")}</Label>
                  <select value={draft.clinic_id} onChange={(e) => set("clinic_id", e.target.value)} className={selectCls}>
                    <option value="">—</option>
                    {clinics.map((c) => (
                      <option key={c.id} value={c.id}>
                        {String(c.name)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-muted-foreground">{t("fields.designation")}</Label>
                  <select value={draft.designation_id} onChange={(e) => set("designation_id", e.target.value)} className={selectCls}>
                    <option value="">{t("noDesignation")}</option>
                    {designations.map((d) => (
                      <option key={d.id} value={d.id}>
                        {String(d.name)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {draft.staff_type === "doctor" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label className="text-muted-foreground">{t("fields.speciality")}</Label>
                    <Input value={draft.speciality} onChange={(e) => set("speciality", e.target.value)} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-muted-foreground">{t("fields.phone")}</Label>
                    <Input value={draft.phone} onChange={(e) => set("phone", e.target.value)} />
                  </div>
                </div>
              )}
              <div className="grid gap-1.5">
                <Label className="text-muted-foreground">{t("fields.role")}</Label>
                <select value={draft.role} onChange={(e) => set("role", e.target.value as AccountRole)} className={selectCls}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {tRoles(r)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">{t("fields.roleHint")}</p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDraft(null)} disabled={saving}>
                  {t("cancel")}
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  {t("create")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
