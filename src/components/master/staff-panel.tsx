"use client";

/**
 * Master → Doctors (the `staff` entity, in the install's staff word):
 * the usual records list plus a Login column. A doctor with no login can
 * be given one; one with a login can have it switched off and on (see
 * login-switch.tsx). Login state comes from the members list, where a
 * doctor with a login also appears (Master → Users).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { useAuth } from "@/hooks/use-auth";
import type { MasterRecord } from "@/lib/master/entities";
import type { AccountMember } from "@/types";
import type { DataColumn } from "@/components/ui/data-table";
import { GiveLoginDialog, LoginSwitch } from "@/components/master/login-switch";
import { MasterRecordsPanel } from "@/components/master/master-records-panel";

export function StaffPanel() {
  const t = useTranslations("Master.login");
  const { user, can } = useAuth();
  const canGive = can("users", "write");
  const canSwitch = can("users", "edit");

  const [members, setMembers] = useState<Map<string, AccountMember>>(new Map());
  const [give, setGive] = useState<MasterRecord | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const loadMembers = useCallback(async () => {
    const d = await fetch("/api/account/members", { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => ({}));
    const list: AccountMember[] = Array.isArray(d.members) ? d.members : [];
    setMembers(new Map(list.map((m) => [m.user_id, m])));
  }, []);
  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const columns = useMemo<DataColumn<MasterRecord>[]>(
    () => [
      {
        id: "login",
        header: t("col"),
        width: 170,
        exportValue: (r) => {
          const uid = typeof r.user_id === "string" ? r.user_id : null;
          return !uid ? t("none") : members.get(uid)?.login_disabled ? t("off") : t("on");
        },
        cell: (r) => {
          const uid = typeof r.user_id === "string" ? r.user_id : null;
          const m = uid ? members.get(uid) : undefined;
          return (
            <LoginSwitch
              name={String(r.name ?? "")}
              userId={uid}
              loginOff={!!m?.login_disabled}
              // Same limits as Users: not the owner, not yourself.
              editable={uid ? canSwitch && m?.role !== "owner" && uid !== user?.id : canGive}
              onGive={canGive ? () => setGive(r) : undefined}
              onChanged={() => void loadMembers()}
            />
          );
        },
      },
    ],
    [t, members, canGive, canSwitch, user?.id, loadMembers],
  );

  return (
    <>
      <MasterRecordsPanel slug="staff" extraColumns={columns} reloadKey={reloadKey} />
      <GiveLoginDialog
        doctor={give}
        onClose={() => setGive(null)}
        onCreated={() => {
          setGive(null);
          setReloadKey((k) => k + 1);
          void loadMembers();
        }}
      />
    </>
  );
}
