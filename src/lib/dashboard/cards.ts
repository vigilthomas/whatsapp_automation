/**
 * Dashboard cards, templates and layouts — pure, no React, no I/O.
 *
 * The dashboard is a grid (react-grid-layout) of cards. Every user can
 * move, resize and hide cards, add hidden ones back, switch template,
 * and keep one saved preset (user_layouts, migration 064). The install's
 * admins can rename any card and change its icon, and pick the default
 * template (Settings → Branding → Dashboard, stored on
 * app_branding.dashboard).
 *
 * Templates:
 *   classic  bookings-first: today's bookings, staff availability, chats
 *   modern   sector-neutral: conversations, contacts, deals, response
 *            time — works for any business, with or without bookings
 *
 * Any card can be added to either template; a template only decides
 * what shows (and where) until the user changes it.
 *
 * Saved layouts are always run through `normalizeDashboard` against the
 * catalogue below, so removing or adding a card in code never breaks a
 * saved layout.
 */
import type { ModuleId } from "@/lib/auth/module-access";

export const DASHBOARD_TEMPLATES = ["classic", "modern"] as const;
export type DashboardTemplate = (typeof DASHBOARD_TEMPLATES)[number];

export const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 } as const;
export type Breakpoint = keyof typeof BREAKPOINTS;
export const COLS: Record<Breakpoint, number> = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 };
export const BREAKPOINT_IDS = Object.keys(BREAKPOINTS) as Breakpoint[];
export const ROW_HEIGHT = 28;

export interface CardDef {
  id: string;
  /** Lucide key from branding-icon-keys. */
  icon: string;
  /** The module whose Read permission the card needs; none = everyone. */
  module?: ModuleId;
  /** Default and minimum size, in grid units of the 12-column layout. */
  w: number;
  h: number;
  minW: number;
  minH: number;
}

export const CARDS: readonly CardDef[] = [
  // Bookings-first (classic) cards.
  { id: "stat-bookings-today", icon: "calendar-days", module: "appointments", w: 3, h: 4, minW: 2, minH: 3 },
  { id: "stat-open-chats", icon: "message-square", module: "inbox", w: 3, h: 4, minW: 2, minH: 3 },
  { id: "stat-customers", icon: "users", module: "contacts", w: 3, h: 4, minW: 2, minH: 3 },
  { id: "stat-pending", icon: "clock", module: "appointments", w: 3, h: 4, minW: 2, minH: 3 },
  { id: "today-bookings", icon: "calendar-check", module: "appointments", w: 6, h: 12, minW: 3, minH: 6 },
  { id: "staff-availability", icon: "user-round", module: "appointments", w: 6, h: 6, minW: 3, minH: 4 },
  { id: "recent-chats", icon: "messages-square", module: "inbox", w: 6, h: 10, minW: 3, minH: 5 },
  { id: "bookings-trend", icon: "bar-chart-3", module: "appointments", w: 6, h: 10, minW: 3, minH: 6 },
  // Sector-neutral (modern) cards.
  { id: "metric-active-chats", icon: "message-square", module: "inbox", w: 3, h: 4, minW: 2, minH: 3 },
  { id: "metric-new-contacts", icon: "user-plus", module: "contacts", w: 3, h: 4, minW: 2, minH: 3 },
  { id: "metric-messages-sent", icon: "send", module: "inbox", w: 3, h: 4, minW: 2, minH: 3 },
  { id: "metric-open-deals", icon: "briefcase", module: "deals", w: 3, h: 4, minW: 2, minH: 3 },
  { id: "conversations-chart", icon: "trending-up", module: "inbox", w: 8, h: 11, minW: 4, minH: 7 },
  { id: "pipeline", icon: "pie-chart", module: "deals", w: 4, h: 11, minW: 3, minH: 7 },
  { id: "response-time", icon: "timer", module: "inbox", w: 6, h: 10, minW: 4, minH: 7 },
  { id: "quick-actions", icon: "zap", w: 4, h: 7, minW: 3, minH: 5 },
  // Both.
  { id: "activity", icon: "activity", w: 6, h: 10, minW: 3, minH: 5 },
];

