import { describe, expect, it } from "vitest";
import { layoutDbKey } from "./user-layouts";

describe("layoutDbKey", () => {
  it("builds keys the user_layouts CHECK accepts", () => {
    expect(layoutDbKey("dashboard", "current")).toBe("dashboard");
    expect(layoutDbKey("dashboard", "preset")).toBe("dashboard:preset");
    expect(layoutDbKey("table:Master.Branches", "preset")).toBe("table:master.branches:preset");
    expect(layoutDbKey("table:a b/c", "current")).toBe("table:a-b-c");
    for (const k of ["dashboard", "table:master.branches:preset", layoutDbKey("x".repeat(200), "preset")]) {
      expect(k).toMatch(/^[a-z0-9][a-z0-9:._-]{0,79}$/);
    }
  });
});
