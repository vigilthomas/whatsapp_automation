import { describe, expect, it } from "vitest";
import {
  CARDS,
  COLS,
  deriveLayout,
  hideCard,
  normalizeDashboard,
  parseDashboardSettings,
  showCard,
  templateLayout,
  withPositions,
} from "./cards";
import { BRAND_ICON_KEYS } from "@/lib/branding-icon-keys";

describe("templates", () => {
  it("every template card exists and every card icon is a known key", () => {
    for (const t of ["classic", "modern"] as const) {
      const l = templateLayout(t);
      expect(l.cards.length).toBeGreaterThan(5);
      for (const bp of Object.keys(COLS) as (keyof typeof COLS)[]) {
        expect(l.layouts[bp]!.every((it) => it.x + it.w <= COLS[bp])).toBe(true);
      }
    }
    for (const c of CARDS) expect(BRAND_ICON_KEYS).toContain(c.icon);
  });

  it("stacks full width on a phone, keeps half-width pairs on a tablet", () => {
    const lg = templateLayout("classic").layouts.lg!;
    expect(deriveLayout(lg, 2).every((it) => it.w === 2 && it.x === 0)).toBe(true);
    const sm = deriveLayout(lg, 6);
    const today = sm.find((it) => it.i === "today-bookings")!;
    const staff = sm.find((it) => it.i === "staff-availability")!;
    expect([today.w, staff.w]).toEqual([3, 3]);
    expect(today.y).toBe(staff.y);
    // Four quarter-width tiles stay on one row of a 10-column grid.
    const md = deriveLayout(lg, 10).filter((it) => it.i.startsWith("stat-"));
    expect(new Set(md.map((it) => it.y)).size).toBe(1);
    expect(md.reduce((a, it) => a + it.w, 0)).toBe(10);
  });
});

describe("normalizeDashboard", () => {
  it("falls back to the template for junk", () => {
    expect(normalizeDashboard(null, "modern")).toEqual(templateLayout("modern"));
    expect(normalizeDashboard("x", "classic").template).toBe("classic");
  });

  it("drops unknown cards, clamps sizes, and places cards with no position", () => {
    const l = normalizeDashboard(
      {
        template: "classic",
        cards: ["activity", "ghost", "pipeline", "activity"],
        layouts: { lg: [{ i: "activity", x: 20, y: 0, w: 99, h: 1 }, { i: "ghost", x: 0, y: 0, w: 1, h: 1 }] },
      },
      "modern",
    );
    expect(l.cards).toEqual(["activity", "pipeline"]);
    const act = l.layouts.lg!.find((it) => it.i === "activity")!;
    expect(act).toEqual({ i: "activity", x: 0, y: 0, w: 12, h: 5 });
    expect(l.layouts.lg!.find((it) => it.i === "pipeline")!.y).toBe(5);
    expect(l.layouts.xxs!.every((it) => it.w === 2)).toBe(true);
  });
});

describe("hide / show / move", () => {
  it("round-trips a card through hide and show", () => {
    const base = templateLayout("modern");
    const hidden = hideCard(base, "pipeline");
    expect(hidden.cards).not.toContain("pipeline");
    expect(hidden.layouts.md!.some((it) => it.i === "pipeline")).toBe(false);
    const back = showCard(hidden, "pipeline");
    expect(back.cards).toContain("pipeline");
    expect(back.layouts.lg!.some((it) => it.i === "pipeline")).toBe(true);
    expect(showCard(back, "nope")).toBe(back);
  });

  it("keeps positions from a drag for visible cards only", () => {
    const base = templateLayout("modern");
    const moved = withPositions(base, { lg: [{ i: "activity", x: 0, y: 0, w: 12, h: 8 }, { i: "stat-pending", x: 0, y: 0, w: 3, h: 4 }] });
    expect(moved.layouts.lg).toEqual([{ i: "activity", x: 0, y: 0, w: 12, h: 8 }]);
    expect(moved.layouts.md).toEqual(base.layouts.md);
  });
});

describe("parseDashboardSettings", () => {
  it("keeps only known cards, real icons and trimmed titles", () => {
    expect(
      parseDashboardSettings(
        { template: "modern", cards: { activity: { title: "  Latest  ", icon: "zap" }, pipeline: { icon: "nope" }, ghost: { title: "x" } } },
        BRAND_ICON_KEYS,
      ),
    ).toEqual({ template: "modern", cards: { activity: { title: "Latest", icon: "zap" } } });
  });
});
