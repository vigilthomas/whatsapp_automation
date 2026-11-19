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
  if (isHexColor(b.theme_primary)) light.push(...derived(b.theme_primary));
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
  const accent = isHexColor(b.theme_primary) ? b.theme_primary : isHexColor(b.sidebar_accent) ? b.sidebar_accent : null;
  if (accent) {
    const dark = ["--primary", "--ring", "--chart-1", "--sidebar-primary", "--sidebar-ring"].map((t) => `${t}:${accent}`);
    css += `html[data-mode="dark"][data-brand]{${[...dark, ...derived(accent)].join(";")}}`;
  }
  return css;
}

/** Replace the app name `from` with `to` in a tab title ("Inbox — Clinicoro" or just "Clinicoro"). */
export function retitle(title: string, from: string, to: string): string {
  if (from === to) return title;
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
