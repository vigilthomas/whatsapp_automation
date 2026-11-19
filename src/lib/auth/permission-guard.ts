import type { SupabaseClient } from "@supabase/supabase-js";
import { ForbiddenError, getCurrentAccount, type AccountContext } from "./account";
import { parseModuleAccess } from "./module-access";
import type { ModuleId } from "./module-access";
import {
  can,
  effectivePermissions,
  parsePermissions,
  type Action,
  type Permissions,
} from "./permissions";

// ============================================================
// Server-side permission check — the boundary the UI gating is a
// preview of. Every API route that reads or mutates clinic data
// calls `requirePermission(module, action)` before touching the
// database; a route that only calls `requireRole` is relying on the
// coarse role tier and will not honour a designation's matrix.
//
// Cost: one extra round trip (profile.designation_id +
// designation.permissions + account.module_access, all RLS-readable
// by the caller). Cheap relative to the work the route then does.
// ============================================================

export interface PermissionContext extends AccountContext {
  permissions: Permissions;
  /** profiles.branch_id — what an "Assigned branch" data scope narrows to. */
  branchId: string | null;
}

/** Load the caller's effective matrix. Exported for routes that need
 *  several checks off one lookup. */
export async function loadPermissions(ctx: AccountContext): Promise<Permissions> {
  return (await loadPermissionState(ctx)).permissions;
}

async function loadPermissionState(ctx: AccountContext): Promise<{ permissions: Permissions; branchId: string | null }> {
  const { designation, moduleAccess, branchId } = await loadInputs(ctx.supabase, ctx.userId, ctx.accountId);
  const permissions = effectivePermissions({ role: ctx.role, designation, moduleAccess, superAdmin: ctx.superAdmin });
  return { permissions, branchId };
}

async function loadInputs(supabase: SupabaseClient, userId: string, accountId: string) {
  const [profileRes, accountRes, branchRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("designation_id, designation:designations(permissions)")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("accounts").select("module_access").eq("id", accountId).maybeSingle(),
    // Separate so a database without 054 (no branch_id) still loads the matrix.
    supabase.from("profiles").select("branch_id").eq("user_id", userId).maybeSingle(),
  ]);
  // A missing column (043 not applied yet) surfaces as an error here;
  // treat it as "no designation" so older databases keep working on the
  // role default rather than 500ing every route.
  const raw = profileRes.error ? null : (profileRes.data as unknown as {
    designation_id: string | null;
    designation: { permissions: unknown } | { permissions: unknown }[] | null;
  } | null);
  const d = raw?.designation;
  const permsRaw = Array.isArray(d) ? d[0]?.permissions : d?.permissions;
  const designation = raw?.designation_id && permsRaw !== undefined ? parsePermissions(permsRaw) : null;
  const moduleAccess = accountRes.error ? {} : parseModuleAccess(accountRes.data?.module_access);
  const branchId = branchRes.error ? null : ((branchRes.data as { branch_id: string | null } | null)?.branch_id ?? null);
  return { designation, moduleAccess, branchId };
}

/**
 * Resolve the caller and assert `action` on `module`. Throws
 * `ForbiddenError` (→ 403 via toErrorResponse) when denied.
 */
export async function requirePermission(module: ModuleId, action: Action): Promise<PermissionContext> {
  const ctx = await getCurrentAccount();
  const { permissions, branchId } = await loadPermissionState(ctx);
  if (!can(permissions, module, action)) {
    throw new ForbiddenError(`You don't have '${action}' permission on ${module}`);
  }
  return { ...ctx, permissions, branchId };
}
