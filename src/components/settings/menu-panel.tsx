"use client";

/**
 * Settings → Sidebar menu: rename items and groups, change icons, move an item
 * to another group, hide it for everyone. Ported from the base template's
 * Sidebar menu screen. Order inside a group and who may open a page stay with
 * Access control (designations); this screen never changes access.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useBranding } from "@/hooks/use-branding";
import { menuSections, navGroups, type NavItem } from "@/components/layout/nav-config";
import { FIXED_SECTIONS, LOCKED_HREFS, MENU_LABEL_MAX, resolveMenu, type BrandMenu } from "@/lib/branding-menu";
import { BRAND_ICONS } from "@/lib/branding-icons";
import { cn } from "@/lib/utils";
import { SettingsPanelHead } from "./settings-panel-head";

type ItemOverride = NonNullable<BrandMenu["items"]>[string];

/** Drop empty and default values so the saved JSON stays small and comparable. */
function tidy(menu: BrandMenu, homeOf: Record<string, string>): BrandMenu {
  const items: NonNullable<BrandMenu["items"]> = {};
  for (const [href, o] of Object.entries(menu.items ?? {})) {
    const clean: ItemOverride = {};
    if (o.label?.trim()) clean.label = o.label.trim().slice(0, MENU_LABEL_MAX);
    if (o.icon) clean.icon = o.icon;
    if (o.group && o.group !== homeOf[href]) clean.group = o.group;
    if (o.hidden) clean.hidden = true;
    if (Object.keys(clean).length) items[href] = clean;
  }
  const groups: NonNullable<BrandMenu["groups"]> = {};
  for (const [id, g] of Object.entries(menu.groups ?? {})) {
    if (g.label?.trim()) groups[id] = { label: g.label.trim().slice(0, MENU_LABEL_MAX) };
  }
  return { ...(Object.keys(items).length ? { items } : {}), ...(Object.keys(groups).length ? { groups } : {}) };
}