export const CARD_IDS = CARDS.map((c) => c.id);
const BY_ID = new Map(CARDS.map((c) => [c.id, c]));
export const cardDef = (id: string): CardDef | undefined => BY_ID.get(id);

/**
 * A card's narrowest width on a grid of `cols` columns: its 12-column
 * minimum scaled down, but never under half the grid on a small screen
 * (four tiles in a phone-width row are unreadable) and always full width
 * on the 2-column phone grid.
 */
export function minWidthFor(def: CardDef | undefined, cols: number): number {
  if (cols <= 2) return cols;
  const scaled = def ? Math.ceil((def.minW * cols) / 12) : 1;
  return Math.min(cols, Math.max(scaled, cols <= 4 ? Math.ceil(cols / 2) : 1));
}

export interface GridItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Templates are written for the 12-column layout; smaller screens are derived. */
const TEMPLATE_LG: Record<DashboardTemplate, GridItem[]> = {
  classic: [
    { i: "stat-bookings-today", x: 0, y: 0, w: 3, h: 4 },
    { i: "stat-open-chats", x: 3, y: 0, w: 3, h: 4 },
    { i: "stat-customers", x: 6, y: 0, w: 3, h: 4 },
    { i: "stat-pending", x: 9, y: 0, w: 3, h: 4 },
    { i: "today-bookings", x: 0, y: 4, w: 6, h: 16 },
    { i: "staff-availability", x: 6, y: 4, w: 6, h: 6 },
    { i: "activity", x: 6, y: 10, w: 6, h: 10 },
    { i: "recent-chats", x: 0, y: 20, w: 6, h: 10 },
    { i: "bookings-trend", x: 6, y: 20, w: 6, h: 10 },
  ],
  modern: [
    { i: "metric-active-chats", x: 0, y: 0, w: 3, h: 4 },
    { i: "metric-new-contacts", x: 3, y: 0, w: 3, h: 4 },
    { i: "metric-messages-sent", x: 6, y: 0, w: 3, h: 4 },
    { i: "metric-open-deals", x: 9, y: 0, w: 3, h: 4 },
    { i: "conversations-chart", x: 0, y: 4, w: 8, h: 11 },
    { i: "pipeline", x: 8, y: 4, w: 4, h: 11 },
    { i: "response-time", x: 0, y: 15, w: 6, h: 10 },
    { i: "activity", x: 6, y: 15, w: 6, h: 10 },
    { i: "recent-chats", x: 0, y: 25, w: 8, h: 10 },
    { i: "quick-actions", x: 8, y: 25, w: 4, h: 10 },
  ],
};

/** What's saved per user (user_layouts, key "dashboard"). */
export interface DashboardLayout {
  v: 1;
  template: DashboardTemplate;
  /** Visible cards. */
  cards: string[];
  layouts: Partial<Record<Breakpoint, GridItem[]>>;
}

/** Install-wide settings (app_branding.dashboard). */
export interface CardText {
  title?: string;
  icon?: string;
}
export interface DashboardSettings {
  template?: DashboardTemplate;
  cards?: Record<string, CardText>;
}

export const CARD_TITLE_MAX = 60;

export function isTemplate(v: unknown): v is DashboardTemplate {
  return typeof v === "string" && (DASHBOARD_TEMPLATES as readonly string[]).includes(v);
}

const int = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;

/**
 * Lay a wide (12-column) layout out for a narrower grid. Cards keep the
 * reading order of the wide layout and each wide row starts a new row,
 * so a row of four stat tiles wraps onto two rows of a tablet and the
 * two half-width cards under them still share a row. Widths keep their
 * share of the grid (never below the card's minimum); on a phone
 * (2 columns) everything stacks full width. react-grid-layout compacts
 * the result upwards, so gaps left by tall cards close up on screen.
 */
