import { describe, expect, it } from "vitest";
import { resolveMenu, visibleAfterOverrides, type MenuSection } from "./branding-menu";

const I = (href: string, module?: string) => ({ href, labelKey: href.slice(1), icon: "x", module });
const sections = (): MenuSection<ReturnType<typeof I>>[] => [
  { id: "top", items: [I("/dashboard"), I("/inbox", "inbox"), I("/notifications", "notifications")] },
  { id: "master", items: [I("/master/clinics", "clinics")] },
  { id: "controls", items: [I("/broadcasts", "broadcasts"), I("/automations", "automations")] },
  { id: "bottom", items: [I("/settings")] },
];

describe("resolveMenu", () => {
  it("applies labels and known icons, ignores unknown icons and hrefs", () => {
    const out = resolveMenu(sections(), {
      items: { "/inbox": { label: "Chats", icon: "messages-square" }, "/automations": { icon: "nope" }, "/gone": { label: "x" } },
    });
    const top = out.find((s) => s.id === "top")!.items;
    expect(top[1]).toMatchObject({ href: "/inbox", label: "Chats", iconKey: "messages-square" });
    const auto = out.find((s) => s.id === "controls")!.items.find((i) => i.href === "/automations")!;
    expect(auto.iconKey).toBeUndefined();
    expect(out.flatMap((s) => s.items).some((i) => i.href === "/gone")).toBe(false);
  });

  it("moves an item to the end of another group", () => {
    const out = resolveMenu(sections(), { items: { "/broadcasts": { group: "master" } } });
    expect(out.find((s) => s.id === "master")!.items.map((i) => i.href)).toEqual(["/master/clinics", "/broadcasts"]);
    expect(out.find((s) => s.id === "controls")!.items.map((i) => i.href)).toEqual(["/automations"]);
  });

  it("ignores moves into unknown or fixed sections", () => {
    const out = resolveMenu(sections(), { items: { "/broadcasts": { group: "bottom" }, "/inbox": { group: "nowhere" } } });
    expect(out.find((s) => s.id === "controls")!.items[0].href).toBe("/broadcasts");
    expect(out.find((s) => s.id === "top")!.items[1].href).toBe("/inbox");
  });

  it("hides items, but never the locked ones", () => {
    const out = resolveMenu(sections(), {
      items: { "/notifications": { hidden: true }, "/settings": { hidden: true }, "/dashboard": { hidden: true, group: "master" } },
    });
    const hrefs = out.flatMap((s) => s.items).map((i) => i.href);
    expect(hrefs).not.toContain("/notifications");
    expect(hrefs).toContain("/settings");
    expect(out.find((s) => s.id === "top")!.items[0].href).toBe("/dashboard"); // locked: not moved either
  });

  it("group label override", () => {
    const out = resolveMenu(sections(), { groups: { master: { label: "Clinic data" } } });
    expect(out.find((s) => s.id === "master")!.label).toBe("Clinic data");
  });
});

describe("visibleAfterOverrides", () => {
  it("permission filter still wins over renames and moves", () => {
    const out = resolveMenu(sections(), { items: { "/broadcasts": { label: "Blasts", group: "top" } } });
    const visible = visibleAfterOverrides(out.flatMap((s) => s.items), ["inbox"], false);
    expect(visible.map((i) => i.href)).toEqual(["/dashboard", "/inbox", "/settings"]);
  });
});
