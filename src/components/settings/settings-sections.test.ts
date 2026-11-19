import { describe, expect, it } from "vitest";
import { SECTION_META, allowedSection, railShows } from "./settings-sections";

describe("railShows", () => {
  it("Branding and Sidebar menu need the clinic's own admin, not any account owner", () => {
    const strangerOwner = { canManageMembers: true, canEditBranding: false };
    const clinicAdmin = { canManageMembers: true, canEditBranding: true };
    expect(railShows(SECTION_META.branding, strangerOwner)).toBe(false);
    expect(railShows(SECTION_META.menu, strangerOwner)).toBe(false);
    expect(railShows(SECTION_META.branding, clinicAdmin)).toBe(true);
    expect(railShows(SECTION_META.members, strangerOwner)).toBe(true);
    expect(railShows(SECTION_META.profile, { canManageMembers: false, canEditBranding: false })).toBe(true);
  });

  it("hides a Settings section its designation has no view tick for", () => {
    const who = { canManageMembers: false, canEditBranding: false, canView: (m: string) => m !== "settings-security" };
    expect(railShows(SECTION_META.security, who)).toBe(false);
    expect(railShows(SECTION_META.profile, who)).toBe(true);
  });
});

describe("allowedSection", () => {
  it("opens the asked section when it may be read", () => {
    expect(allowedSection("appearance", () => true)).toBe("appearance");
  });
  it("falls back to the first readable section, or null when none", () => {
    expect(allowedSection("overview", (m) => m === "settings-appearance")).toBe("appearance");
    expect(allowedSection("profile", () => false)).toBeNull();
  });
  it("lets moved sections through so they can forward", () => {
    expect(allowedSection("members", () => false)).toBe("members");
  });
});