export function deriveLayout(wide: GridItem[], cols: number): GridItem[] {
  const ordered = [...wide].sort((a, b) => a.y - b.y || a.x - b.x);
  // Rows of the wide layout, in reading order.
  const rows: GridItem[][] = [];
  for (const it of ordered) {
    const last = rows[rows.length - 1];
    if (last && last[0].y === it.y) last.push(it);
    else rows.push([it]);
  }
  const out: GridItem[] = [];
  let y = 0;
  for (const row of rows) {
    // Share the narrow grid out in proportion to the wide widths, handing
    // the columns lost to rounding down to the first cards, so a row of
    // four quarter-width tiles stays one row on a 10-column grid.
    const exact = row.map((it) => (it.w * cols) / 12);
    const widths = exact.map(Math.floor);
    let spare = Math.floor(exact.reduce((a, b) => a + b, 0) + 1e-9) - widths.reduce((a, b) => a + b, 0);
    for (let i = 0; spare > 0 && i < widths.length; i++, spare--) widths[i] += 1;
    // A row that doesn't start at the left edge (a card sitting under the
    // right half) keeps its offset when it fits, so the grid's upward
    // compaction slots it back under its neighbour.
    const total = widths.reduce((a, b) => a + b, 0);
    const offset = Math.floor((row[0].x * cols) / 12);
    let x = offset + total <= cols ? offset : 0;
    let rowH = 0;
    row.forEach((it, i) => {
      const w = Math.min(cols, Math.max(minWidthFor(cardDef(it.i), cols), widths[i]));
      if (x + w > cols) {
        x = 0;
        y += rowH;
        rowH = 0;
      }
      out.push({ i: it.i, x, y, w, h: it.h });
      x += w;
      rowH = Math.max(rowH, it.h);
    });
    y += rowH;
  }
  return out;
}

/** A template's layout for every breakpoint. */
export function templateLayout(template: DashboardTemplate): DashboardLayout {
  const lg = TEMPLATE_LG[template].map((it) => ({ ...it }));
  const layouts: DashboardLayout["layouts"] = { lg };
  for (const bp of BREAKPOINT_IDS) if (bp !== "lg") layouts[bp] = deriveLayout(lg, COLS[bp]);
  return { v: 1, template, cards: lg.map((it) => it.i), layouts };
}

function cleanItems(raw: unknown, visible: Set<string>, cols: number): GridItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: GridItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const id = typeof o.i === "string" ? o.i : "";
    const def = cardDef(id);
    if (!def || !visible.has(id) || seen.has(id)) continue;
    seen.add(id);
    const minW = minWidthFor(def, cols);
    const w = int(o.w, minW, cols, Math.max(minW, Math.min(cols, Math.round((def.w * cols) / 12))));
    out.push({
      i: id,
      x: int(o.x, 0, cols - w, 0),
      y: int(o.y, 0, 10_000, 0),
      w,
      h: int(o.h, def.minH, 60, def.h),
    });
  }
  return out;
}

/** Put cards that have no position yet at the bottom. */
function appendMissing(items: GridItem[], ids: string[], cols: number): GridItem[] {
  const have = new Set(items.map((it) => it.i));
  let bottom = items.reduce((m, it) => Math.max(m, it.y + it.h), 0);
  const out = [...items];
  let x = 0;
  for (const id of ids) {
    if (have.has(id)) continue;
    const def = cardDef(id)!;
    const w = Math.min(cols, Math.max(minWidthFor(def, cols), Math.round((def.w * cols) / 12)));
    if (x + w > cols) {
      x = 0;
      bottom += def.h;
    }
    out.push({ i: id, x, y: bottom, w, h: def.h });
    x += w;
  }
  return out;
}

