import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModuleId } from "./module-access";
import { scopeOf, type DataScope, type Permissions } from "./permissions";

// ============================================================
// Data scope enforcement — turns a role's per-module scope (see
// `DataScope` in permissions.ts) into a row filter for the tables
// that carry a branch.
//
//   appointments  branch → branch_id;  own → doctor_id ∈ my doctor rows
//   user_leaves   branch → user_id ∈ members of those branches;
//                 own    → user_id = me
//
// The routes behind Appointments and Master → Leaves read and write
// through these helpers. Writes go through the service-role client,
// so this is the only check on them; reads also go through RLS, and
// migration 058 adds the same rule there (`data_scope_allows`) so
// browser-side reads — dashboard tiles, the inbox contact panel —
// can't see past it either. Keep the two in step.
//
// Fail closed: "assigned branch" with no branch set on the member,
// or "custom" with nothing picked, matches no rows at all.
// ============================================================

export type ResolvedScope =
  | { kind: "all" }
  | { kind: "branches"; ids: string[] }
  | { kind: "own"; userId: string };

export interface ScopeSubject {
  userId: string;
  /** profiles.branch_id — Master → Users. */
  branchId: string | null;
}

export function resolveScope(scope: DataScope, me: ScopeSubject): ResolvedScope {
  switch (scope.type) {
    case "branch":
      return { kind: "branches", ids: me.branchId ? [me.branchId] : [] };
    case "custom":
      return { kind: "branches", ids: scope.branches ?? [] };
    case "own":
      return { kind: "own", userId: me.userId };
    default:
      return { kind: "all" };
  }
}

export type ScopedTable = "appointments" | "user_leaves";

const TABLE_MODULE: Record<ScopedTable, ModuleId> = {
  appointments: "appointments",
  user_leaves: "leaves",
};

export function isScopedTable(table: string): table is ScopedTable {
  return table in TABLE_MODULE;
}

/** `null` = no restriction; otherwise rows must have `column` ∈ `values` (empty → none). */
export type ScopeFilter = { column: string; values: string[] } | null;

export interface ScopeContext extends ScopeSubject {
  accountId: string;
  permissions: Permissions;
}

/**
 * The filter for `table` given the caller's permissions. `db` is used
 * for the lookups (doctor rows, branch members) and should be the
 * service-role client: it is always narrowed by `accountId` here.
 */
export async function scopeFilter(db: SupabaseClient, table: ScopedTable, ctx: ScopeContext): Promise<ScopeFilter> {
  const resolved = resolveScope(scopeOf(ctx.permissions, TABLE_MODULE[table]), ctx);
  if (resolved.kind === "all") return null;

  if (table === "appointments") {
    if (resolved.kind === "branches") return { column: "branch_id", values: resolved.ids };
    const { data, error } = await db
      .from("doctors")
      .select("id")
      .eq("account_id", ctx.accountId)
      .eq("user_id", resolved.userId);
    if (error) throw error;
    return { column: "doctor_id", values: (data ?? []).map((d: { id: string }) => d.id) };
  }

  // user_leaves
  if (resolved.kind === "own") return { column: "user_id", values: [resolved.userId] };
  if (resolved.ids.length === 0) return { column: "user_id", values: [] };
  const { data, error } = await db
    .from("profiles")
    .select("user_id")
    .eq("account_id", ctx.accountId)
    .in("branch_id", resolved.ids);
  if (error) throw error;
  return { column: "user_id", values: (data ?? []).map((p: { user_id: string }) => p.user_id) };
}

/** Whether a row (or a row-to-be) falls inside the filter. */
export function rowInScope(filter: ScopeFilter, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  const v = row[filter.column];
  return typeof v === "string" && filter.values.includes(v);
}

export const OUT_OF_SCOPE_MESSAGE = "That record is outside the data you have access to";
