import { describe, expect, it } from "vitest";
import { orderSettingsSections, settingsItemOf, tidySettingsMenu } from "./settings-menu";

const GROUPS = { top: ["overview"], account: ["profile", "security"], workspace: ["branding", "clinic", "ai"] };

describe("settings menu", () => {
  it("orders a group by the saved list, keeping new sections at the end", () => {
    expect(orderSettingsSections(GROUPS.workspace, "workspace", { order: { workspace: ["ai", "ghost", "branding"] } })).toEqual([
      "ai",
      "branding",
      "clinic",
    ]);
    expect(orderSettingsSections(GROUPS.workspace, "workspace", undefined)).toEqual(GROUPS.workspace);
  });

  it("trusts only clean overrides and never hides Overview", () => {
    expect(settingsItemOf({ items: { ai: { label: "  Bot  ", icon: "bot", hidden: true } } }, "ai")).toEqual({
      label: "Bot",
      icon: "bot",
      hidden: true,
    });
    expect(settingsItemOf({ items: { overview: { hidden: true, icon: "nope" } } }, "overview")).toEqual({});
  });

  it("tidies to the smallest equivalent JSON", () => {
    expect(tidySettingsMenu({ items: { clinic: { label: " " }, ghost: { label: "x" } }, order: { workspace: GROUPS.workspace } }, GROUPS)).toBeUndefined();
    expect(
      tidySettingsMenu({ items: { clinic: { label: "Salon", hidden: false } }, order: { workspace: ["clinic"] } }, GROUPS),
    ).toEqual({ items: { clinic: { label: "Salon" } }, order: { workspace: ["clinic", "branding", "ai"] } });
    expect(tidySettingsMenu(null, GROUPS)).toBeUndefined();
  });
});
