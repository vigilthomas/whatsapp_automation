// ============================================================
// Designation permissions — pure, unit-testable, no I/O.
//
// Access control is "pick a designation, then tick what it may do":
// for every module, any of view / read / write / delete / export,
// in an order the admin arranges. The matrix lives on
// `designations.permissions` (migration 043) as an ORDERED array —
// jsonb objects don't keep key order, and the order is meaningful:
// it is the sidebar order for everyone holding that designation.
//
//   [ { "module": "appointments", "actions": ["view","read","write"] },
//     { "module": "contacts",     "actions": ["view","read"] } ]
//
// Actions:
//   view    — the module appears in that person's sidebar
//   read    — they may open it / the API may return its data
//   write   — create and edit
//   delete  — remove records
//   export  — download / CSV
// `read` is the base: every other action implies it, and removing it
// clears the module. `view` without `read` is not possible.
//
// THE RULE: every place that shows or performs an action checks the
// same matrix through `can()` — the sidebar (view), each page and its
// buttons (read / write / delete / export), AND the API route behind
// them (`requirePermission` in permission-guard.ts). UI gating is for
// experience; the route check is the actual boundary. A new route or
// button that touches clinic data must call one of these first — no
// exceptions.
//
// Fallback when a member has no designation: a role default (owner /
// admin → everything; agent → view/read/write/export; viewer →
// view/read), minus any module the per-role deny-list from 040 hides,
// in default sidebar order. Owner is never restricted regardless of
// designation, so a lock-out is always recoverable.
// ============================================================

import { MODULES, canAccessModule, isModuleId, type ModuleAccess, type ModuleId } from "./module-access";
import type { AccountRole } from "./roles";

export const ACTIONS = ["view", "read", "write", "delete", "export"] as const;
export type Action = (typeof ACTIONS)[number];

export interface PermissionEntry {
  module: ModuleId;
  actions: Action[];
}

/** Ordered list; a module absent from it is fully denied. */
export type Permissions = PermissionEntry[];

export function isAction(v: unknown): v is Action {
  return typeof v === "string" && (ACTIONS as readonly string[]).includes(v);
}

function normaliseActions(actions: unknown): Action[] {
  if (!Array.isArray(actions)) return [];
  const set = new Set(actions.filter(isAction));
  if (!set.has("read")) return [];
  return ACTIONS.filter((a) => set.has(a));
}

/**
 * Coerce the JSONB column into a well-formed, de-duplicated, ordered
 * list. Unknown modules and actions are dropped (a row written by a
 * newer build still loads); entries without `read` are dropped;
 * anything that isn't an array resolves to "nothing".
 */
export function parsePermissions(raw: unknown): Permissions {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<ModuleId>();
  const out: Permissions = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { module, actions } = item as { module?: unknown; actions?: unknown };
    if (!isModuleId(module) || seen.has(module)) continue;
    const list = normaliseActions(actions);
    if (list.length === 0) continue;
    seen.add(module);
    out.push({ module, actions: list });
  }
  return out;
}

const ROLE_DEFAULT: Record<AccountRole, readonly Action[]> = {
  owner: ACTIONS,
  admin: ACTIONS,
  agent: ["view", "read", "write", "export"],
  viewer: ["view", "read"],
};

/** Full list for a role with no designation, in default order. */
export function roleDefaultPermissions(role: AccountRole): Permissions {
  return MODULES.map((module) => ({ module, actions: [...ROLE_DEFAULT[role]] }));
}

export interface EffectiveInput {
  role: AccountRole | null;
  /** Parsed list of the member's designation, or null when none. */
  designation: Permissions | null;
  /** The account's per-role module deny-list (040). */
  moduleAccess: ModuleAccess;
}

/**
 * What this member may actually do, in their sidebar order.
 *
 * - owner: everything, always.
 * - designation set: exactly its list.
 * - otherwise: the role default, minus modules the 040 deny-list
 *   hides for that role.
 * - no role resolved yet: nothing (fail closed) — callers gate on
 *   `profileLoading` before trusting this.
 */
export function effectivePermissions({ role, designation, moduleAccess }: EffectiveInput): Permissions {
  if (!role) return [];
  if (role === "owner") return roleDefaultPermissions("owner");
  if (designation) return designation;
  return roleDefaultPermissions(role).filter((e) => canAccessModule(moduleAccess, role, e.module));
}

/** True iff `action` on `module` is allowed. */
export function can(perms: Permissions, module: ModuleId, action: Action): boolean {
  return perms.find((e) => e.module === module)?.actions.includes(action) ?? false;
}

/** Modules with `view`, in sidebar order. */
export function visibleModules(perms: Permissions): ModuleId[] {
  return perms.filter((e) => e.actions.includes("view")).map((e) => e.module);
}

/**
 * Copy with one cell toggled. Turning on any action also turns on
 * `read`; turning off `read` removes the module; a module toggled on
 * for the first time is appended at the end of the order.
 */
export function togglePermission(
  perms: Permissions,
  module: ModuleId,
  action: Action,
  allowed: boolean,
): Permissions {
  const idx = perms.findIndex((e) => e.module === module);
  const current = new Set(idx >= 0 ? perms[idx].actions : []);
  if (allowed) {
    current.add(action);
    current.add("read");
  } else {
    current.delete(action);
    if (action === "read") current.clear();
  }
  const actions = ACTIONS.filter((a) => current.has(a));
  const next = perms.slice();
  if (actions.length === 0) {
    if (idx >= 0) next.splice(idx, 1);
  } else if (idx >= 0) {
    next[idx] = { module, actions };
  } else {
    next.push({ module, actions });
  }
  return next;
}

/** Copy with the entry at `from` moved to `to` (indices within the list). */
export function movePermission(perms: Permissions, from: number, to: number): Permissions {
  if (from === to || from < 0 || to < 0 || from >= perms.length || to >= perms.length) return perms;
  const next = perms.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * The editor shows every module — granted ones first in their saved
 * order, then the rest in default order so they can be switched on.
 */
export function editorRows(perms: Permissions): ModuleId[] {
  const granted = perms.map((e) => e.module);
  const rest = MODULES.filter((m) => !granted.includes(m));
  return [...granted, ...rest];
}
