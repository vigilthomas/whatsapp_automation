import { describe, expect, it } from "vitest";
import type { ModuleId } from "./module-access";
import {
  actionsFor,
  hasAll,
  setModuleAll,
  can,
  editorRows,
  effectivePermissions,
  movePermission,
  parsePermissions,
  togglePermission,
  visibleModules,
  moveWithin,
  parseScope,
  scopeOf,
  setScope,
  scopesFor,
  type Permissions,
  type Action,
} from "./permissions";

describe("parsePermissions", () => {
  it("keeps order, drops junk and duplicates, requires read", () => {
    expect(parsePermissions(null)).toEqual([]);
    expect(parsePermissions({ inbox: ["read"] })).toEqual([]);
    expect(
      parsePermissions([
        { module: "contacts", actions: ["export", "read", "fly", "view"] },
        { module: "bogus", actions: ["read"] },
        { module: "inbox", actions: ["write"] }, // no read → dropped
        { module: "contacts", actions: ["read"] }, // duplicate → dropped
        { module: "flows", actions: ["read"] },
      ]),
    ).toEqual([
      { module: "contacts", actions: ["view", "read", "export"] },
      { module: "flows", actions: ["read"] },
    ]);
  });
});

describe("effectivePermissions / can / visibleModules", () => {
  it("an owner follows their designation; with none, everything", () => {
    const p = effectivePermissions({
      role: "owner",
      designation: [{ module: "inbox", actions: ["read"] }],
      moduleAccess: {},
    });
    expect(can(p, "inbox", "read")).toBe(true);
    expect(can(p, "broadcasts", "read")).toBe(false);
    const free = effectivePermissions({ role: "owner", designation: null, moduleAccess: { admin: ["flows"] } });
    expect(can(free, "broadcasts", "delete")).toBe(true);
  });

  it("a super admin can do everything; a designation only arranges their sidebar", () => {
    const none = effectivePermissions({ role: "viewer", designation: null, moduleAccess: { viewer: ["flows"] }, superAdmin: true });
    expect(can(none, "flows", "delete")).toBe(true);
    const p = effectivePermissions({
      role: "admin",
      designation: [
        { module: "appointments", actions: ["view", "read"] },
        { module: "inbox", actions: ["read"] },
      ],
      moduleAccess: {},
      superAdmin: true,
    });
    expect(can(p, "broadcasts", "delete")).toBe(true);
    expect(can(p, "inbox", "write")).toBe(true);
    expect(p.slice(0, 2).map((e) => e.module)).toEqual(["appointments", "inbox"]);
    expect(visibleModules(p)).toEqual(["appointments"]);
  });

  it("no role and not a super admin → nothing", () => {
    expect(effectivePermissions({ role: null, designation: null, moduleAccess: {} })).toEqual([]);
  });

  it("a designation replaces the role default and sets the order", () => {
    const p = effectivePermissions({
      role: "admin",
      designation: [
        { module: "appointments", actions: ["view", "read", "write"] },
        { module: "contacts", actions: ["read"] },
      ],
      moduleAccess: {},
    });
    expect(can(p, "appointments", "write")).toBe(true);
    expect(can(p, "appointments", "delete")).toBe(false);
    expect(can(p, "contacts", "read")).toBe(true);
    expect(can(p, "inbox", "read")).toBe(false);
    // contacts is readable but hidden from the sidebar (no view)
    expect(visibleModules(p)).toEqual(["appointments"]);
  });

  it("no designation → role default minus the deny-list", () => {
    const agent = effectivePermissions({ role: "agent", designation: null, moduleAccess: { agent: ["flows"] } });
    expect(can(agent, "contacts", "write")).toBe(true);
    expect(can(agent, "contacts", "delete")).toBe(false);
    expect(can(agent, "flows", "read")).toBe(false);
    const viewer = effectivePermissions({ role: "viewer", designation: null, moduleAccess: {} });
    expect(can(viewer, "contacts", "view")).toBe(true);
    expect(can(viewer, "contacts", "write")).toBe(false);
  });

  it("fails closed with no role", () => {
    expect(effectivePermissions({ role: null, designation: null, moduleAccess: {} })).toEqual([]);
  });
});

describe("togglePermission", () => {
  it("implies read, appends new modules, prunes on read removal, never mutates", () => {
    const a = togglePermission([], "inbox", "view", true);
    expect(a).toEqual([{ module: "inbox", actions: ["view", "read"] }]);
    const b = togglePermission(a, "contacts", "write", true);
    expect(b.map((e) => e.module)).toEqual(["inbox", "contacts"]);
    expect(b[1].actions).toEqual(["read", "write"]);
    expect(a).toHaveLength(1);
    expect(togglePermission(b, "inbox", "read", false)).toEqual([{ module: "contacts", actions: ["read", "write"] }]);
  });
});

