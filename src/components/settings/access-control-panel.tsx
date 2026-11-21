"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, ChevronDown, GripVertical, Loader2, LockKeyhole, Minus, Plus, Search, Undo2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useBranding } from "@/hooks/use-branding";
import { MODULES, SETTINGS_MODULES, isSettingsModule, type ModuleId } from "@/lib/auth/module-access";
import {
  ACTIONS,
  actionsFor,
  can,
  hasAll,
  moveWithin,
  setModulesAll,
  parsePermissions,
  scopeOf,
  scopesFor,
  setScope,
  togglePermission,
  type DataScope,
  type Action,
  type Permissions,
} from "@/lib/auth/permissions";
import { FIXED_SECTIONS, orderGroupIds, resolveMenu } from "@/lib/branding-menu";
import { menuSections, navGroups, type NavItem } from "@/components/layout/nav-config";
import type { MasterRecord } from "@/lib/master/entities";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DataScopePicker, type BranchOption } from "./data-scope-picker";
import { DashboardCardsTab } from "./dashboard-cards-tab";
import { parseDashboardCards } from "@/lib/dashboard/card-switches";
import { defaultSector, isSector, parseVocabulary } from "@/lib/vocabulary";

/**
 * Circular tick toggle for one matrix cell. Colours come straight from
 * the theme tokens so it follows light/dark and the colour theme.
 */
function AccessToggle({
  checked,
  mixed,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  /** Some but not all ticked (a row or group toggle): shows a dash, clicking ticks everything. */
  mixed?: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={mixed && !checked ? "mixed" : checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-full border transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-60",
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : mixed
            ? "border-primary text-primary"
            : "border-border bg-card text-transparent hover:border-primary/60",
      )}
    >
      {mixed && !checked ? (
        <Minus className="size-3.5" strokeWidth={3} />
      ) : (
        <Check className="size-3.5" strokeWidth={3} />
      )}
    </button>
  );
}

/** Pick one designation from a searchable dropdown. */
function DesignationPicker({
  designations,
  selectedId,
  onSelect,
  loading,
  action,
}: {
  designations: MasterRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  /** Shown beside the dropdown (the Save button). */
  action?: ReactNode;
}) {
  const t = useTranslations("Settings.access");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = designations.find((d) => d.id === selectedId);
  const q = query.trim().toLowerCase();
  const matches = q ? designations.filter((d) => String(d.name).toLowerCase().includes(q)) : designations;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm font-medium text-foreground">{t("designations")}</span>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger
          disabled={loading || designations.length === 0}
          className="flex h-10 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-background px-3 text-left text-sm hover:bg-muted disabled:opacity-60 sm:w-72"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <span className={cn("min-w-0 flex-1 truncate", !selected && "text-muted-foreground")}>
              {selected ? String(selected.name) : designations.length ? t("pickPlaceholder") : t("noDesignations")}
            </span>
          )}
          {selected ? (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {parsePermissions(selected.permissions).length}
            </span>
          ) : null}
          <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--anchor-width)] min-w-64 p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchDesignations")}
              aria-label={t("searchDesignations")}
              className="h-9 pl-8"
            />
          </div>
          <ul role="listbox" aria-label={t("designations")} className="max-h-64 overflow-y-auto">
            {matches.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs text-muted-foreground">{t("noMatches")}</li>
            ) : (
              matches.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={d.id === selectedId}
                    onClick={() => {
                      onSelect(d.id);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm",
                      d.id === selectedId ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted",
                    )}
                  >
                    <Check className={cn("size-4 shrink-0", d.id === selectedId ? "opacity-100" : "opacity-0")} />
                    <span className="min-w-0 flex-1 truncate">{String(d.name)}</span>
                    <span className="shrink-0 text-xs tabular-nums opacity-70">
                      {parsePermissions(d.permissions).length}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
          <Link
            href="/master/designations"
            className="flex items-center gap-1.5 border-t border-border px-2.5 pt-2 text-xs font-medium text-primary hover:underline"
          >
            <Plus className="size-3.5" /> {t("manageDesignations")}
          </Link>
        </PopoverContent>
      </Popover>
      {action}
      <p className="w-full text-xs text-muted-foreground">{t("designationsHint")}</p>
    </div>
  );
}

