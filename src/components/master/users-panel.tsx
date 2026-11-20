"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Link2, Loader2, MailX, Plus, Trash2, UserPlus } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { useBranding } from "@/hooks/use-branding";
import { isBookableRole } from "@/lib/master/staff";
import { resolveTerms } from "@/lib/vocabulary";
import type { AccountMember } from "@/types";
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
import { DataTable, useTableLayout, type DataColumn } from "@/components/ui/data-table";
import { NativeSelect } from "@/components/ui/native-select";
import { SettingsPanelHead } from "@/components/settings/settings-panel-head";
import { InviteMemberDialog } from "@/components/settings/invite-member-dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface NewUser {
  full_name: string;
  email: string;
  password: string;
  branch_id: string;
  designation_id: string;
  speciality: string;
  phone: string;
}

interface Invitation {
  id: string;
  role: "admin" | "agent" | "viewer";
  label: string | null;
  created_at: string;
  expires_at: string;
}

const EMPTY: NewUser = {
  full_name: "",
  email: "",
  password: "",
  branch_id: "",
  designation_id: "",
  speciality: "",
  phone: "",
};


const selectCls = "h-9 w-full";


/**
 * Master → Users: everyone who can sign in, in one place (the old Team
 * members page is merged in).
 *
 * - Add a user with a password (they can sign in straight away) or make
 *   an invite link they open themselves.
 * - Per user: branch (or all branches) and role, or remove them. What
 *   they can do comes from the role (Access control); the database
 *   access level follows the role automatically.
 * - A user whose role is a doctor role is bookable in Appointments and by
 *   the booking assistant; there is no separate Doctors list.
 * - Pending invite links can be revoked.
 *
 * Buttons follow the caller's `users` permissions; the routes behind them
 * check again.
 */