describe("movePermission / editorRows", () => {
  const p = [
    { module: "inbox" as const, actions: ["read" as const] },
    { module: "contacts" as const, actions: ["read" as const] },
    { module: "flows" as const, actions: ["read" as const] },
  ];
  it("reorders and ignores out-of-range", () => {
    expect(movePermission(p, 2, 0).map((e) => e.module)).toEqual(["flows", "inbox", "contacts"]);
    expect(movePermission(p, 0, 5)).toBe(p);
  });
  it("editor lists granted first in order, then the rest", () => {
    const rows = editorRows([p[2], p[0]]);
    expect(rows.slice(0, 2)).toEqual(["flows", "inbox"]);
    expect(rows).toContain("contacts");
    expect(new Set(rows).size).toBe(rows.length);
  });
});

describe("moveWithin", () => {
  const P = (...mods: ModuleId[]): Permissions => mods.map((module) => ({ module, actions: ["view", "read"] }));
  const order = (p: Permissions) => p.map((e) => e.module);

  it("reorders a group's modules inside the slots they hold, leaving others in place", () => {
    const perms = P("inbox", "branches", "pipelines", "designations", "broadcasts", "services");
    // Master group as shown: branches, roles, services. Move services to the top.
    const next = moveWithin(perms, ["branches", "designations", "services"], 2, 0);
    expect(order(next)).toEqual(["inbox", "services", "pipelines", "branches", "broadcasts", "designations"]);
  });

  it("ignores bad indexes and modules that aren't granted", () => {
    const perms = P("inbox", "branches");
    expect(moveWithin(perms, ["branches"], 0, 3)).toBe(perms);
    expect(moveWithin(perms, ["branches", "designations"], 0, 1)).toBe(perms);
  });
});

describe("actionsFor", () => {
  it("Settings sections only take the actions that mean something", () => {
    expect(actionsFor("settings-overview")).toEqual(["view", "read"]);
    expect(actionsFor("settings-profile")).toEqual(["view", "read", "edit"]);
    expect(actionsFor("inbox")).toEqual(["view", "read", "write", "edit", "delete", "export"]);
  });
});

describe("setModuleAll / hasAll", () => {
  it("ticks every applicable action, keeps position, and clears", () => {
    const perms = [
      { module: "inbox" as const, actions: ["view", "read"] as Action[] },
      { module: "contacts" as const, actions: ["read"] as Action[] },
    ];
    const on = setModuleAll(perms, "inbox", true);
    expect(on[0]).toEqual({ module: "inbox", actions: ["view", "read", "write", "edit", "delete", "export"] });
    expect(hasAll(on, "inbox")).toBe(true);
    expect(hasAll(on, "contacts")).toBe(false);
    expect(setModuleAll(perms, "inbox", false).map((e) => e.module)).toEqual(["contacts"]);
    expect(setModuleAll([], "settings-profile", true)).toEqual([
      { module: "settings-profile", actions: ["view", "read", "edit"] },
    ]);
  });
});

describe("data scope", () => {
  const B1 = "11111111-1111-4111-8111-111111111111";
  const B2 = "22222222-2222-4222-8222-222222222222";

  it("parsePermissions keeps a valid scope and drops 'all', junk and unscoped modules", () => {
    const parsed = parsePermissions([
      { module: "appointments", actions: ["read"], scope: { type: "own" } },
      { module: "leaves", actions: ["read"], scope: { type: "all" } },
      { module: "inbox", actions: ["read"], scope: { type: "branch" } },
      { module: "contacts", actions: ["read"], scope: { type: "nonsense" } },
    ]);
    expect(parsed).toEqual([
      { module: "appointments", actions: ["read"], scope: { type: "own" } },
      { module: "leaves", actions: ["read"] },
      { module: "inbox", actions: ["read"] },
      { module: "contacts", actions: ["read"] },
    ]);
  });

  it("custom keeps only unique uuid branch ids", () => {
    expect(parseScope({ type: "custom", branches: [B1, "x", B1, 7, B2] }, "appointments")).toEqual({
      type: "custom",
      branches: [B1, B2],
    });
    expect(parseScope({ type: "custom" }, "leaves")).toEqual({ type: "custom", branches: [] });
    expect(scopesFor("inbox")).toEqual([]);
  });

  it("toggling cells and the whole row keeps the scope", () => {
    const perms: Permissions = [{ module: "appointments", actions: ["view", "read"], scope: { type: "branch" } }];
    expect(togglePermission(perms, "appointments", "write", true)[0].scope).toEqual({ type: "branch" });
    expect(setModuleAll(perms, "appointments", true)[0].scope).toEqual({ type: "branch" });
  });

  it("setScope replaces, 'all' removes the key, ungranted modules are untouched", () => {
    const perms: Permissions = [{ module: "appointments", actions: ["read"] }];
    const custom = setScope(perms, "appointments", { type: "custom", branches: [B1] });
    expect(scopeOf(custom, "appointments")).toEqual({ type: "custom", branches: [B1] });
    expect(setScope(custom, "appointments", { type: "all" })).toEqual(perms);
    expect(setScope(perms, "leaves", { type: "own" })).toBe(perms);
    expect(scopeOf(perms, "leaves")).toEqual({ type: "all" });
  });

  it("a super admin's permissions carry no scope", () => {
    const designation: Permissions = [{ module: "appointments", actions: ["view", "read"], scope: { type: "own" } }];
    const eff = effectivePermissions({ role: "agent", designation, moduleAccess: {}, superAdmin: true });
    expect(eff.every((e) => e.scope === undefined)).toBe(true);
  });
});