/** One matrix row; granted rows can be dragged by the handle in the (sticky) name cell. */
function ModuleRow({
  module,
  granted,
  draggable,
  children,
}: {
  module: ModuleId;
  granted: boolean;
  draggable: boolean;
  children: (handle: ReactNode) => ReactNode;
}) {
  const t = useTranslations("Settings.access");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: module,
    disabled: !draggable,
  });
  const handle = draggable ? (
    <button
      type="button"
      {...attributes}
      {...listeners}
      aria-label={t("dragToReorder")}
      className="flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:text-foreground active:cursor-grabbing"
    >
      <GripVertical className="size-4" />
    </button>
  ) : (
    <span className="size-6 shrink-0" aria-hidden />
  );
  return (
    <TableRow
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("h-11", !granted && "text-muted-foreground", isDragging && "relative z-10 opacity-70")}
    >
      {children(handle)}
    </TableRow>
  );
}

type ModuleSection = { id: string; label: string; modules: ModuleId[] };

/**
 * Access control — pick a designation, then set what it may do.
 *
 * Modules are grouped like the sidebar (Main, Master, Controls…, following
 * Settings → Sidebar menu), each group a card that folds open and shut. One
 * row per module, five cells (view / read / write / delete / export). Inside
 * a group, granted modules come first in the order the admin arranged them —
 * that order is the sidebar order for everyone holding the designation,
 * unless Sidebar menu sets the group's order — then the rest, so they can be
 * switched on. Drag the handle to rearrange.
 *
 * On phones and tablets the module name stays put while the actions scroll
 * sideways, and a group longer than ten rows scrolls inside its card.
 *
 * Saves to `designations.permissions` via PATCH /api/master/
 * designations/<id>, which itself is gated on `designations:write`,
 * so the same matrix governs who may edit the matrix.
 */