/** Whitelist a saved layout against the catalogue; fall back to the template. */
export function normalizeDashboard(raw: unknown, fallback: DashboardTemplate): DashboardLayout {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return templateLayout(fallback);
  const r = raw as Record<string, unknown>;
  const template = isTemplate(r.template) ? r.template : fallback;
  const cards = Array.isArray(r.cards)
    ? [...new Set(r.cards.filter((id): id is string => typeof id === "string" && BY_ID.has(id)))]
    : templateLayout(template).cards;
  const visible = new Set(cards);
  const rawLayouts = r.layouts && typeof r.layouts === "object" ? (r.layouts as Record<string, unknown>) : {};
  const lg = appendMissing(cleanItems(rawLayouts.lg, visible, COLS.lg), cards, COLS.lg);
  const layouts: DashboardLayout["layouts"] = { lg };
  for (const bp of BREAKPOINT_IDS) {
    if (bp === "lg") continue;
    const saved = cleanItems(rawLayouts[bp], visible, COLS[bp]);
    layouts[bp] = saved.length ? appendMissing(saved, cards, COLS[bp]) : deriveLayout(lg, COLS[bp]);
  }
  return { v: 1, template, cards, layouts };
}

/** Hide a card (it stays in the "Add card" list). */
export function hideCard(layout: DashboardLayout, id: string): DashboardLayout {
  if (!layout.cards.includes(id)) return layout;
  const cards = layout.cards.filter((c) => c !== id);
  const layouts: DashboardLayout["layouts"] = {};
  for (const bp of BREAKPOINT_IDS) layouts[bp] = (layout.layouts[bp] ?? []).filter((it) => it.i !== id);
  return { ...layout, cards, layouts };
}

/** Show a hidden card at the bottom of every breakpoint. */
export function showCard(layout: DashboardLayout, id: string): DashboardLayout {
  if (layout.cards.includes(id) || !BY_ID.has(id)) return layout;
  const cards = [...layout.cards, id];
  const layouts: DashboardLayout["layouts"] = {};
  for (const bp of BREAKPOINT_IDS) layouts[bp] = appendMissing(layout.layouts[bp] ?? [], cards, COLS[bp]);
  return { ...layout, cards, layouts };
}

/** Replace the positions after a drag/resize (only known, visible cards are kept). */
export function withPositions(
  layout: DashboardLayout,
  all: Partial<Record<string, readonly { i: string; x: number; y: number; w: number; h: number }[]>>,
): DashboardLayout {
  const visible = new Set(layout.cards);
  const layouts: DashboardLayout["layouts"] = { ...layout.layouts };
  for (const bp of BREAKPOINT_IDS) {
    const items = all[bp];
    if (items) layouts[bp] = cleanItems(items.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })), visible, COLS[bp]);
  }
  return { ...layout, layouts };
}

export function sameDashboard(a: DashboardLayout, b: DashboardLayout): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Whitelist the install's card titles/icons and default template. */
export function parseDashboardSettings(raw: unknown, iconKeys: readonly string[]): DashboardSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const out: DashboardSettings = {};
  if (isTemplate(r.template)) out.template = r.template;
  if (r.cards && typeof r.cards === "object" && !Array.isArray(r.cards)) {
    const cards: Record<string, CardText> = {};
    for (const [id, v] of Object.entries(r.cards as Record<string, unknown>)) {
      if (!BY_ID.has(id) || !v || typeof v !== "object") continue;
      const o = v as Record<string, unknown>;
      const title = typeof o.title === "string" ? o.title.replace(/[\u0000-\u001f]/g, "").trim().slice(0, CARD_TITLE_MAX) : "";
      const icon = typeof o.icon === "string" && iconKeys.includes(o.icon) ? o.icon : "";
      if (title || icon) cards[id] = { ...(title ? { title } : {}), ...(icon ? { icon } : {}) };
    }
    if (Object.keys(cards).length) out.cards = cards;
  }
  return out;
}
