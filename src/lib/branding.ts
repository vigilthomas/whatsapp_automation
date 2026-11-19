/**
 * App branding (one row per install, table `app_branding`, migration 046).
 * Ported from the base template's Access control → Branding.
 *
 * Every field is optional: `null` means "keep the Clinicoro default", so an
 * install that never saved branding looks exactly like stock Clinicoro.
 * Colours are applied by overriding the theme tokens from globals.css with a
 * generated <style> (see `brandingCss`).
 */
import type { BrandMenu } from "./branding-menu";

export const COLOR_KEYS = [
  "sidebar_bg",
  "sidebar_text",
  "sidebar_accent",
  "title_color",
  "subtitle_color",
  "theme_primary",
  "theme_text",
  "theme_muted",
  "theme_bg",
  "theme_surface",
  "theme_danger",
] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

export type Branding = {
  title: string | null;
  subtitle: string | null;
  /** https URL or data:image/...;base64 (uploaded); null = Clinicoro logo. */
  logo: string | null;
  menu: BrandMenu;
} & Record<ColorKey, string | null>;

export const BLANK_BRANDING: Branding = {
  title: null,
  subtitle: null,
  logo: null,
  menu: {},
  ...(Object.fromEntries(COLOR_KEYS.map((k) => [k, null])) as Record<ColorKey, null>),
};

export const TITLE_MAX = 40;
/** localStorage key for `{branding, css}`; read by the provider and by the root layout's boot script. */
export const BRANDING_CACHE_KEY = "clinicoro.branding.v1";
export const BRAND_STYLE_ID = "brand-css";
/** Clinicoro's dark-mode page background (globals.css). */
export const DARK_BG = "#0b1622";
const LIGHT_INK = "#ffffff";
export const LOGO_MAX_BYTES = 512 * 1024;
export const LOGO_URL_MAX = 2000;
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];

export function isHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9A-Fa-f]{6}$/.test(v);
}

/** Light mode: every set colour. Token names are the ones in globals.css. */
const LIGHT_TOKENS: Record<ColorKey, string[]> = {
  theme_primary: ["--primary", "--ring", "--chart-1"],
  theme_text: ["--foreground", "--card-foreground"],
  theme_muted: ["--muted-foreground"],
  theme_bg: ["--background"],
  theme_surface: ["--card"],
  theme_danger: ["--destructive"],
  sidebar_bg: ["--sidebar"],
  sidebar_text: ["--sidebar-foreground"],
  sidebar_accent: ["--sidebar-primary", "--sidebar-ring"],
  title_color: ["--brand-title"],
  subtitle_color: ["--brand-subtitle"],
};

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** WCAG contrast ratio of two #RRGGBB colours (1 to 21). */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
/** White or dark text, whichever reads better on `bg`. */
export function inkOn(bg: string): string {
  return contrast(bg, LIGHT_INK) >= contrast(bg, DARK_BG) ? LIGHT_INK : DARK_BG;
}
/** The accent for dark mode: lightened towards white until it stands out on the navy page (3:1). */
function darkAccent(hex: string): string {
  let out = hex;
  for (let t = 0.1; contrast(out, DARK_BG) < 3 && t <= 1; t += 0.1) {
    out = "#" + channels(hex).map((c) => Math.round(c + (255 - c) * t).toString(16).padStart(2, "0")).join("");
  }
  return out;
}

const derived = (p: string) => [
  `--primary-hover:color-mix(in oklab, ${p} 85%, black)`,
  `--primary-soft:color-mix(in oklab, ${p} 12%, transparent)`,
  `--primary-soft-2:color-mix(in oklab, ${p} 22%, transparent)`,
];

/**
 * The <style> text for this branding, or '' when nothing is set.
 * `[data-brand]` (set on <html> by the provider) makes these rules beat
 * `html[data-theme="clinicoro"]`. Dark mode keeps Clinicoro's navy surfaces
 * and only takes the accent.
 */
