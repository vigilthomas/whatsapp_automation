"use client";

/**
 * Settings → Sidebar menu: rename items and groups, change icons, move an item
 * to another group, hide it for everyone, and drag items and groups into a new
 * order. Each section folds open and shut. Ported from the base template's
 * Sidebar menu screen. Who may open a page stays with Access control
 * (designations); this screen never changes access. A section nobody has
 * reordered here keeps the designation's order.
 *
 * "Add section" makes a new collapsible group like Master or Controls
 * (`customGroups` in the menu JSON). It starts empty; move items into it
 * with their Group picker. Deleting it sends its items back to their usual
 * group.
 */
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, Folder, GripVertical, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { NativeSelect } from "@/components/ui/native-select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useBranding } from "@/hooks/use-branding";
import { menuSections, navGroups, type NavItem } from "@/components/layout/nav-config";
import {
  FIXED_SECTIONS,
  LOCKED_HREFS,
  MAX_CUSTOM_GROUPS,
  MENU_LABEL_MAX,
  customGroupsOf,
  isCustomGroupId,
  newCustomGroupId,
  orderGroupIds,
  resolveMenu,
  type BrandMenu,
} from "@/lib/branding-menu";
import { BRAND_ICONS } from "@/lib/branding-icons";
import { LOCKED_SETTINGS, orderSettingsSections, tidySettingsMenu, type SettingsItemOverride } from "@/lib/settings-menu";
import { RAIL_SECTION_IDS, SECTION_META, railGroupsFor } from "./settings-sections";
import { cn } from "@/lib/utils";
import { SettingsPanelHead } from "./settings-panel-head";

type ItemOverride = NonNullable<BrandMenu["items"]>[string];
type CustomGroup = NonNullable<BrandMenu["customGroups"]>[number];

const SECTIONS = menuSections();
const DEFAULT_GROUP_ORDER = navGroups.map((g) => g.id);
const HOME_OF: Record<string, string> = Object.fromEntries(
  SECTIONS.flatMap((s) => s.items.map((i) => [i.href, s.id])),
);
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** The order each section has with no saved order applied. */
function naturalOrder(menu: BrandMenu): Record<string, string[]> {
  return Object.fromEntries(
    resolveMenu<NavItem>(SECTIONS, { ...menu, order: undefined }).map((s) => [s.id, s.items.map((i) => i.href)]),
  );
}

/**
 * Drop empty and default values so the saved JSON stays small and comparable.
 * An order is kept only where it differs from the order the section would have
 * anyway, and only lists the items that are in that section now.
 */
function tidy(menu: BrandMenu): BrandMenu {
  const customGroups = customGroupsOf(menu);
  // Where an item may be moved to: Main, the built-in groups and the added sections.
  const targets = new Set(["top", ...DEFAULT_GROUP_ORDER, ...customGroups.map((g) => g.id)]);
  const items: NonNullable<BrandMenu["items"]> = {};
  for (const [href, o] of Object.entries(menu.items ?? {})) {
    const clean: ItemOverride = {};
    if (o.label?.trim()) clean.label = o.label.trim().slice(0, MENU_LABEL_MAX);
    if (o.icon) clean.icon = o.icon;
    // A move into a section that has since been deleted is dropped, so the item is simply back home.
    if (o.group && o.group !== HOME_OF[href] && targets.has(o.group)) clean.group = o.group;
    if (o.hidden) clean.hidden = true;
    if (Object.keys(clean).length) items[href] = clean;
  }
  const groups: NonNullable<BrandMenu["groups"]> = {};
  for (const [id, g] of Object.entries(menu.groups ?? {})) {
    if (!isCustomGroupId(id) && g.label?.trim()) groups[id] = { label: g.label.trim().slice(0, MENU_LABEL_MAX) };
  }
  const natural = naturalOrder(menu);
  const order: NonNullable<BrandMenu["order"]> = {};
  for (const [id, hrefs] of Object.entries(menu.order ?? {})) {
    const here = natural[id];
    if (!here || FIXED_SECTIONS.includes(id) || !Array.isArray(hrefs)) continue;
    const kept = hrefs.filter((h) => here.includes(h));
    const full = [...kept, ...here.filter((h) => !kept.includes(h))];
    if (!same(full, here)) order[id] = full;
  }
  const groupOrder = orderGroupIds(DEFAULT_GROUP_ORDER, menu);
  const defaultGroupOrder = [...DEFAULT_GROUP_ORDER, ...customGroups.map((g) => g.id)];
  const settings = tidySettingsMenu(menu.settings, RAIL_SECTION_IDS);
  return {
    ...(settings ? { settings } : {}),
    ...(customGroups.length ? { customGroups } : {}),
    ...(Object.keys(items).length ? { items } : {}),
    ...(Object.keys(groups).length ? { groups } : {}),
    ...(Object.keys(order).length ? { order } : {}),
    ...(!same(groupOrder, defaultGroupOrder) ? { groupOrder } : {}),
  };
}

