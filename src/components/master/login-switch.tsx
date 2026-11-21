"use client";

/**
 * The Login switch on Master → Users and Master → Doctors.
 *
 * - On a member (or a doctor who has a login): asks first, then calls
 *   PUT /api/account/members/:id/login. Off blocks sign-in (a Supabase
 *   Auth ban, see lib/master/login-access.ts); on lifts it.
 * - On a doctor with no login yet: switching on opens GiveLoginDialog,
 *   which creates the login linked to that doctor (POST
 *   /api/account/users with doctor_id).
 *
 * The routes check `users` permissions again; this only hides what
 * they would refuse.
 */
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";

import type { MasterRecord } from "@/lib/master/entities";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Switch a member's login on or off; returns the error message, or null. */
async function changeLogin(userId: string, enabled: boolean): Promise<string | null> {
  const res = await fetch(`/api/account/members/${userId}/login`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  if (res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return typeof data.error === "string" ? data.error : "";
}

export function LoginSwitch({
  name,
  userId,
  loginOff,
  editable,
  onGive,
  onChanged,
}: {
  name: string;
  /** The member's user id; null for a doctor with no login yet. */
  userId: string | null;
  loginOff: boolean;
  editable: boolean;
  /** Doctor with no login: open the "give a login" form. */
  onGive?: () => void;
  onChanged: () => void;
}) {
  const t = useTranslations("Master.login");
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const on = !!userId && !loginOff;
  const label = !userId ? t("none") : loginOff ? t("off") : t("on");

  const toggle = async (next: boolean) => {
    if (!userId) {
      if (next) onGive?.();
      return;
    }
    const ok = await confirm(
      next
        ? { title: t("confirmOnTitle", { name }), description: t("confirmOnDesc"), confirmLabel: t("confirmOn") }
        : { title: t("confirmOffTitle", { name }), description: t("confirmOffDesc"), confirmLabel: t("confirmOff"), tone: "danger" },
    );
    if (!ok) return;
    setBusy(true);
    try {
      const err = await changeLogin(userId, next);
      if (err !== null) {
        toast.error(err || t("failed"));
        return;
      }
      toast.success(next ? t("switchedOn") : t("switchedOff"));
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2.5">
      {busy ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : (
        <Switch
          checked={on}
          disabled={!editable || (!userId && !onGive)}
          onCheckedChange={(v) => void toggle(v)}
          aria-label={`${t("col")}: ${name}`}
        />
      )}
      <span className={on ? "text-sm text-foreground" : "text-sm text-muted-foreground"}>{label}</span>
    </div>
  );
}

/** Create a login for an existing doctor and link it to their row. */
export function GiveLoginDialog({
  doctor,
  onClose,
  onCreated,
}: {
  doctor: MasterRecord | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations("Master.login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("");
  const [roles, setRoles] = useState<MasterRecord[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!doctor) return;
    setEmail(typeof doctor.email === "string" ? doctor.email : "");
    setPassword("");
    setRole("");
    void fetch("/api/master/designations", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setRoles(Array.isArray(d.records) ? d.records : []))
      .catch(() => setRoles([]));
  }, [doctor]);

  const name = doctor ? String(doctor.name ?? "") : "";

  const submit = async () => {
    if (!doctor) return;
    if (!EMAIL_RE.test(email.trim()) || password.length < 8) {
      toast.error(t("validation"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/account/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctor_id: doctor.id,
          full_name: name,
          email: email.trim(),
          password,
          designation_id: role || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t("createFailed"));
        return;
      }
      toast.success(t("created"));
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!doctor} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("giveTitle", { name })}</DialogTitle>
          <DialogDescription>{t("giveDesc")}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-1.5">
            <Label className="text-muted-foreground">{t("email")} *</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-muted-foreground">{t("password")} *</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              placeholder={t("passwordHint")}
              autoComplete="new-password"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-muted-foreground">{t("role")}</Label>
            <NativeSelect value={role} onChange={(e) => setRole(e.target.value)} className="h-9 w-full">
              <option value="">{t("noRole")}</option>
              {roles.map((d) => (
                <option key={d.id} value={d.id}>
                  {String(d.name)}
                </option>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">{t("roleHint")}</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
