import { describe, expect, it } from "vitest";
import { SECTION_META, railShows } from "./settings-sections";

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
});