export function MenuPanel() {
  const t = useTranslations("Settings.menu");
  const ts = useTranslations("Sidebar");
  const { canManageMembers } = useAuth();
  const { branding, available, save } = useBranding();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<BrandMenu>(branding.menu);
  const [saving, setSaving] = useState(false);
  const readOnly = !canManageMembers || !available;

  const sections = useMemo(() => menuSections(), []);
  const homeOf = useMemo(
    () => Object.fromEntries(sections.flatMap((s) => s.items.map((i) => [i.href, s.id]))),
    [sections],
  );

  const [startedFrom, setStartedFrom] = useState(branding.menu);
  if (startedFrom !== branding.menu && !saving) {
    setStartedFrom(branding.menu);
    setDraft(branding.menu);
  }

  const tidied = useMemo(() => tidy(draft, homeOf), [draft, homeOf]);
  const dirty = JSON.stringify(tidied) !== JSON.stringify(tidy(branding.menu, homeOf));

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Where each item sits with the draft applied; hidden items are kept so they can be switched back on.
  const placed = useMemo(() => {
    const withoutHiding: BrandMenu = {
      ...draft,
      items: Object.fromEntries(Object.entries(draft.items ?? {}).map(([h, o]) => [h, { ...o, hidden: false }])),
    };
    return resolveMenu<NavItem>(sections, withoutHiding);
  }, [draft, sections]);

  const setItem = (href: string, patch: Partial<ItemOverride>) =>
    setDraft((d) => ({ ...d, items: { ...(d.items ?? {}), [href]: { ...(d.items?.[href] ?? {}), ...patch } } }));
  const setGroup = (id: string, label: string) =>
    setDraft((d) => ({ ...d, groups: { ...(d.groups ?? {}), [id]: { label } } }));

  const movable = (href: string) => !LOCKED_HREFS.includes(href) && !FIXED_SECTIONS.includes(homeOf[href]);
  const groupOptions = sections.filter((s) => !FIXED_SECTIONS.includes(s.id));
  const sectionName = (id: string) => {
    const g = navGroups.find((x) => x.id === id);
    return g ? draft.groups?.[id]?.label?.trim() || ts(g.labelKey) : t(id as "top" | "after" | "bottom");
  };

  const onSave = async () => {
    if (!(await confirm({ title: t("saveTitle"), description: t("saveDesc"), confirmLabel: t("save") }))) return;
    setSaving(true);
    const error = await save({ menu: tidied });
    setSaving(false);
    if (error) toast.error(error);
    else toast.success(t("saved"));
  };
  const onReset = async () => {
    if (await confirm({ title: t("resetTitle"), description: t("resetDesc"), confirmLabel: t("reset") })) setDraft({});
  };

  return (
    <section className="max-w-4xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead title={t("title")} description={t("description")} />
      <p className="mb-5 text-sm text-muted-foreground">
        {t("orderNote")}{" "}
        <Link href="/access-control" className="font-medium text-primary hover:underline">{t("openAccess")}</Link>
      </p>

      <div className="space-y-5">
        {placed.map((section) => {
          const group = navGroups.find((g) => g.id === section.id);
          return (
            <div key={section.id} className="rounded-xl border border-border bg-card">
              <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
                {group ? (
                  <Input
                    aria-label={t("groupName")}
                    className="h-8 max-w-xs font-semibold"
                    maxLength={MENU_LABEL_MAX}
                    placeholder={ts(group.labelKey)}
                    disabled={readOnly}
                    value={draft.groups?.[section.id]?.label ?? ""}
                    onChange={(e) => setGroup(section.id, e.target.value)}
                  />
                ) : (
                  <h3 className="text-sm font-semibold text-foreground">{sectionName(section.id)}</h3>
                )}
              </div>
              <ul className="divide-y divide-border">
                {section.items.map((item) => {
                  const o = draft.items?.[item.href] ?? {};
                  const Icon = (o.icon && BRAND_ICONS[o.icon]) || item.icon;
                  const fixed = !movable(item.href);
                  return (
                    <li key={item.href} className={cn("flex flex-wrap items-center gap-3 px-4 py-2", o.hidden && "opacity-60")}>
                      <Popover>
                        <PopoverTrigger
                          disabled={readOnly}
                          aria-label={t("chooseIcon")}
                          className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-60"
                        >
                          <Icon className="size-4" />
                        </PopoverTrigger>
                        <PopoverContent className="w-[296px] p-2">
                          <div className="grid grid-cols-7 gap-1">
                            {Object.entries(BRAND_ICONS).map(([key, I]) => (
                              <button
                                key={key}
                                type="button"
                                title={key}
                                aria-label={key}
                                onClick={() => setItem(item.href, { icon: key })}
                                className={cn("flex size-9 items-center justify-center rounded-md hover:bg-muted", o.icon === key && "bg-primary-soft text-primary")}
                              >
                                <I className="size-4" />
                              </button>
                            ))}
                          </div>
                          <button type="button" className="mt-2 w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted"
                            onClick={() => setItem(item.href, { icon: undefined })}>
                            {t("defaultIcon")}
                          </button>
                        </PopoverContent>
                      </Popover>
                      <Input
                        aria-label={`${t("rename")}: ${ts(item.labelKey)}`}
                        className="h-9 min-w-[160px] flex-1"
                        maxLength={MENU_LABEL_MAX}
                        placeholder={ts(item.labelKey)}
                        disabled={readOnly}
                        value={o.label ?? ""}
                        onChange={(e) => setItem(item.href, { label: e.target.value })}
                      />
                      <select
                        aria-label={`${t("group")}: ${ts(item.labelKey)}`}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60"
                        disabled={readOnly || fixed}
                        value={fixed ? homeOf[item.href] : o.group || homeOf[item.href]}
                        onChange={(e) => setItem(item.href, { group: e.target.value })}
                      >
                        {(fixed ? sections.filter((s) => s.id === homeOf[item.href]) : groupOptions).map((s) => (
                          <option key={s.id} value={s.id}>{sectionName(s.id)}</option>
                        ))}
                      </select>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Switch
                          aria-label={`${t("show")}: ${ts(item.labelKey)}`}
                          checked={fixed || !o.hidden}
                          disabled={readOnly || fixed}
                          onCheckedChange={(on: boolean) => setItem(item.href, { hidden: !on })}
                        />
                        {fixed ? t("locked") : t("show")}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button type="button" disabled={readOnly || !dirty || saving} onClick={onSave}>{saving ? t("saving") : t("save")}</Button>
        <Button type="button" variant="outline" disabled={!dirty || saving} onClick={() => setDraft(branding.menu)}>{t("discard")}</Button>
        <Button type="button" variant="ghost" disabled={readOnly} onClick={onReset}><RotateCcw className="size-4" /> {t("reset")}</Button>
      </div>
    </section>
  );
}
