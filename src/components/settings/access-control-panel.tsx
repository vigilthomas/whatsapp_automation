"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Loader2, LockKeyhole } from "lucide-react";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  MODULES,
  RESTRICTABLE_ROLES,
  canAccessModule,
  toggleModuleAccess,
  type ModuleAccess,
  type ModuleId,
  type RestrictableRole,
} from "@/lib/auth/module-access";
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

/**
 * Circular tick toggle for one matrix cell. Colours come straight from
 * the theme tokens (`primary` / `border` / `card`), so it follows both
 * the light/dark mode and the selected colour theme without any
 * per-theme styling here.
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
 * Access control — the per-role module matrix.
 *
 * One checkbox per (role × module): checked means that role can see
 * and open the module. Owner isn't a column — owners always see
 * everything (see module-access.ts for why). Writes go straight to
 * `accounts.module_access`; the `accounts_update` RLS policy (017)
 * already restricts that to admins+, so agents/viewers get a
 * read-only view of what applies to them.
 *
 * Saving pulls the new matrix back through `refreshProfile()` so the
 * sidebar of the person editing updates immediately; other members
 * pick it up on their next profile fetch (page load / focus).
 */
export function AccessControlPanel() {
  const supabase = createClient();
  const {
    accountId,
    moduleAccess,
    canEditSettings,
    profileLoading,
    refreshProfile,
  } = useAuth();
  const t = useTranslations("Settings.access");
  const tModules = useTranslations("Settings.access.modules");
  const tRoles = useTranslations("Settings.roles");

  const [draft, setDraft] = useState<ModuleAccess>(moduleAccess);
  const [saving, setSaving] = useState(false);

  // Re-seed the draft whenever the stored matrix changes (initial
  // load, or a save round-tripping through refreshProfile).
  useEffect(() => {
    setDraft(moduleAccess);
  }, [moduleAccess]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(moduleAccess);

  function setCell(role: RestrictableRole, module: ModuleId, allowed: boolean) {
    setDraft((prev) => toggleModuleAccess(prev, role, module, allowed));
  }

  async function handleSave() {
    if (!accountId || !dirty) return;
    setSaving(true);
    const { error } = await supabase
      .from("accounts")
      .update({ module_access: draft })
      .eq("id", accountId);
    if (error) {
      toast.error(t("saveFailed"));
      setSaving(false);
      return;
    }
    await refreshProfile();
    setSaving(false);
    toast.success(t("saveSuccess"));
  }

  const editable = canEditSettings && !profileLoading;

  return (
    <section className="max-w-4xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead title={t("title")} description={t("description")} />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <LockKeyhole className="size-4 text-primary" />
            {t("matrixTitle")}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {t("matrixDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-40 text-muted-foreground">{t("moduleColumn")}</TableHead>
                  {RESTRICTABLE_ROLES.map((role) => (
                    <TableHead key={role} className="w-28 text-center text-muted-foreground">
                      {tRoles(role)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {MODULES.map((module) => (
                  <TableRow key={module}>
                    <TableCell className="font-medium text-foreground">
                      {tModules(module)}
                    </TableCell>
                    {RESTRICTABLE_ROLES.map((role) => {
                      const allowed = canAccessModule(draft, role, module);
                      return (
                        <TableCell key={role} className="text-center">
                          <AccessToggle
                            checked={allowed}
                            disabled={!editable}
                            onChange={(v) => setCell(role, module, v)}
                            label={t("cellAria", {
                              role: tRoles(role),
                              module: tModules(module),
                            })}
                          />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-muted-foreground">{t("ownerNote")}</p>

          {canEditSettings ? (
            <Button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
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
    </section>
  );
}
