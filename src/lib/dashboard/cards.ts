/**
 * Dashboard cards — the catalogue (ids, icons, sizes, the module whose
 * Read permission each needs, and where a click takes you) plus the grid
 * maths. Pure, no React, no I/O.
 *
 * Which cards a dashboard shows comes from the business type
 * (lib/dashboard/sectors.ts), the viewer's module permissions, and the
 * role's card switches in Access Control (designations.dashboard_cards,
 * migration 069). Per-user customisation (drag, resize, hide, templates)
 * was removed and stays removed; the layout is packed from the visible
 * cards each render.
 */
import type { ModuleId } from "@/lib/auth/module-access";

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
  /** Where clicking the card goes, with the dashboard's range and branch. */
  href?: (q: CardLinkQuery) => string;
}

export interface CardLinkQuery {
  fromDay: string;
  toDay: string;
  branch: string | null;
}

/** /appointments filtered to the dashboard's range (+ branch, + status). */
const appts = (status?: string) => (q: CardLinkQuery) => {
  const p = new URLSearchParams({ from: q.fromDay, to: q.toDay });
  if (q.branch) p.set("branch", q.branch);
  if (status) p.set("status", status);
  return `/appointments?${p.toString()}`;
};
const page = (path: string) => () => path;

export const CARDS: readonly CardDef[] = [
  // Bookings (module appointments — the only cards data scope narrows).
  { id: "stat-bookings-today", icon: "calendar-days", module: "appointments", w: 3, h: 4, minW: 2, minH: 3, href: appts() },
  { id: "stat-pending", icon: "clock", module: "appointments", w: 3, h: 4, minW: 2, minH: 3, href: appts("scheduled") },
  { id: "stat-no-show-rate", icon: "user", module: "appointments", w: 3, h: 4, minW: 2, minH: 3, href: appts("no_show") },
  { id: "stat-takings", icon: "wallet", module: "appointments", w: 3, h: 4, minW: 2, minH: 3, href: appts("completed") },
  { id: "stat-utilisation", icon: "pie-chart", module: "appointments", w: 3, h: 4, minW: 2, minH: 3, href: appts() },
  { id: "stat-returning", icon: "users-round", module: "appointments", w: 3, h: 4, minW: 2, minH: 3, href: appts("completed") },
  { id: "today-bookings", icon: "calendar-check", module: "appointments", w: 6, h: 12, minW: 3, minH: 6, href: appts() },
  { id: "staff-availability", icon: "user-round", module: "appointments", w: 6, h: 6, minW: 3, minH: 4, href: appts() },
  { id: "bookings-trend", icon: "bar-chart-3", module: "appointments", w: 6, h: 10, minW: 3, minH: 6, href: appts() },
  { id: "staff-bookings", icon: "users", module: "appointments", w: 6, h: 10, minW: 3, minH: 6, href: appts() },
  { id: "top-services", icon: "star", module: "appointments", w: 6, h: 10, minW: 3, minH: 6, href: appts() },
  // Chats.
  { id: "stat-open-chats", icon: "message-square", module: "inbox", w: 3, h: 4, minW: 2, minH: 3, href: page("/inbox") },
  { id: "metric-active-chats", icon: "message-square", module: "inbox", w: 3, h: 4, minW: 2, minH: 3, href: page("/inbox") },
  { id: "metric-messages-sent", icon: "send", module: "inbox", w: 3, h: 4, minW: 2, minH: 3, href: page("/inbox") },
  { id: "recent-chats", icon: "messages-square", module: "inbox", w: 6, h: 10, minW: 3, minH: 5, href: page("/inbox") },
  { id: "conversations-chart", icon: "trending-up", module: "inbox", w: 8, h: 11, minW: 4, minH: 7, href: page("/inbox") },
  { id: "response-time", icon: "timer", module: "inbox", w: 6, h: 10, minW: 4, minH: 7, href: page("/inbox") },
  // Contacts.
  { id: "stat-customers", icon: "users", module: "contacts", w: 3, h: 4, minW: 2, minH: 3, href: page("/contacts") },
  { id: "metric-new-contacts", icon: "user-plus", module: "contacts", w: 3, h: 4, minW: 2, minH: 3, href: page("/contacts") },
  // Deals.
  { id: "metric-open-deals", icon: "briefcase", module: "deals", w: 3, h: 4, minW: 2, minH: 3, href: page("/pipelines") },
  { id: "stat-pipeline-value", icon: "coins", module: "deals", w: 3, h: 4, minW: 2, minH: 3, href: page("/pipelines") },
  { id: "stat-deals-won-lost", icon: "handshake", module: "deals", w: 3, h: 4, minW: 2, minH: 3, href: page("/pipelines") },
  { id: "pipeline", icon: "pie-chart", module: "deals", w: 4, h: 11, minW: 3, minH: 7, href: page("/pipelines") },
  // Broadcasts.
  { id: "broadcast-results", icon: "megaphone", module: "broadcasts", w: 6, h: 10, minW: 3, minH: 6, href: page("/broadcasts") },
  // No module.
  { id: "quick-actions", icon: "zap", w: 4, h: 7, minW: 3, minH: 5 },
  { id: "activity", icon: "activity", w: 6, h: 10, minW: 3, minH: 5 },
];

export const CARD_IDS = CARDS.map((c) => c.id);
const BY_ID = new Map(CARDS.map((c) => [c.id, c]));
export const cardDef = (id: string): CardDef | undefined => BY_ID.get(id);

/**
 * Whether the role's data scope narrows this card. Only appointments
 * (and leave) carry a scope (permissions.ts `scopesFor`); chats,
 * contacts, deals and broadcasts are whole-business numbers, and the
 * dashboard says so on them.
 */
export function isScopedCard(def: CardDef): boolean {
  return def.module === "appointments";
}

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

/** A packed dashboard: the cards shown and their positions per breakpoint. */
export interface DashboardLayout {
  cards: string[];
  layouts: Partial<Record<Breakpoint, GridItem[]>>;
}

/**
 * app_branding.dashboard (064). No longer read — the column stays so old
 * rows load; the type is kept for Branding's row shape.
 */
export interface CardText {
  title?: string;
  icon?: string;
}
export interface DashboardSettings {
  template?: string;
  cards?: Record<string, CardText>;
}

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
    // A row of equal cards that doesn't divide evenly (four quarter
    // tiles on 10 columns → 3,3,2,2) squeezes the last ones. Split it
    // into equal rows instead: the most cards per row that divides both
    // the grid and the row (four tiles on 10 columns → 2 rows of 5 + 5).
    const same = row.every((it) => it.w === row[0].w);
    if (cols > 2 && same && (row[0].w * cols) % 12 !== 0) {
      let k = row.length;
      while (k > 1 && (cols % k !== 0 || row.length % k !== 0)) k--;
      if (k > 1) widths.fill(cols / k); // no even split → keep the shares
    }
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