export function UsersPanel() {
  const t = useTranslations("Master.users");
  const tRoles = useTranslations("Settings.roles");
  const confirm = useConfirm();
  const { user, can, canManageMembers } = useAuth();
  const { branding } = useBranding();
  const staffTerm = resolveTerms(branding.vocabulary).staff;
  const canWrite = can("users", "write");
  const canEdit = can("users", "edit");
  const canDelete = can("users", "delete");

  const [members, setMembers] = useState<AccountMember[]>([]);
  const [branches, setBranches] = useState<MasterRecord[]>([]);
  const [designations, setDesignations] = useState<MasterRecord[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [draft, setDraft] = useState<NewUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, b, d, i] = await Promise.all([
        fetch("/api/account/members", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/master/branches", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
        fetch("/api/master/designations", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
        canManageMembers
          ? fetch("/api/account/invitations", { cache: "no-store" }).then((r) => r.json()).catch(() => ({}))
          : Promise.resolve({}),
      ]);
      setMembers(Array.isArray(m.members) ? m.members : []);
      setBranches(Array.isArray(b.records) ? b.records : []);
      setDesignations(Array.isArray(d.records) ? d.records : []);
      setInvitations(Array.isArray(i.invitations) ? i.invitations : []);
    } catch {
      toast.error(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, canManageMembers]);

  useEffect(() => {
    void load();
  }, [load]);

  const branchName = useMemo(() => {
    const map = new Map(branches.map((c) => [c.id, String(c.name)]));
    return (id: string | null) => (id ? (map.get(id) ?? "—") : t("allBranches"));
  }, [branches, t]);

  const roleName = (id: string | null) => {
    const d = designations.find((x) => x.id === id);
    return d ? String(d.name) : t("noDesignation");
  };

  async function patchMember(
    m: AccountMember,
    body: Partial<{ branch_id: string | null; designation_id: string | null }>,
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

  async function revoke(inv: Invitation) {
    const ok = await confirm({
      title: t("confirmRevokeTitle"),
      description: t("confirmRevokeDesc"),
      tone: "danger",
      confirmLabel: t("revoke"),
    });
    if (!ok) return;
    const res = await fetch(`/api/account/invitations/${inv.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? t("revokeFailed"));
      return;
    }
    toast.success(t("revoked"));
    setInvitations((list) => list.filter((x) => x.id !== inv.id));
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
          branch_id: draft.branch_id || null,
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
  const staffWords = [staffTerm.one, staffTerm.many];
  const draftIsDoctor = !!draft && isBookableRole(roleName(draft.designation_id || null), staffWords);
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

  const rowInfo = (m: AccountMember) => {
    const isSelf = m.user_id === user?.id;
    const isSuper = !!m.is_super_admin;
    return { isSelf, isSuper, editable: canEdit && m.role !== "owner" && !isSelf && !isSuper };
  };

  const columns: DataColumn<AccountMember>[] = [
    {
      id: "user",
      header: t("cols.user"),
      hideable: false,
      width: 300,
      exportValue: (m) => m.full_name || "",
      cell: (m) => (
        <div className="flex items-center gap-3">
          <Avatar className="size-8">
            {m.avatar_url ? <AvatarImage src={m.avatar_url} alt="" /> : null}
            <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
              {(m.full_name || m.email || "U").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-2 truncate text-sm font-medium text-foreground">
              {m.full_name || t("unnamed")}
              {rowInfo(m).isSelf ? <span className="text-xs text-muted-foreground">({t("you")})</span> : null}
              {m.staff_type === "doctor" ? (
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  {t("doctorBadge")}
                </span>
              ) : null}
            </div>
            {m.email ? <div className="truncate text-xs text-muted-foreground">{m.email}</div> : null}
          </div>
        </div>
      ),
    },
    {
      id: "email",
      header: t("fields.email"),
      defaultHidden: true,
      width: 220,
      exportValue: (m) => m.email || "",
      cell: (m) => m.email || "—",
    },
    {
      id: "branch",
      header: t("cols.branch"),
      width: 220,
      exportValue: (m) => branchName(m.branch_id),
      cell: (m) =>
        rowInfo(m).editable ? (
          <NativeSelect
            value={m.branch_id ?? ""}
            disabled={busyId === m.user_id}
            onChange={(e) =>
              patchMember(m, { branch_id: e.target.value || null }, t("confirmBranch", { name: m.full_name || "" }))
            }
            className={selectCls}
            aria-label={t("cols.branch")}
          >
            <option value="">{t("allBranches")}</option>
            {branches.map((c) => (
              <option key={c.id} value={c.id}>
                {String(c.name)}
              </option>
            ))}
          </NativeSelect>
        ) : (
          <span className="text-sm text-muted-foreground">{branchName(m.branch_id)}</span>
        ),
    },
    {
      id: "designation",
      header: t("cols.designation"),
      width: 220,
      exportValue: (m) => (m.is_super_admin ? t("superAdmin") : roleName(m.designation_id)),
      cell: (m) =>
        rowInfo(m).editable ? (
          <NativeSelect
            value={m.designation_id ?? ""}
            disabled={busyId === m.user_id}
            onChange={(e) =>
              patchMember(
                m,
                { designation_id: e.target.value || null },
                t("confirmDesignation", { name: m.full_name || "" }),
              )
            }
            className={selectCls}
            aria-label={t("cols.designation")}
          >
            <option value="">{t("noDesignation")}</option>
            {designations.map((d) => (
              <option key={d.id} value={d.id}>
                {String(d.name)}
              </option>
            ))}
          </NativeSelect>
        ) : rowInfo(m).isSuper ? (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {t("superAdmin")}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">{roleName(m.designation_id)}</span>
        ),
    },
  ];
  const table = useTableLayout("master.users", columns);

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title={t("title")}
        description={t("description")}
        action={
          <div className="flex flex-wrap gap-2">
            {canManageMembers ? (
              <Button variant="outline" onClick={() => setInviteOpen(true)}>
                <Link2 className="mr-1 size-4" />
                {t("inviteLink")}
              </Button>
            ) : null}
            {canWrite ? (
              <Button onClick={() => setDraft(EMPTY)}>
                <UserPlus className="mr-1 size-4" />
                {t("addUser")}
              </Button>
            ) : null}
          </div>
        }
      />

      <DataTable
        table={table}
        rows={members}
        rowKey={(m) => m.user_id}
        loading={loading}
        trailing={
          canDelete
            ? {
                width: 56,
                cell: (m) =>
                  rowInfo(m).editable ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={busyId === m.user_id}
                      aria-label={t("remove")}
                      onClick={() => removeMember(m)}
                      className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null,
              }
            : undefined
        }
      />

      {canManageMembers && invitations.length > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-foreground">{t("pendingInvites")}</h3>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 px-4 py-2.5">
                <Link2 className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{inv.label || t("untitledInvite")}</div>
                  <div className="text-xs text-muted-foreground">
                    {tRoles(inv.role)} · {t("inviteDates", { created: fmtDate(inv.created_at), expires: fmtDate(inv.expires_at) })}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => revoke(inv)} className="text-red-600 dark:text-red-400">
                  <MailX className="size-4" /> {t("revoke")}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <InviteMemberDialog open={inviteOpen} onOpenChange={setInviteOpen} onCreated={() => void load()} />

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
              <div className="grid gap-1.5">
                <Label className="text-muted-foreground">{t("fields.name")} *</Label>
                <Input value={draft.full_name} onChange={(e) => set("full_name", e.target.value)} required autoFocus />
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
                  <Label className="text-muted-foreground">{t("fields.branch")}</Label>
                  <NativeSelect value={draft.branch_id} onChange={(e) => set("branch_id", e.target.value)} className={selectCls}>
                    <option value="">{t("allBranches")}</option>
                    {branches.map((c) => (
                      <option key={c.id} value={c.id}>
                        {String(c.name)}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-muted-foreground">{t("fields.designation")}</Label>
                  <NativeSelect value={draft.designation_id} onChange={(e) => set("designation_id", e.target.value)} className={selectCls}>
                    <option value="">{t("noDesignation")}</option>
                    {designations.map((d) => (
                      <option key={d.id} value={d.id}>
                        {String(d.name)}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
              {draftIsDoctor ? (
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
              ) : null}
              <p className="text-xs text-muted-foreground">{t("fields.designationHint")}</p>
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
