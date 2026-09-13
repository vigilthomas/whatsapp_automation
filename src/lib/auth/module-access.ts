// ============================================================
// Per-role module access — pure, unit-testable, no I/O.
//
// Lets an owner/admin decide which app modules each *role* may
// open (Settings → Access control). The matrix lives on
// `accounts.module_access` (migration 040) as a JSONB deny-list:
//
//   { "viewer": ["broadcasts", "automations"], "agent": ["flows"] }
//
// A deny-list rather than an allow-list so that the default (`{}`)
// means "everything visible", and a module added in a future
// release shows up for everyone without a data migration.
//
// Scope — this is UI-level gating: it hides sidebar entries and
// redirects a denied route back to /dashboard. Data access is still
// governed by RLS + the role predicates in roles.ts; a viewer denied
// the Inbox module still can't *write* messages any more than they
// could before, and a denied agent who hits the REST API directly
// gets exactly what their role already allowed. Treat it as
// workspace tidiness, not a security boundary.
//
// `owner` is never restricted — someone has to be able to undo a
// lock-out — so the matrix only carries admin / agent / viewer.
// ============================================================

import type { AccountRole } from "./roles";

/** Every gateable module, in sidebar order. */
export const MODULES = [
  "inbox",
  "appointments",
  "notifications",
  "contacts",
  "clinics",
  "doctors",
  "clinic-admins",
  "templates",
  "quick-replies",
  "fields",
  "deals",
  "pipelines",
  "broadcasts",
  "automations",
  "flows",
  "agents",
] as const;

export type ModuleId = (typeof MODULES)[number];

/** Roles whose access can be restricted. Owner is deliberately absent. */
export const RESTRICTABLE_ROLES = ["admin", "agent", "viewer"] as const;
export type RestrictableRole = (typeof RESTRICTABLE_ROLES)[number];

/** Role → modules that role may NOT open. Missing role = no restrictions. */
export type ModuleAccess = Partial<Record<RestrictableRole, ModuleId[]>>;

/**
 * Route prefix → module. `/master/<section>` pages map onto the
 * section id; everything not listed here (dashboard, settings, …) is
 * ungated. Longest-prefix wins, so order doesn't matter.
 */
const ROUTE_MODULES: Record<string, ModuleId> = {
  "/inbox": "inbox",
  "/appointments": "appointments",
  "/notifications": "notifications",
  "/contacts": "contacts",
  "/master/clinics": "clinics",
  "/master/doctors": "doctors",
  "/master/clinic-admins": "clinic-admins",
  "/master/templates": "templates",
  "/master/quick-replies": "quick-replies",
  "/master/fields": "fields",
  "/master/deals": "deals",
  "/pipelines": "pipelines",
  "/broadcasts": "broadcasts",
  "/automations": "automations",
  "/flows": "flows",
  "/agents": "agents",
};

export function isModuleId(value: unknown): value is ModuleId {
  return (
    typeof value === "string" && (MODULES as readonly string[]).includes(value)
  );
}

export function isRestrictableRole(value: unknown): value is RestrictableRole {
  return (
    typeof value === "string" &&
    (RESTRICTABLE_ROLES as readonly string[]).includes(value)
  );
}

/**
 * Coerce whatever came out of the JSONB column into a well-formed
 * matrix. Unknown roles and module ids are dropped rather than
 * rejected, so a row written by a newer build (with a module this
 * build doesn't know) still loads — the unknown entry is simply
 * ignored until the code catches up. Anything that isn't an object
 * (null, a string, an array) resolves to "no restrictions".
 */
export function parseModuleAccess(raw: unknown): ModuleAccess {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ModuleAccess = {};
  for (const [role, denied] of Object.entries(raw as Record<string, unknown>)) {
    if (!isRestrictableRole(role) || !Array.isArray(denied)) continue;
    const ids = denied.filter(isModuleId);
    if (ids.length > 0) out[role] = Array.from(new Set(ids));
  }
  return out;
}

/** True iff `role` may open `module`. Owner (and a null role) always may. */
export function canAccessModule(
  access: ModuleAccess,
  role: AccountRole | null,
  module: ModuleId,
): boolean {
  if (!role || !isRestrictableRole(role)) return true;
  return !(access[role] ?? []).includes(module);
}

/**
 * The module a pathname belongs to, or null when the route is not
 * gated (dashboard, settings, the join flow, …).
 */
export function moduleForPath(pathname: string): ModuleId | null {
  let best: { prefix: string; module: ModuleId } | null = null;
  for (const [prefix, module] of Object.entries(ROUTE_MODULES)) {
    const matches = pathname === prefix || pathname.startsWith(prefix + "/");
    if (matches && (!best || prefix.length > best.prefix.length)) {
      best = { prefix, module };
    }
  }
  return best?.module ?? null;
}

/**
 * Return a copy of `access` with `module` toggled for `role`. Empty
 * deny-lists are dropped so the stored JSON stays minimal.
 */
export function toggleModuleAccess(
  access: ModuleAccess,
  role: RestrictableRole,
  module: ModuleId,
  allowed: boolean,
): ModuleAccess {
  const current = new Set(access[role] ?? []);
  if (allowed) current.delete(module);
  else current.add(module);
  const next: ModuleAccess = { ...access };
  if (current.size === 0) delete next[role];
  else next[role] = MODULES.filter((m) => current.has(m));
  return next;
}
