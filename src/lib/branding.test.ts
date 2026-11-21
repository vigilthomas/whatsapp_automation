import { describe, expect, it } from "vitest";
import { BLANK_BRANDING, DEFAULT_COLORS, buttonText, BRANDING_CACHE_KEY, BRAND_STYLE_ID, DARK_BG, brandBootJs, brandingCss, checkLogoFile, checkLogoUrl, contrast, inkOn, isHexColor, retitle, sniffImage, logoShapeClass, lockscreenOf } from "./branding";

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
    expect(dark).toContain("--primary:#"); // lightened for the navy page, see "dark mode lightens"
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

  it("sidebar colours also reach the menu rows inside the sidebar (light mode only)", () => {
    const css = brandingCss({ ...BLANK_BRANDING, sidebar_bg: "#0B3B2E", sidebar_text: "#F0FDF4", sidebar_accent: "#16A34A" });
    const scoped = css.split('aside[aria-label="Primary"]')[1] ?? "";
    expect(css).toContain('html[data-mode="light"][data-brand] aside[aria-label="Primary"]');
    expect(scoped).toContain("--muted-foreground:#F0FDF4");
    expect(scoped).toContain("--navy:#F0FDF4");
    expect(scoped).toContain("--teal:#16A34A");
    expect(scoped).toContain("--mint:color-mix(in oklab, #16A34A");
    expect(scoped).toContain("--sunken:color-mix(in oklab, #F0FDF4");
  });

  it("skips values that aren't #RRGGBB", () => {
    expect(brandingCss({ ...BLANK_BRANDING, theme_primary: "red" })).toBe("");
    expect(isHexColor("#12345G")).toBe(false);
    expect(isHexColor("#abcdef")).toBe(true);
  });
});

describe("retitle", () => {
  it("swaps the app name in the tab title, and back again", () => {
    expect(retitle("Clinicoro", "Clinicoro", "Glow Clinic")).toBe("Glow Clinic");
    expect(retitle("Inbox — Clinicoro", "Clinicoro", "Glow Clinic")).toBe("Inbox — Glow Clinic");
    expect(retitle("Inbox — Glow Clinic", "Glow Clinic", "Clinicoro")).toBe("Inbox — Clinicoro");
    expect(retitle("Glow Clinic", "Glow Clinic", "Clinicoro")).toBe("Clinicoro");
    expect(retitle("Inbox — Clinicoro", "Glow Clinic", "Clinicoro")).toBe("Inbox — Clinicoro");
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

describe("review fixes", () => {
  it("retitle leaves a title alone when it already ends with the new name (no endless loop)", () => {
    expect(retitle("Inbox — Glow — Clinicoro", "Clinicoro", "Glow — Clinicoro")).toBe("Inbox — Glow — Clinicoro");
  });

  it("text on the main colour is dark on light colours and white on dark ones", () => {
    expect(inkOn("#FBBF24")).not.toBe("#ffffff");
    expect(inkOn("#334155")).toBe("#ffffff");
    const css = brandingCss({ ...BLANK_BRANDING, theme_primary: "#FBBF24", sidebar_accent: "#FDE68A" });
    const light = css.split('html[data-mode="dark"]')[0];
    expect(light).toContain(`--primary-foreground:${inkOn("#FBBF24")}`);
    expect(light).toContain(`--sidebar-primary-foreground:${inkOn("#FDE68A")}`);
  });

  it("dark mode lightens an accent that would vanish on the navy background", () => {
    const dark = brandingCss({ ...BLANK_BRANDING, theme_primary: "#334155" }).split('html[data-mode="dark"][data-brand]')[1];
    const accent = /--primary:(#[0-9a-fA-F]{6})/.exec(dark)![1];
    expect(contrast(accent, DARK_BG)).toBeGreaterThanOrEqual(3);
    expect(dark).toContain(`--primary-foreground:${inkOn(accent)}`);
    // A colour that already reads well is kept as it is.
    expect(brandingCss({ ...BLANK_BRANDING, theme_primary: "#0E9F9A" }).split('data-mode="dark"')[1]).toContain("--primary:#0E9F9A");
  });

  it("recognises real image files by their first bytes, not their name", () => {
    const bytes = (...b: number[]) => new Uint8Array(b);
    const text = (s: string) => new TextEncoder().encode(s);
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffImage(text("RIFF\x00\x00\x00\x00WEBPVP8 "))).toBe("image/webp");
    expect(sniffImage(text('﻿  <?xml version="1.0"?><svg'))).toBe("image/svg+xml");
    expect(sniffImage(text("<svg xmlns='http://www.w3.org/2000/svg'>"))).toBe("image/svg+xml");
    expect(sniffImage(text("%PDF-1.7"))).toBeNull();
  });

  it("the boot script reads the same cache key and style id as the provider", () => {
    const js = brandBootJs();
    expect(js).toContain(JSON.stringify(BRANDING_CACHE_KEY));
    expect(js).toContain(JSON.stringify(BRAND_STYLE_ID));
    expect(js).not.toContain("undefined");
  });
});

describe("logo shape", () => {
  it("as uploaded keeps the whole image; circle and rounded fill and clip it", () => {
    expect(BLANK_BRANDING.logo_shape).toBeNull();
    expect(logoShapeClass(null)).toBe("object-contain");
    expect(logoShapeClass("original")).toBe("object-contain");
    expect(logoShapeClass("circle")).toContain("rounded-full");
    expect(logoShapeClass("circle")).toContain("object-cover");
    expect(logoShapeClass("rounded")).toContain("object-cover");
    expect(logoShapeClass("rounded")).not.toContain("rounded-full");
    expect(logoShapeClass("bogus" as never)).toBe("object-contain");
  });
});

describe("lockscreenOf", () => {
  it("returns the saved layout, and classic for none or anything unknown", () => {
    expect(lockscreenOf({ lockscreen: "split" })).toBe("split");
    expect(lockscreenOf({ lockscreen: "spotlight" })).toBe("spotlight");
    expect(lockscreenOf({ lockscreen: null })).toBe("classic");
    expect(lockscreenOf({ lockscreen: "neon" as never })).toBe("classic");
  });
});

describe("button text colour (068)", () => {
  it("an explicit button text colour wins over the automatic pick in light mode", () => {
    const css = brandingCss({ ...BLANK_BRANDING, theme_primary: "#0D9488", theme_button_text: "#FFFFFF" });
    const light = css.split('html[data-mode="dark"]')[0];
    expect(light).toContain("--primary-foreground:#FFFFFF");
    expect(light.match(/--primary-foreground:/g)).toHaveLength(1);
  });

  it("empty button text keeps the automatic pick", () => {
    expect(buttonText({ theme_primary: "#0D9488", theme_button_text: null })).toBe(inkOn("#0D9488"));
    expect(buttonText({ theme_primary: null, theme_button_text: null })).toBe(inkOn(DEFAULT_COLORS.theme_primary));
    expect(buttonText({ theme_primary: "#0D9488", theme_button_text: "#112233" })).toBe("#112233");
  });

  it("works with only the button text set (default main colour)", () => {
    const css = brandingCss({ ...BLANK_BRANDING, theme_button_text: "#FFEE00" });
    expect(css).toContain("--primary-foreground:#FFEE00");
  });
});
