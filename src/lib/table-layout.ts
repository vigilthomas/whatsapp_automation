/**
 * Column layout for the modular tables (src/components/ui/data-table.tsx)
 * — pure, no React, no I/O except the small storage helpers at the end.
 *
 * A layout is what the user changed about a table: column order, which
 * columns are hidden, and column widths. Every table has:
 *
 *   - its **default** layout, from the column definitions in code;
 *   - the **current** layout, saved automatically as the user drags,
 *     resizes or hides columns;
 *   - one **preset**: a layout the user saved on purpose and can go back
 *     to ("Apply my preset"). One per table, per user, per browser.
 *
 * Layouts are stored in localStorage (no schema change needed). Saved
 * layouts are always run through `normalizeLayout` against the table's
 * current columns, so adding, removing or renaming a column in code never
 * breaks a saved layout: unknown ids are dropped, new columns appear at
 * the end with their default visibility.
 */

export interface LayoutColumn {
  id: string;
  /** Can the user hide it? Default true. Name-like columns set false. */
  hideable?: boolean;
  defaultHidden?: boolean;
  width?: number;
  minWidth?: number;
}

export interface TableLayout {
  order: string[];
  hidden: string[];
  widths: Record<string, number>;
}

export const MIN_COLUMN_WIDTH = 60;
export const MAX_COLUMN_WIDTH = 900;

export function defaultLayout(columns: LayoutColumn[]): TableLayout {
  return {
    order: columns.map((c) => c.id),
    hidden: columns.filter((c) => c.defaultHidden && c.hideable !== false).map((c) => c.id),
    widths: {},
  };
}

/** Make any (possibly stale or hand-edited) saved layout valid for these columns. */
export function normalizeLayout(columns: LayoutColumn[], saved: unknown): TableLayout {
  const base = defaultLayout(columns);
  if (!saved || typeof saved !== "object") return base;
  const s = saved as Partial<TableLayout>;
  const ids = new Set(columns.map((c) => c.id));
  const byId = new Map(columns.map((c) => [c.id, c]));

  const seen = new Set<string>();
  const order: string[] = [];
  for (const id of Array.isArray(s.order) ? s.order : []) {
    if (typeof id === "string" && ids.has(id) && !seen.has(id)) {
      seen.add(id);
      order.push(id);
    }
  }
  for (const c of columns) if (!seen.has(c.id)) order.push(c.id);

  // Columns the saved layout never heard of keep their default visibility.
  const known = new Set(Array.isArray(s.order) ? s.order : []);
  const hidden = columns
    .filter((c) => c.hideable !== false)
    .filter((c) =>
      known.has(c.id) ? Array.isArray(s.hidden) && s.hidden.includes(c.id) : !!c.defaultHidden,
    )
    .map((c) => c.id);

  const widths: Record<string, number> = {};
  if (s.widths && typeof s.widths === "object") {
    for (const [id, w] of Object.entries(s.widths)) {
      if (ids.has(id) && typeof w === "number" && Number.isFinite(w)) {
        widths[id] = clampWidth(w, byId.get(id)?.minWidth);
      }
    }
  }
  // Never let every column be hidden.
  if (hidden.length >= order.length) return { order, hidden: [], widths };
  return { order, hidden, widths };
}

export function clampWidth(w: number, min = MIN_COLUMN_WIDTH): number {
  return Math.round(Math.min(MAX_COLUMN_WIDTH, Math.max(min, w)));
}

/** Move `id` to where `overId` is (drag and drop). */
export function moveColumn(layout: TableLayout, id: string, overId: string): TableLayout {
  const from = layout.order.indexOf(id);
  const to = layout.order.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return layout;
  const order = [...layout.order];
  order.splice(from, 1);
  order.splice(to, 0, id);
  return { ...layout, order };
}

/** Show or hide a column. Refuses to hide the last visible one. */
export function toggleColumn(layout: TableLayout, id: string, show: boolean): TableLayout {
  if (show) return { ...layout, hidden: layout.hidden.filter((h) => h !== id) };
  if (layout.hidden.includes(id)) return layout;
  const visible = layout.order.filter((o) => !layout.hidden.includes(o));
  if (visible.length <= 1) return layout;
  return { ...layout, hidden: [...layout.hidden, id] };
}

export function resizeColumn(layout: TableLayout, id: string, width: number, min?: number): TableLayout {
  return { ...layout, widths: { ...layout.widths, [id]: clampWidth(width, min) } };
}

/** Visible column ids in display order. */
export function visibleIds(layout: TableLayout): string[] {
  return layout.order.filter((id) => !layout.hidden.includes(id));
}

export function sameLayout(a: TableLayout, b: TableLayout): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/* ── storage ── */

const PREFIX = "clinicoro.table";

export function storageKey(tableId: string, kind: "current" | "preset", userId?: string | null): string {
  return `${PREFIX}.${tableId}.${kind}${userId ? `.${userId}` : ""}`;
}

export function readStored(key: string): unknown {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // private mode, blocked storage, or bad JSON: fall back to defaults
  }
}

export function writeStored(key: string, value: TableLayout | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the layout still works for this visit.
  }
}
