import { describe, expect, it } from "vitest";
import { BLANK_BRANDING, brandingCss, checkLogoFile, checkLogoUrl, isHexColor } from "./branding";

describe("brandingCss", () => {
  it("is empty when nothing is set (untouched install looks like Clinicoro)", () => {
    expect(brandingCss(BLANK_BRANDING)).toBe("");
  });

  it("main colour: light block with derived tokens, dark block with the accent only", () => {
    const css = brandingCss({ ...BLANK_BRANDING, theme_primary: "#112233" });
    const [light, dark] = css.split("html[data-mode=\"dark\"][data-brand]");
    expect(light).toContain('html[data-mode="light"][data-brand]');
    expect(light).toContain("--primary:#112233");
    expect(light).toContain("--primary-soft:color-mix(");
    expect(dark).toContain("--primary:#112233");
    expect(dark).not.toContain("--background");
  });

  it("page background only: light block, no dark block", () => {
    const css = brandingCss({ ...BLANK_BRANDING, theme_bg: "#FFF7ED" });
    expect(css).toContain("--background:#FFF7ED");
    expect(css).not.toContain('data-mode="dark"');
  });

  it("sidebar accent becomes the dark-mode accent when no main colour is set", () => {
    const css = brandingCss({ ...BLANK_BRANDING, sidebar_accent: "#0E9F9A" });
    expect(css).toContain("--sidebar-primary:#0E9F9A");
    expect(css.split('data-mode="dark"')[1]).toContain("--primary:#0E9F9A");
  });

  it("skips values that aren't #RRGGBB", () => {
    expect(brandingCss({ ...BLANK_BRANDING, theme_primary: "red" })).toBe("");
    expect(isHexColor("#12345G")).toBe(false);
    expect(isHexColor("#abcdef")).toBe(true);
  });
});

describe("logo checks", () => {
  it("refuses files over 512 KB and non-images", () => {
    expect(checkLogoFile({ size: 600 * 1024, type: "image/png" })).toMatch(/512 KB/);
    expect(checkLogoFile({ size: 10, type: "application/pdf" })).toMatch(/PNG/);
    expect(checkLogoFile({ size: 100 * 1024, type: "image/png" })).toBeNull();
    expect(checkLogoFile({ size: 100, type: "image/svg+xml" })).toBeNull();
  });

  it("links must be https", () => {
    expect(checkLogoUrl("http://x.example/logo.png")).toMatch(/https/);
    expect(checkLogoUrl("https://x.example/logo.png")).toBeNull();
    expect(checkLogoUrl(`https://x.example/${"a".repeat(2001)}`)).toMatch(/long/);
  });
});
