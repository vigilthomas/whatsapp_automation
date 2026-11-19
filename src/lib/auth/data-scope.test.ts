import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveScope, rowInScope, scopeFilter, type ScopeContext } from "./data-scope";
import type { Permissions } from "./permissions";

const B1 = "11111111-1111-4111-8111-111111111111";
const B2 = "22222222-2222-4222-8222-222222222222";
const me = { userId: "u-me", branchId: B1 };

/** Minimal chainable stub: every builder call returns itself, awaiting yields `rows`. */
function fakeDb(rows: unknown[]) {
  const calls: Array<[string, unknown[]]> = [];
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in"]) {
    builder[m] = vi.fn((...args: unknown[]) => {
      calls.push([m, args]);
      return builder;
    });
  }
  builder.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
  const db = {
    from: vi.fn((table: string) => {
      calls.push(["from", [table]]);
      return builder;
    }),
  } as unknown as SupabaseClient;
  return { db, calls };
}

function ctx(permissions: Permissions, branchId: string | null = B1): ScopeContext {
  return { accountId: "acc", userId: "u-me", branchId, permissions };
}

describe("resolveScope", () => {
  it("maps each scope type", () => {
    expect(resolveScope({ type: "all" }, me)).toEqual({ kind: "all" });
    expect(resolveScope({ type: "branch" }, me)).toEqual({ kind: "branches", ids: [B1] });
    expect(resolveScope({ type: "branch" }, { ...me, branchId: null })).toEqual({ kind: "branches", ids: [] });
    expect(resolveScope({ type: "custom", branches: [B2] }, me)).toEqual({ kind: "branches", ids: [B2] });
    expect(resolveScope({ type: "own" }, me)).toEqual({ kind: "own", userId: "u-me" });
  });
});

describe("scopeFilter", () => {
  it("no scope → no filter, and no lookup", async () => {
    const { db } = fakeDb([]);
    expect(await scopeFilter(db, "appointments", ctx([{ module: "appointments", actions: ["read"] }]))).toBeNull();
    expect(db.from).not.toHaveBeenCalled();
  });

  it("appointments by branch filter on branch_id", async () => {
    const { db } = fakeDb([]);
    const perms: Permissions = [{ module: "appointments", actions: ["read"], scope: { type: "custom", branches: [B1, B2] } }];
    expect(await scopeFilter(db, "appointments", ctx(perms))).toEqual({ column: "branch_id", values: [B1, B2] });
  });

  it("own appointments look up the caller's doctor rows in the account", async () => {
    const { db, calls } = fakeDb([{ id: "d1" }]);
    const perms: Permissions = [{ module: "appointments", actions: ["read"], scope: { type: "own" } }];
    expect(await scopeFilter(db, "appointments", ctx(perms))).toEqual({ column: "doctor_id", values: ["d1"] });
    expect(calls).toContainEqual(["from", ["doctors"]]);
    expect(calls).toContainEqual(["eq", ["account_id", "acc"]]);
    expect(calls).toContainEqual(["eq", ["user_id", "u-me"]]);
  });

  it("leaves by branch resolve to the branch's members; none picked → nothing", async () => {
    const { db, calls } = fakeDb([{ user_id: "u1" }, { user_id: "u2" }]);
    const perms: Permissions = [{ module: "leaves", actions: ["read"], scope: { type: "branch" } }];
    expect(await scopeFilter(db, "user_leaves", ctx(perms))).toEqual({ column: "user_id", values: ["u1", "u2"] });
    expect(calls).toContainEqual(["in", ["branch_id", [B1]]]);

    const empty = fakeDb([]);
    expect(await scopeFilter(empty.db, "user_leaves", ctx(perms, null))).toEqual({ column: "user_id", values: [] });
    expect(empty.db.from).not.toHaveBeenCalled();
  });

  it("own leaves are the caller's", async () => {
    const { db } = fakeDb([]);
    const perms: Permissions = [{ module: "leaves", actions: ["read"], scope: { type: "own" } }];
    expect(await scopeFilter(db, "user_leaves", ctx(perms))).toEqual({ column: "user_id", values: ["u-me"] });
  });
});

describe("rowInScope", () => {
  it("checks the filter column", () => {
    expect(rowInScope(null, {})).toBe(true);
    expect(rowInScope({ column: "branch_id", values: [B1] }, { branch_id: B1 })).toBe(true);
    expect(rowInScope({ column: "branch_id", values: [B1] }, { branch_id: B2 })).toBe(false);
    expect(rowInScope({ column: "branch_id", values: [B1] }, { branch_id: null })).toBe(false);
  });
});