export function brandingCss(b: Branding): string {
  const light: string[] = [];
  for (const key of COLOR_KEYS) {
    const value = b[key];
    if (isHexColor(value)) light.push(...LIGHT_TOKENS[key].map((t) => `${t}:${value}`));
  }
  if (isHexColor(b.theme_primary)) light.push(...derived(b.theme_primary), `--primary-foreground:${inkOn(b.theme_primary)}`);
  if (isHexColor(b.sidebar_accent)) light.push(`--sidebar-primary-foreground:${inkOn(b.sidebar_accent)}`);
  if (!light.length) return "";

  let css = `html[data-mode="light"][data-brand]{${light.join(";")}}`;

  // The sidebar's rows are styled with the app-wide tokens (muted text, mint,
  // navy, teal, sunken), so inside the sidebar point those at its own colours;
  // otherwise a dark sidebar preset leaves grey text on a dark background.
  const text = isHexColor(b.sidebar_text) ? b.sidebar_text : null;
  const accentSide = isHexColor(b.sidebar_accent) ? b.sidebar_accent : null;
  const side: string[] = [];
  if (text) {
    side.push(`--muted-foreground:${text}`, `--foreground:${text}`, `--navy:${text}`);
    side.push(`--sunken:color-mix(in oklab, ${text} 12%, transparent)`);
    side.push(`--border:color-mix(in oklab, ${text} 18%, transparent)`);
  }
  if (accentSide) {
    side.push(`--teal:${accentSide}`, `--teal-700:${accentSide}`);
    side.push(`--mint:color-mix(in oklab, ${accentSide} 18%, transparent)`);
  }
  if (side.length) css += `html[data-mode="light"][data-brand] aside[aria-label="Primary"]{${side.join(";")}}`;
  const chosen = isHexColor(b.theme_primary) ? b.theme_primary : isHexColor(b.sidebar_accent) ? b.sidebar_accent : null;
  if (chosen) {
    const accent = darkAccent(chosen);
    const dark = ["--primary", "--ring", "--chart-1", "--sidebar-primary", "--sidebar-ring"].map((t) => `${t}:${accent}`);
    const ink = inkOn(accent);
    dark.push(`--primary-foreground:${ink}`, `--sidebar-primary-foreground:${ink}`);
    css += `html[data-mode="dark"][data-brand]{${[...dark, ...derived(accent)].join(";")}}`;
  }
  return css;
}

/** Replace the app name `from` with `to` in a tab title ("Inbox — Clinicoro" or just "Clinicoro"). */
export function retitle(title: string, from: string, to: string): string {
  if (from === to || title === to || title.endsWith(` — ${to}`)) return title;
  if (title === from) return to;
  const suffix = ` — ${from}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length) + ` — ${to}` : title;
}

/** An error message for an uploaded logo, or null when it's fine. */
export function checkLogoFile(file: { size: number; type: string }): string | null {
  if (!LOGO_TYPES.includes(file.type)) return "Use a PNG, JPG, SVG or WebP image.";
  if (file.size > LOGO_MAX_BYTES) {
    return `The logo must be 512 KB or smaller (this one is ${Math.round(file.size / 1024)} KB).`;
  }
  return null;
}

/** An error message for a logo link, or null when it's fine. */
export function checkLogoUrl(url: string): string | null {
  const v = url.trim();
  if (!/^https:\/\/\S+$/i.test(v)) return "The link must start with https://";
  if (v.length > LOGO_URL_MAX) return "That link is too long.";
  return null;
}

/** The image type a file really is, from its first bytes; null when it isn't a PNG, JPEG, WebP or SVG. */
export function sniffImage(head: Uint8Array): string | null {
  const at = (i: number, ...b: number[]) => b.every((v, k) => head[i + k] === v);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  const text = new TextDecoder().decode(head).replace(/^﻿/, "").trimStart();
  if (/^<svg/i.test(text) || (/^(<\?xml|<!--|<!doctype svg)/i.test(text) && /<svg/i.test(text))) return "image/svg+xml";
  return null;
}

/**
 * The part of the root layout's boot script that puts the cached colours on the page before
 * the first paint. Plain ES5 for a <script> tag; must run inside a try block.
 */
export function brandBootJs(): string {
  return `
    var brand = JSON.parse(localStorage.getItem(${JSON.stringify(BRANDING_CACHE_KEY)}) || "null");
    if (brand && typeof brand.css === "string" && brand.css) {
      var style = document.createElement("style");
      style.id = ${JSON.stringify(BRAND_STYLE_ID)};
      style.textContent = brand.css;
      document.head.appendChild(style);
      document.documentElement.dataset.brand = "1";
    }`;
}
