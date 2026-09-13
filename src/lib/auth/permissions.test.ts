import { describe, expect, it } from "vitest";
import {
  can,
  editorRows,
  effectivePermissions,
  movePermission,
  parsePermissions,
  togglePermission,
  visibleModules,
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
  it("owner gets everything even with a restrictive designation", () => {
    const p = effectivePermissions({
      role: "owner",
      designation: [{ module: "inbox", actions: ["read"] }],
      moduleAccess: {},
    });
    expect(can(p, "broadcasts", "delete")).toBe(true);
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
