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
//   write   — create new records (shown as "Create")
//   edit    — change existing records
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
// in default sidebar order. The super admin (049) is never restricted,
// so a lock-out is always recoverable; the clinic's owners follow their
// designation like everyone else (with no designation, everything).
// ============================================================

import {
  MODULES,
  canAccessModule,
  isModuleId,
  isSettingsModule,
  type ModuleAccess,
  type ModuleId,
} from "./module-access";
import type { AccountRole } from "./roles";

export const ACTIONS = ["view", "read", "write", "edit", "delete", "export"] as const;
export type Action = (typeof ACTIONS)[number];

// ------------------------------------------------------------
// Data scope — WHOSE records a granted module shows, on top of WHAT
// may be done with them. Optional per entry; absent means "all".
//
//   all     — every branch (the default, and what older rows mean)
//   branch  — only the member's own branch (profiles.branch_id, set
//             under Master → Users); no branch set → nothing
//   own     — only records assigned to the member (an appointment
//             whose doctor is them, their own leave)
//   custom  — only the branches picked in `branches`
//
// Only modules whose rows carry a branch support it (`scopesFor`).
// The API routes apply it (`data-scope.ts`) and migration 058 mirrors
// it in RLS so direct browser reads (dashboard tiles, the inbox
// contact panel) follow the same rule.
// ------------------------------------------------------------

export const SCOPE_TYPES = ["all", "branch", "own", "custom"] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];

export interface DataScope {
  type: ScopeType;
  /** Branch ids, only for `custom`. */
  branches?: string[];
}

export interface PermissionEntry {
  module: ModuleId;
  actions: Action[];
  /** Omitted = all branches. */
  scope?: DataScope;
}

/** Ordered list; a module absent from it is fully denied. */
export type Permissions = PermissionEntry[];

export function isAction(v: unknown): v is Action {
  return typeof v === "string" && (ACTIONS as readonly string[]).includes(v);
}

/** Modules whose records can be narrowed by branch / ownership. */
const SCOPED_MODULES: Partial<Record<ModuleId, readonly ScopeType[]>> = {
  appointments: SCOPE_TYPES,
  leaves: SCOPE_TYPES,
};

/** The data-scope choices for a module; empty when it has none. */
export function scopesFor(module: ModuleId): readonly ScopeType[] {
  return SCOPED_MODULES[module] ?? [];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CUSTOM_BRANCHES = 200;

/**
 * Coerce a stored scope. Returns undefined for "all", anything
 * malformed, or a module without scopes — so the entry stays
 * byte-identical to a pre-scope one and old rows compare equal.
 */
export function parseScope(raw: unknown, module: ModuleId): DataScope | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const { type, branches } = raw as { type?: unknown; branches?: unknown };
  const allowed = scopesFor(module);
  if (typeof type !== "string" || !allowed.includes(type as ScopeType) || type === "all") return undefined;
  if (type !== "custom") return { type: type as ScopeType };
  const ids = Array.isArray(branches)
    ? [...new Set(branches.filter((b): b is string => typeof b === "string" && UUID_RE.test(b)))]
    : [];
  return { type: "custom", branches: ids.slice(0, MAX_CUSTOM_BRANCHES) };
}

/** A granted module's scope; "all" when unset or not granted. */
export function scopeOf(perms: Permissions, module: ModuleId): DataScope {
  return perms.find((e) => e.module === module)?.scope ?? { type: "all" };
}

/** Copy with a granted module's scope replaced. No-op for a module that isn't granted. */
export function setScope(perms: Permissions, module: ModuleId, scope: DataScope): Permissions {
  const idx = perms.findIndex((e) => e.module === module);
  if (idx < 0) return perms;
  const parsed = parseScope(scope, module);
  const { scope: _old, ...rest } = perms[idx];
  void _old;
  const next = perms.slice();
  next[idx] = parsed ? { ...rest, scope: parsed } : rest;
  return next;
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
    const { module, actions, scope } = item as { module?: unknown; actions?: unknown; scope?: unknown };
    if (!isModuleId(module) || seen.has(module)) continue;
    const list = normaliseActions(actions);
    if (list.length === 0) continue;
    seen.add(module);
    const parsedScope = parseScope(scope, module);
    out.push(parsedScope ? { module, actions: list, scope: parsedScope } : { module, actions: list });
  }
  return out;
}

const ROLE_DEFAULT: Record<AccountRole, readonly Action[]> = {
  owner: ACTIONS,
  admin: ACTIONS,
  agent: ["view", "read", "write", "edit", "export"],
  viewer: ["view", "read"],
};

/**
 * Modules only an owner gets without a designation (the super admin gets
 * everything anyway). Anyone else needs Access control to grant them.
 * Settings → Clinic: opening hours and closures change what every patient
 * can book, so it isn't handed to every admin and agent by default.
 */
