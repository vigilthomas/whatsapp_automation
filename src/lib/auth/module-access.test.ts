import { describe, expect, it } from "vitest";
import {
  canAccessModule,
  moduleForPath,
  parseModuleAccess,
  toggleModuleAccess,
} from "./module-access";

describe("parseModuleAccess", () => {
  it("treats null / non-objects as no restrictions", () => {
    expect(parseModuleAccess(null)).toEqual({});
    expect(parseModuleAccess("nope")).toEqual({});
    expect(parseModuleAccess(["viewer"])).toEqual({});
  });

  it("drops unknown roles and module ids, dedupes the rest", () => {
    expect(
      parseModuleAccess({
        owner: ["inbox"],
        viewer: ["inbox", "inbox", "not-a-module"],
        agent: "flows",
      }),
    ).toEqual({ viewer: ["inbox"] });
  });

  it("drops roles whose list ends up empty", () => {
    expect(parseModuleAccess({ viewer: ["bogus"] })).toEqual({});
  });
});

describe("canAccessModule", () => {
  const access = parseModuleAccess({ viewer: ["broadcasts"], agent: ["flows"] });

  it("never restricts owner or an unresolved role", () => {
    expect(canAccessModule(access, "owner", "broadcasts")).toBe(true);
    expect(canAccessModule(access, null, "broadcasts")).toBe(true);
  });

  it("denies exactly the listed modules for the listed role", () => {
    expect(canAccessModule(access, "viewer", "broadcasts")).toBe(false);
    expect(canAccessModule(access, "viewer", "flows")).toBe(true);
    expect(canAccessModule(access, "agent", "flows")).toBe(false);
    expect(canAccessModule(access, "admin", "flows")).toBe(true);
  });
});

describe("moduleForPath", () => {
  it("maps gated routes, including nested pages, to their module", () => {
    expect(moduleForPath("/inbox")).toBe("inbox");
    expect(moduleForPath("/automations/abc/edit")).toBe("automations");
    expect(moduleForPath("/master/quick-replies")).toBe("quick-replies");
  });

  it("returns null for ungated routes and near-miss prefixes", () => {
    expect(moduleForPath("/dashboard")).toBeNull();
    expect(moduleForPath("/settings")).toBeNull();
    expect(moduleForPath("/inboxes")).toBeNull();
    expect(moduleForPath("/master")).toBeNull();
  });
});

describe("toggleModuleAccess", () => {
  it("adds and removes a module, pruning empty roles", () => {
    const denied = toggleModuleAccess({}, "viewer", "inbox", false);
    expect(denied).toEqual({ viewer: ["inbox"] });
    expect(toggleModuleAccess(denied, "viewer", "inbox", true)).toEqual({});
  });

  it("keeps the deny-list in canonical module order", () => {
    const a = toggleModuleAccess({}, "agent", "flows", false);
    const b = toggleModuleAccess(a, "agent", "inbox", false);
    expect(b.agent).toEqual(["inbox", "flows"]);
  });

  it("does not mutate the input", () => {
    const input = { viewer: ["inbox" as const] };
    toggleModuleAccess(input, "viewer", "flows", false);
    expect(input).toEqual({ viewer: ["inbox"] });
  });
});