/** A row or card that can be dragged by its handle. `children` gets the handle to place. */
function Sortable({ id, disabled, children }: { id: string; disabled: boolean; children: (handle: ReactNode) => ReactNode }) {
  const t = useTranslations("Settings.menu");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const handle = (
    <button
      type="button"
      {...attributes}
      {...listeners}
      disabled={disabled}
      aria-label={t("dragToReorder")}
      className="flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
    >
      <GripVertical className="size-4" />
    </button>
  );
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10 opacity-70")}
    >
      {children(handle)}
    </div>
  );
}

export function MenuPanel() {
  const t = useTranslations("Settings.menu");
  const ts = useTranslations("Sidebar");
  const tSettings = useTranslations("Settings");
  const { branding, available, canEdit, save } = useBranding();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<BrandMenu>(branding.menu);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const readOnly = !canEdit || !available;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [startedFrom, setStartedFrom] = useState(branding.menu);
  if (startedFrom !== branding.menu && !saving) {
    setStartedFrom(branding.menu);
    setDraft(branding.menu);
  }

  const tidied = useMemo(() => tidy(draft), [draft]);
  const savedMenu = useMemo(() => tidy(branding.menu), [branding.menu]);
  const dirty = JSON.stringify(tidied) !== JSON.stringify(savedMenu);

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
    return resolveMenu<NavItem>(SECTIONS, withoutHiding);
  }, [draft]);

  const setItem = (href: string, patch: Partial<ItemOverride>) =>
    setDraft((d) => ({ ...d, items: { ...(d.items ?? {}), [href]: { ...(d.items?.[href] ?? {}), ...patch } } }));
  const setGroup = (id: string, label: string) =>
    setDraft((d) => ({ ...d, groups: { ...(d.groups ?? {}), [id]: { label } } }));

  // Settings page side list (lib/settings-menu).
  const setSettingsItem = (id: string, patch: Partial<SettingsItemOverride>) =>
    setDraft((d) => ({
      ...d,
      settings: { ...d.settings, items: { ...d.settings?.items, [id]: { ...d.settings?.items?.[id], ...patch } } },
    }));
  const reorderSettings = (group: string) => (e: DragEndEvent) => {
    const ids = orderSettingsSections(RAIL_SECTION_IDS[group] ?? [], group, draft.settings);
    const from = ids.indexOf(String(e.active.id));
    const to = e.over ? ids.indexOf(String(e.over.id)) : -1;
    if (from < 0 || to < 0 || from === to) return;
    setDraft((d) => ({ ...d, settings: { ...d.settings, order: { ...d.settings?.order, [group]: arrayMove(ids, from, to) } } }));
  };

  // Added sections are edited from the raw draft list (not customGroupsOf) so a name
  // being typed can be blank for a moment; tidy() cleans it on save.
  const draftCustom: CustomGroup[] = Array.isArray(draft.customGroups) ? draft.customGroups : [];
  const setCustom = (id: string, patch: Partial<CustomGroup>) =>
    setDraft((d) => ({
      ...d,
      customGroups: (d.customGroups ?? []).map((g) => (g.id === id ? { ...g, ...patch } : g)),
    }));
  const addSection = () => {
    const id = newCustomGroupId();
    const n = draftCustom.length + 1;
    setDraft((d) => ({ ...d, customGroups: [...(d.customGroups ?? []), { id, label: t("newSectionName", { n }) }] }));
    setOpen((o) => ({ ...o, [id]: true }));
  };
  const removeSection = async (id: string) => {
    const count = byId(id).items.length;
    const ok = await confirm({
      title: t("deleteSectionTitle", { name: sectionName(id) }),
      description: t("deleteSectionDesc", { count }),
      confirmLabel: t("deleteSection"),
    });
    if (!ok) return;
    setDraft((d) => {
      const items = Object.fromEntries(
        Object.entries(d.items ?? {}).map(([href, o]) => [href, o.group === id ? { ...o, group: undefined } : o]),
      );
      const order = { ...(d.order ?? {}) };
      delete order[id];
      return {
        ...d,
        items,
        order,
        customGroups: (d.customGroups ?? []).filter((g) => g.id !== id),
        groupOrder: d.groupOrder?.filter((g) => g !== id),
      };
    });
  };

  const movable = (href: string) => !LOCKED_HREFS.includes(href) && !FIXED_SECTIONS.includes(HOME_OF[href]);
  const groupOptions = placed.filter((s) => !FIXED_SECTIONS.includes(s.id));
  const sectionName = (id: string): string => {
    const added = draftCustom.find((x) => x.id === id);
    if (added) return added.label?.trim() || t("untitledSection");
    const g = navGroups.find((x) => x.id === id);
    return g ? draft.groups?.[id]?.label?.trim() || ts(g.labelKey) : t(id as "top" | "after" | "bottom");
  };

  // Shown in sidebar order: Main, the groups (in their saved order), then the fixed sections.
  const groupIds = orderGroupIds(DEFAULT_GROUP_ORDER, draft);
  const byId = (id: string) => placed.find((s) => s.id === id)!;
  // Fixed sections with nothing in them (e.g. "After the groups" once Access control moved to the bottom) are left out.
  const fixedTail = placed.filter((s) => FIXED_SECTIONS.includes(s.id) && s.items.length > 0);

  const reorderItems = (sectionId: string) => (e: DragEndEvent) => {
    const hrefs = byId(sectionId).items.map((i) => i.href);
    const from = hrefs.indexOf(String(e.active.id));
    const to = e.over ? hrefs.indexOf(String(e.over.id)) : -1;
    if (from < 0 || to < 0 || from === to) return;
    setDraft((d) => ({ ...d, order: { ...(d.order ?? {}), [sectionId]: arrayMove(hrefs, from, to) } }));
  };
  const reorderGroups = (e: DragEndEvent) => {
    const from = groupIds.indexOf(String(e.active.id));
    const to = e.over ? groupIds.indexOf(String(e.over.id)) : -1;
    if (from < 0 || to < 0 || from === to) return;
    setDraft((d) => ({ ...d, groupOrder: arrayMove(groupIds, from, to) }));
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

  /** One section card: header (handle, name, count, fold) and, when open, its sortable rows. */
  const sectionCard = (id: string, groupHandle?: ReactNode) => {
    const section = byId(id);
    const group = navGroups.find((g) => g.id === id);
    const added = draftCustom.find((g) => g.id === id);
    const AddedIcon = (added?.icon && BRAND_ICONS[added.icon]) || Folder;
    const isOpen = !!open[id];
    const canReorder = !readOnly && !FIXED_SECTIONS.includes(id) && section.items.length > 1;
    return (
      <div className="rounded-xl border border-border bg-card">
        <div className={cn("flex items-center gap-2 px-3 py-2", isOpen && "border-b border-border")}>
          {groupHandle}
          {added ? (
            <>
              <Popover>
                <PopoverTrigger
                  disabled={readOnly}
                  aria-label={t("chooseIcon")}
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-60"
                >
                  <AddedIcon className="size-4" />
                </PopoverTrigger>
                <PopoverContent className="w-[296px] p-2">
                  <div className="grid grid-cols-7 gap-1">
                    {Object.entries(BRAND_ICONS).map(([key, I]) => (
                      <button
                        key={key}
                        type="button"
                        title={key}
                        aria-label={key}
                        onClick={() => setCustom(id, { icon: key })}
                        className={cn("flex size-9 items-center justify-center rounded-md hover:bg-muted", added.icon === key && "bg-primary-soft text-primary")}
                      >
                        <I className="size-4" />
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <Input
                aria-label={t("sectionName")}
                className="h-8 max-w-xs font-semibold"
                maxLength={MENU_LABEL_MAX}
                placeholder={t("untitledSection")}
                disabled={readOnly}
                value={added.label ?? ""}
                onChange={(e) => setCustom(id, { label: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={readOnly}
                aria-label={`${t("deleteSection")}: ${sectionName(id)}`}
                title={t("deleteSection")}
                onClick={() => void removeSection(id)}
                className="size-8 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          ) : group ? (
            <Input
              aria-label={t("groupName")}
              className="h-8 max-w-xs font-semibold"
              maxLength={MENU_LABEL_MAX}
              placeholder={ts(group.labelKey)}
              disabled={readOnly}
              value={draft.groups?.[id]?.label ?? ""}
              onChange={(e) => setGroup(id, e.target.value)}
            />
          ) : (
            <h3 className="px-1 text-sm font-semibold text-foreground">{sectionName(id)}</h3>
          )}
          <button
            type="button"
            aria-expanded={isOpen}
            aria-label={`${isOpen ? t("collapse") : t("expand")}: ${sectionName(id)}`}
            onClick={() => setOpen((o) => ({ ...o, [id]: !o[id] }))}
            className="ml-auto flex items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {t("itemCount", { count: section.items.length })}
            <ChevronDown className={cn("size-4 transition-transform", isOpen && "rotate-180")} />
          </button>
        </div>
        {isOpen && added && section.items.length === 0 && (
          <p className="px-4 py-3 text-xs text-muted-foreground">{t("emptySection")}</p>
        )}
        {isOpen && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorderItems(id)}>
            <SortableContext items={section.items.map((i) => i.href)} strategy={verticalListSortingStrategy}>
              <ul className="divide-y divide-border">
                {section.items.map((item) => {
                  const o = draft.items?.[item.href] ?? {};
                  const Icon = (o.icon && BRAND_ICONS[o.icon]) || item.icon;
                  const fixed = !movable(item.href);
                  return (
                    <li key={item.href}>
                      <Sortable id={item.href} disabled={!canReorder}>
                        {(handle) => (
                          <div className={cn("flex flex-wrap items-center gap-2.5 bg-card px-3 py-2 sm:flex-nowrap", o.hidden && "opacity-60")}>
                            {handle}
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
                              className="h-9 min-w-0 flex-1 basis-40"
                              maxLength={MENU_LABEL_MAX}
                              placeholder={ts(item.labelKey)}
                              disabled={readOnly}
                              value={o.label ?? ""}
                              onChange={(e) => setItem(item.href, { label: e.target.value })}
                            />
                            <NativeSelect
                              aria-label={`${t("group")}: ${ts(item.labelKey)}`}
                              className="h-9 w-40 shrink-0 text-sm"
                              disabled={readOnly || fixed}
                              value={fixed ? HOME_OF[item.href] : o.group || HOME_OF[item.href]}
                              onChange={(e) => setItem(item.href, { group: e.target.value })}
                            >
                              {(fixed ? SECTIONS.filter((s) => s.id === HOME_OF[item.href]) : groupOptions).map((s) => (
                                <option key={s.id} value={s.id}>{sectionName(s.id)}</option>
                              ))}
                            </NativeSelect>
                            <label className="flex w-36 shrink-0 items-center gap-2 text-xs whitespace-nowrap text-muted-foreground">
                              <Switch
                                aria-label={`${t("show")}: ${ts(item.labelKey)}`}
                                checked={fixed || !o.hidden}
                                disabled={readOnly || fixed}
                                onCheckedChange={(on: boolean) => setItem(item.href, { hidden: !on })}
                              />
                              {fixed ? t("locked") : t("show")}
                            </label>
                          </div>
                        )}
                      </Sortable>
                    </li>
                  );
                })}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>
    );
  };

  return (
    <section className="max-w-4xl animate-in fade-in-50 duration-200">
      {/* Save / discard / reset sit next to the title, so they're reachable without scrolling past every group. */}
      <SettingsPanelHead
        title={t("title")}
        action={
          <>
            <Button type="button" variant="ghost" disabled={readOnly} onClick={onReset}>
              <RotateCcw className="size-4" /> {t("reset")}
            </Button>
            <Button type="button" variant="outline" disabled={!dirty || saving} onClick={() => setDraft(branding.menu)}>
              {t("discard")}
            </Button>
            <Button type="button" disabled={readOnly || !dirty || saving} onClick={onSave}>
              {saving ? t("saving") : t("save")}
            </Button>
          </>
        }
      />
      <p className="mb-5 text-sm text-muted-foreground">
        {t("orderNote")}{" "}
        <Link href="/access-control" className="font-medium text-primary hover:underline">{t("openAccess")}</Link>
      </p>

      <div className="space-y-3">
        {sectionCard("top")}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorderGroups}>
          <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {groupIds.map((id) => (
                <Sortable key={id} id={id} disabled={readOnly}>
                  {(handle) => sectionCard(id, handle)}
                </Sortable>
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <Button
          type="button"
          variant="outline"
          className="w-full border-dashed"
          disabled={readOnly || draftCustom.length >= MAX_CUSTOM_GROUPS}
          onClick={addSection}
        >
          <Plus className="size-4" /> {t("addSection")}
        </Button>
        {fixedTail.map((s) => (
          <div key={s.id}>{sectionCard(s.id)}</div>
        ))}

        {/* The side lists of Admin settings and the personal Settings page (lib/settings-menu). */}
        {(["admin", "personal"] as const).map((scope) => {
          const key = scope === "admin" ? "adminSettingsPage" : "settingsPage";
          const groups = railGroupsFor(scope);
          return (
            <div key={scope} className="rounded-xl border border-border bg-card">
              <div className={cn("flex items-center gap-2 px-3 py-2", open[key] && "border-b border-border")}>
                <h3 className="px-1 text-sm font-semibold text-foreground">{t(key)}</h3>
                <button
                  type="button"
                  aria-expanded={!!open[key]}
                  aria-label={`${open[key] ? t("collapse") : t("expand")}: ${t(key)}`}
                  onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
                  className="ml-auto flex items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {t("itemCount", { count: groups.flatMap(({ group }) => RAIL_SECTION_IDS[group] ?? []).length })}
                  <ChevronDown className={cn("size-4 transition-transform", open[key] && "rotate-180")} />
                </button>
              </div>
              {open[key] && (
                <div className="space-y-3 p-3">
                  <p className="px-1 text-xs text-muted-foreground">{t(`${key}Hint`)}</p>
                  {groups.map(({ group }) => {
                    const ids = orderSettingsSections(RAIL_SECTION_IDS[group] ?? [], group, draft.settings);
                    if (ids.length === 0) return null;
                    return (
                      <div key={group}>
                        {group !== "top" && (
                          <p className="px-1 pb-1 text-[11px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
                            {tSettings(`groups.${group}`)}
                          </p>
                        )}
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorderSettings(group)}>
                          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                            <ul className="divide-y divide-border rounded-lg border border-border">
                              {ids.map((id) => {
                                const o = draft.settings?.items?.[id] ?? {};
                                const meta = SECTION_META[id as keyof typeof SECTION_META];
                                const Icon = (o.icon && BRAND_ICONS[o.icon]) || meta.icon;
                                const name = tSettings(`sections.${id}`);
                                const locked = LOCKED_SETTINGS.includes(id);
                                return (
                                  <li key={id}>
                                    <Sortable id={id} disabled={readOnly || ids.length < 2}>
                                      {(handle) => (
                                        <div className={cn("flex flex-wrap items-center gap-2.5 bg-card px-3 py-2 sm:flex-nowrap", o.hidden && "opacity-60")}>
                                          {handle}
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
                                                    onClick={() => setSettingsItem(id, { icon: key })}
                                                    className={cn("flex size-9 items-center justify-center rounded-md hover:bg-muted", o.icon === key && "bg-primary-soft text-primary")}
                                                  >
                                                    <I className="size-4" />
                                                  </button>
                                                ))}
                                              </div>
                                              <button
                                                type="button"
                                                className="mt-2 w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted"
                                                onClick={() => setSettingsItem(id, { icon: undefined })}
                                              >
                                                {t("defaultIcon")}
                                              </button>
                                            </PopoverContent>
                                          </Popover>
                                          <Input
                                            aria-label={`${t("rename")}: ${name}`}
                                            className="h-9 min-w-0 flex-1 basis-40"
                                            maxLength={MENU_LABEL_MAX}
                                            placeholder={name}
                                            disabled={readOnly}
                                            value={o.label ?? ""}
                                            onChange={(e) => setSettingsItem(id, { label: e.target.value })}
                                          />
                                          <label className="flex w-36 shrink-0 items-center gap-2 text-xs whitespace-nowrap text-muted-foreground">
                                            <Switch
                                              aria-label={`${t("show")}: ${name}`}
                                              checked={locked || !o.hidden}
                                              disabled={readOnly || locked}
                                              onCheckedChange={(on: boolean) => setSettingsItem(id, { hidden: !on })}
                                            />
                                            {locked ? t("locked") : t("show")}
                                          </label>
                                        </div>
                                      )}
                                    </Sortable>
                                  </li>
                                );
                              })}
                            </ul>
                          </SortableContext>
                        </DndContext>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

    </section>
  );
}
