"use client";

/**
 * The signed-in user's dashboard arrangement: which cards show, where and
 * how big, per screen size, plus one saved preset. Mirrors the tables
 * (`useTableLayout` in components/ui/data-table): changes are kept
 * automatically, the preset is saved on purpose, and both live in
 * user_layouts (migration 064) with localStorage as cache/fallback.
 *
 * A user who never changed anything has no saved layout and follows the
 * install's default template (Settings → Dashboard), so changing that
 * default reaches them without overwriting anyone's own arrangement.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import {
  hideCard,
  normalizeDashboard,
  sameDashboard,
  showCard,
  templateLayout,
  withPositions,
  type DashboardLayout,
  type DashboardTemplate,
  type GridItem,
} from "@/lib/dashboard/cards";
import { debouncedStore, fetchLayouts, layoutDbKey, readLocal, storeLayout } from "@/lib/user-layouts";

const CURRENT = layoutDbKey("dashboard", "current");
const PRESET = layoutDbKey("dashboard", "preset");

export interface DashboardController {
  layout: DashboardLayout;
  /** False until the saved layout (if any) has been read. */
  ready: boolean;
  setTemplate: (t: DashboardTemplate) => void;
  hide: (id: string) => void;
  show: (id: string) => void;
  move: (all: Partial<Record<string, readonly GridItem[]>>) => void;
  reset: () => void;
  savePreset: () => Promise<void>;
  applyPreset: () => void;
  hasPreset: boolean;
  onPreset: boolean;
}

export function useDashboardLayout(defaultTemplate: DashboardTemplate): DashboardController {
  const { profile } = useAuth();
  const userId = profile?.id ?? null;
  const db = useMemo(() => createClient(), []);
  const persist = useMemo(() => debouncedStore(db), [db]);

  // null = never changed: follow the install default.
  const [saved, setSaved] = useState<unknown>(null);
  const [preset, setPreset] = useState<unknown>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    setSaved(readLocal(CURRENT, userId));
    setPreset(readLocal(PRESET, userId));
    void fetchLayouts(db, userId, [CURRENT, PRESET]).then((rows) => {
      if (!active) return;
      if (rows) {
        setSaved(rows[CURRENT] ?? null);
        setPreset(rows[PRESET] ?? null);
      }
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [db, userId]);

  const layout = useMemo(
    () => (saved ? normalizeDashboard(saved, defaultTemplate) : templateLayout(defaultTemplate)),
    [saved, defaultTemplate],
  );
  const presetLayout = useMemo(() => (preset ? normalizeDashboard(preset, defaultTemplate) : null), [preset, defaultTemplate]);

  const update = useCallback(
    (fn: (l: DashboardLayout) => DashboardLayout) => {
      const next = fn(layout);
      if (sameDashboard(next, layout)) return;
      setSaved(next);
      persist(userId, CURRENT, next);
    },
    [layout, persist, userId],
  );

  return {
    layout,
    ready,
    setTemplate: (t) => update(() => templateLayout(t)),
    hide: (id) => update((l) => hideCard(l, id)),
    show: (id) => update((l) => showCard(l, id)),
    move: (all) => update((l) => withPositions(l, all)),
    reset: () => update((l) => templateLayout(l.template)),
    savePreset: async () => {
      setPreset(layout);
      await storeLayout(db, userId, PRESET, layout);
    },
    applyPreset: () => {
      if (presetLayout) update(() => presetLayout);
    },
    hasPreset: !!presetLayout,
    onPreset: !!presetLayout && sameDashboard(presetLayout, layout),
  };
}