const OWNER_DEFAULT_ONLY: readonly ModuleId[] = ["settings-clinic"];

/** Full list for a role with no designation, in default order. */
export function roleDefaultPermissions(role: AccountRole): Permissions {
  return MODULES.filter((module) => role === "owner" || !OWNER_DEFAULT_ONLY.includes(module)).map((module) => ({
    module,
    actions: [...ROLE_DEFAULT[role]].filter((a) => actionsFor(module).includes(a)),
  }));
}

export interface EffectiveInput {
  role: AccountRole | null;
  /** Parsed list of the member's designation, or null when none. */
  designation: Permissions | null;
  /** The account's per-role module deny-list (040). */
  moduleAccess: ModuleAccess;
  /** A super admin (049): every action everywhere; their designation only arranges their sidebar. */
  superAdmin?: boolean;
}

/**
 * What this member may actually do, in their sidebar order.
 *
 * - super admin: every action on every module, always. With a
 *   designation, its order comes first and only its `view` ticks show
 *   in the sidebar (hidden pages still open); without one, everything.
 * - designation set (owners included): exactly its list.
 * - owner without a designation: everything.
 * - otherwise: the role default, minus modules the 040 deny-list
 *   hides for that role.
 * - no role resolved yet: nothing (fail closed) — callers gate on
 *   `profileLoading` before trusting this.
 */
export function effectivePermissions({ role, designation, moduleAccess, superAdmin }: EffectiveInput): Permissions {
  if (superAdmin) {
    if (!designation) return roleDefaultPermissions("owner");
    const listed = designation.map((e) => e.module);
    const order = [...listed, ...MODULES.filter((m) => !listed.includes(m))];
    return order.map((module) => ({
      module,
      actions: ACTIONS.filter((a) => a !== "view" || can(designation, module, "view")),
    }));
  }
  if (!role) return [];
  if (designation) return designation;
  if (role === "owner") return roleDefaultPermissions("owner");
  return roleDefaultPermissions(role).filter((e) => canAccessModule(moduleAccess, role, e.module));
}

/**
 * The actions that mean something for a module. Settings sections have
 * nothing to delete or export, and Overview only shows things (its
 * tiles open other sections), so Access control leaves those cells out.
 */
export function actionsFor(module: ModuleId): readonly Action[] {
  if (module === "settings-overview") return ["view", "read"];
  // AI assistant: View/Read show the inbox's Human/Bot switch and the
  // settings; Edit flips the switch and changes the settings.
  if (module === "ai-assistant") return ["view", "read", "edit"];
  if (isSettingsModule(module)) return ["view", "read", "edit"];
  return ACTIONS;
}

/**
 * Copy with a whole module switched on (every action that applies to it)
 * or off. A module switched on for the first time goes at the end.
 */
export function setModuleAll(perms: Permissions, module: ModuleId, on: boolean): Permissions {
  const idx = perms.findIndex((e) => e.module === module);
  if (!on) return idx >= 0 ? perms.filter((_, i) => i !== idx) : perms;
  const scope = idx >= 0 ? perms[idx].scope : undefined;
  const entry: PermissionEntry = scope
    ? { module, actions: [...actionsFor(module)], scope }
    : { module, actions: [...actionsFor(module)] };
  if (idx < 0) return [...perms, entry];
  const next = perms.slice();
  next[idx] = entry;
  return next;
}

/** `setModuleAll` for several modules at once. */
export function setModulesAll(perms: Permissions, modules: readonly ModuleId[], on: boolean): Permissions {
  return modules.reduce((acc, m) => setModuleAll(acc, m, on), perms);
}

/** Whether every action that applies to `module` is ticked. */
export function hasAll(perms: Permissions, module: ModuleId): boolean {
  return actionsFor(module).every((a) => can(perms, module, a));
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
    next[idx] = { ...perms[idx], actions };
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
 * Reorder some granted modules among themselves (one sidebar group in the
 * editor) without touching anyone else's position: the group's modules swap
 * places only within the slots they already hold. `from` / `to` index into
 * `modules` as the group currently shows them.
 */
export function moveWithin(perms: Permissions, modules: ModuleId[], from: number, to: number): Permissions {
  const slots = modules.map((m) => perms.findIndex((e) => e.module === m));
  if (from === to || slots.some((i) => i < 0) || from < 0 || to < 0 || from >= slots.length || to >= slots.length) {
    return perms;
  }
  const entries = slots.map((i) => perms[i]);
  const [item] = entries.splice(from, 1);
  entries.splice(to, 0, item);
  const sorted = [...slots].sort((a, b) => a - b);
  const next = perms.slice();
  sorted.forEach((slot, k) => (next[slot] = entries[k]));
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