export function AccessControlPanel() {
  const { can: callerCan, profileLoading, refreshProfile } = useAuth();
  const { branding } = useBranding();
  const t = useTranslations("Settings.access");
  const tModules = useTranslations("Settings.access.modules");
  const tActions = useTranslations("Settings.access.actions");
  const tMenu = useTranslations("Settings.menu");
  const tSidebar = useTranslations("Sidebar");
  const confirm = useConfirm();

  const [designations, setDesignations] = useState<MasterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Permissions>([]);
  const [saving, setSaving] = useState(false);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  // Earlier drafts, newest last, for Undo. Cleared on save or a new pick.
  const [history, setHistory] = useState<{ p: Permissions; c: string[] }[]>([]);
  // Dashboard tab: cards switched off for this role (designations.dashboard_cards, 069).
  const [tab, setTab] = useState<"permissions" | "dashboard">("permissions");
  const [cardsDraft, setCardsDraft] = useState<string[]>([]);
  // For Data access → Custom. Loaded once; a caller without Branches
  // read just gets an empty list (the picker says there are none).
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/master/designations", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t("loadFailed"));
        return;
      }
      const rows: MasterRecord[] = Array.isArray(data.records) ? data.records : [];
      setDesignations(rows);
      setSelectedId((cur) => cur ?? (rows[0]?.id ?? null));
    } catch {
      toast.error(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/master/branches", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { records: [] }))
      .then((data: { records?: MasterRecord[] }) => {
        if (cancelled) return;
        const rows = Array.isArray(data.records) ? data.records : [];
        setBranches(rows.map((r) => ({ id: r.id, name: String(r.name ?? "") })));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setBranchesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(
    () => designations.find((d) => d.id === selectedId) ?? null,
    [designations, selectedId],
  );
  const saved = useMemo(() => parsePermissions(selected?.permissions), [selected]);
  const savedCards = useMemo(() => parseDashboardCards(selected?.dashboard_cards).disabled, [selected]);

  // Re-seed the draft when the selection (or a save) changes.
  useEffect(() => {
    setDraft(saved);
    setCardsDraft(savedCards);
    setHistory([]);
  }, [saved]);

  const cardsDirty = JSON.stringify(cardsDraft) !== JSON.stringify(savedCards);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved) || cardsDirty;
  const editable = !profileLoading && callerCan("designations", "edit");
  const sector = useMemo(() => {
    const s = parseVocabulary(branding.vocabulary).sector;
    return isSector(s) ? s : defaultSector();
  }, [branding.vocabulary]);

  // The sidebar's sections (with Sidebar menu's moves, names and group order) → their modules.
  const placed = useMemo(() => resolveMenu<NavItem>(menuSections(), branding.menu), [branding.menu]);
  // A module's name as Sidebar menu shows it (renamed there → renamed here).
  const nameOf = (module: ModuleId) => {
    for (const s of placed) {
      const item = s.items.find((i) => i.module === module);
      if (item) return item.label ?? tSidebar(item.labelKey as string);
    }
    return tModules(module);
  };

  const sections = useMemo<ModuleSection[]>(() => {
    const ids = ["top", ...orderGroupIds(navGroups.map((g) => g.id), branding.menu)];
    const out: ModuleSection[] = ids.map((id) => {
      const section = placed.find((s) => s.id === id);
      const group = navGroups.find((g) => g.id === id);
      return {
        id,
        label: section?.label || (group ? tSidebar(group.labelKey) : tMenu("top")),
        modules: (section?.items ?? []).map((i) => i.module).filter((m): m is ModuleId => !!m),
      };
    });
    const placedModules = new Set(out.flatMap((s) => s.modules));
    const rest = MODULES.filter((m) => !placedModules.has(m) && !isSettingsModule(m) && m !== "deals");
    if (rest.length) out.push({ id: "other", label: t("otherModules"), modules: rest });
    out.push({ id: "settings", label: t("settingsModules"), modules: [...SETTINGS_MODULES, "deals"] });
    return out.filter((s) => s.modules.length && !FIXED_SECTIONS.includes(s.id));
  }, [placed, branding.menu, t, tMenu, tSidebar]);

  /** A group's rows: granted modules in saved order, then the rest in sidebar order. */
  const rowsOf = (modules: ModuleId[]) => {
    const granted = draft.map((e) => e.module).filter((m) => modules.includes(m));
    return { granted, rows: [...granted, ...modules.filter((m) => !granted.includes(m))] };
  };

  /** Every change goes through here so Undo can step back. */
  const change = (next: Permissions) => {
    if (JSON.stringify(next) === JSON.stringify(draft)) return;
    setHistory((h) => [...h, { p: draft, c: cardsDraft }]);
    setDraft(next);
  };
  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setDraft(prev.p);
    setCardsDraft(prev.c);
  };

  const setCell = (module: ModuleId, action: Action, allowed: boolean) =>
    change(togglePermission(draft, module, action, allowed));

  /** Tick (or clear) every action of these modules. */
  const setAll = (modules: readonly ModuleId[], on: boolean) => change(setModulesAll(draft, modules, on));

  /** View and Read on every module, nothing else. */
  const readOnlyAll = () =>
    change(
      MODULES.map((module) => {
        const scope = draft.find((e) => e.module === module)?.scope;
        const actions = ["view", "read"] as Action[];
        return scope ? { module, actions, scope } : { module, actions };
      }),
    );

  const setModuleScope = (module: ModuleId, scope: DataScope) => change(setScope(draft, module, scope));

  /** Switch one dashboard card on/off for this role (undoable like the grid). */
  const setCard = (id: string, on: boolean) => {
    const next = on ? cardsDraft.filter((c) => c !== id) : [...cardsDraft, id];
    setHistory((h) => [...h, { p: draft, c: cardsDraft }]);
    setCardsDraft(next);
  };

  /** Group toggle state: every applicable tick, some, or none. */
  const stateOf = (modules: readonly ModuleId[]) => {
    const all = modules.length > 0 && modules.every((m) => hasAll(draft, m));
    const some = modules.some((m) => draft.some((e) => e.module === m));
    return { all, mixed: !all && some };
  };

  const reorder = (granted: ModuleId[]) => (e: DragEndEvent) => {
    const from = granted.indexOf(e.active.id as ModuleId);
    const to = e.over ? granted.indexOf(e.over.id as ModuleId) : -1;
    if (from < 0 || to < 0) return;
    change(moveWithin(draft, granted, from, to));
  };

  async function save() {
    if (!selected || !dirty) return;
    const ok = await confirm({
      title: t("confirmSaveTitle", { name: String(selected.name) }),
      description: t("confirmSaveDesc"),
      confirmLabel: t("save"),
    });
    if (!ok) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/master/designations/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // dashboard_cards only when it changed, so roles still save
        // before migration 069 adds the column.
        body: JSON.stringify(cardsDirty ? { permissions: draft, dashboard_cards: { disabled: cardsDraft } } : { permissions: draft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t("saveFailed"));
        return;
      }
      toast.success(t("saveSuccess"));
      await load();
      // The editor may have changed their own designation.
      await refreshProfile();
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  // Sticky first column: opaque so the action cells slide underneath it.
  const stickyName = "sticky left-0 z-[1] bg-card";

  return (
    <section className="max-w-5xl animate-in fade-in-50 duration-200">
      <Card>
        <CardHeader className="space-y-4">
          <DesignationPicker
            designations={designations}
            selectedId={selectedId}
            onSelect={setSelectedId}
            loading={loading}
            action={
              editable ? (
                <>
                <Button
                  variant="outline"
                  onClick={undo}
                  disabled={saving || history.length === 0}
                  className="h-10"
                >
                  <Undo2 className="size-4" />
                  {t("undo")}
                </Button>
                <Button onClick={save} disabled={saving || !dirty || !selected} className="h-10">
                  {saving ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {t("saving")}
                    </>
                  ) : (
                    t("save")
                  )}
                </Button>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">{t("adminOnlyHint")}</span>
              )
            }
          />
          <div>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <LockKeyhole className="size-4 text-primary" />
              {selected ? t("matrixTitleFor", { name: String(selected.name) }) : t("matrixTitle")}
            </CardTitle>
            <CardDescription className="mt-1 text-muted-foreground">{t("matrixDesc")}</CardDescription>
          </div>
          {selected ? (
            <div role="tablist" aria-label={t("tabsLabel")} className="inline-flex w-fit rounded-lg border border-border p-0.5 text-sm">
              {(["permissions", "dashboard"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={tab === k}
                  onClick={() => setTab(k)}
                  className={cn(
                    "rounded-md px-3 py-1.5 transition-colors",
                    tab === k ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {k === "permissions" ? t("tabPermissions") : t("tabDashboard")}
                </button>
              ))}
            </div>
          ) : null}
          {editable && selected && tab === "permissions" ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setAll(MODULES, true)}>
                {t("selectAll")}
              </Button>
              <Button size="sm" variant="outline" onClick={readOnlyAll}>
                {t("readOnlyAll")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAll(MODULES, false)}>
                {t("deselectAll")}
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {!selected ? (
            <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              {loading ? t("loading") : t("pickDesignation")}
            </p>
          ) : tab === "dashboard" ? (
            <DashboardCardsTab
              sector={sector}
              disabled={cardsDraft}
              canRead={(m) => can(draft, m, "read")}
              moduleName={nameOf}
              editable={editable}
              onToggle={setCard}
            />
          ) : (
            sections.map((section) => {
              const { granted, rows } = rowsOf(section.modules);
              const isOpen = !closed[section.id];
              const group = stateOf(section.modules);
              return (
                <div key={section.id} className="rounded-xl border border-border">
                  <div className={cn("flex items-center gap-1 pl-4", isOpen && "border-b border-border")}>
                    <AccessToggle
                      checked={group.all}
                      mixed={group.mixed}
                      disabled={!editable}
                      onChange={(v) => setAll(section.modules, v)}
                      label={t("selectGroup", { group: section.label })}
                    />
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setClosed((c) => ({ ...c, [section.id]: !c[section.id] }))}
                      className="flex min-w-0 flex-1 items-center gap-2 py-2.5 pr-4 pl-2 text-left hover:bg-muted/50"
                    >
                      <span className="text-sm font-semibold text-foreground">{section.label}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {t("grantedOf", { granted: granted.length, total: rows.length })}
                      </span>
                      <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                    </button>
                  </div>
                  {isOpen && (
                    // Below lg: name column sticks while actions scroll sideways; past 10 rows the card scrolls.
                    <div className="max-h-[488px] overflow-auto lg:max-h-none">
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder(granted)}>
                        <table className="w-full caption-bottom text-sm">
                          <TableHeader className="sticky top-0 z-[2] bg-card">
                            <TableRow>
                              <TableHead className={cn(stickyName, "z-[3] min-w-40 text-muted-foreground")}>
                                {t("moduleColumn")}
                              </TableHead>
                              {ACTIONS.map((a) => (
                                <TableHead key={a} className="w-20 min-w-16 text-center text-muted-foreground">
                                  {tActions(a)}
                                </TableHead>
                              ))}
                              <TableHead className="w-40 min-w-36 text-muted-foreground">{t("dataAccess")}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <SortableContext items={granted} strategy={verticalListSortingStrategy}>
                            <TableBody>
                              {rows.map((module, i) => {
                                const isGranted = i < granted.length;
                                return (
                                  <ModuleRow
                                    key={module}
                                    module={module}
                                    granted={isGranted}
                                    draggable={editable && isGranted && granted.length > 1}
                                  >
                                    {(handle) => (
                                      <>
                                        <TableCell
                                          className={cn(
                                            stickyName,
                                            "font-medium",
                                            isGranted ? "text-foreground" : "text-muted-foreground",
                                            i === granted.length && granted.length > 0 && "border-t-2 border-t-border",
                                          )}
                                        >
                                          <span className="flex items-center gap-1.5">
                                            {handle}
                                            <AccessToggle
                                              checked={hasAll(draft, module)}
                                              mixed={isGranted}
                                              disabled={!editable}
                                              onChange={(v) => setAll([module], v)}
                                              label={t("selectRow", { module: nameOf(module) })}
                                            />
                                            <span className="truncate">{nameOf(module)}</span>
                                          </span>
                                        </TableCell>
                                        {ACTIONS.map((a) => (
                                          <TableCell
                                            key={a}
                                            className={cn(
                                              "text-center",
                                              i === granted.length && granted.length > 0 && "border-t-2 border-t-border",
                                            )}
                                          >
                                            {actionsFor(module).includes(a) ? (
                                              <AccessToggle
                                                checked={can(draft, module, a)}
                                                disabled={!editable}
                                                onChange={(v) => setCell(module, a, v)}
                                                label={t("cellAria", { action: tActions(a), module: nameOf(module) })}
                                              />
                                            ) : (
                                              <span className="text-muted-foreground" aria-label={t("notApplicable")}>
                                                –
                                              </span>
                                            )}
                                          </TableCell>
                                        ))}
                                        <TableCell
                                          className={cn(
                                            "pr-3",
                                            i === granted.length && granted.length > 0 && "border-t-2 border-t-border",
                                          )}
                                        >
                                          {isGranted && scopesFor(module).length > 0 ? (
                                            <DataScopePicker
                                              module={module}
                                              moduleName={nameOf(module)}
                                              scope={scopeOf(draft, module)}
                                              branches={branches}
                                              branchesLoading={branchesLoading}
                                              disabled={!editable}
                                              onChange={(next) => setModuleScope(module, next)}
                                            />
                                          ) : (
                                            <span className="text-muted-foreground" aria-label={t("notApplicable")}>
                                              –
                                            </span>
                                          )}
                                        </TableCell>
                                      </>
                                    )}
                                  </ModuleRow>
                                );
                              })}
                            </TableBody>
                          </SortableContext>
                        </table>
                      </DndContext>
                    </div>
                  )}
                </div>
              );
            })
          )}

          <p className="text-xs text-muted-foreground">{t("ownerNote")}</p>
        </CardContent>
      </Card>
    </section>
  );
}
