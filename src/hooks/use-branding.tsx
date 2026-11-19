"use client";

/**
 * BrandingProvider — the install's name, logo, colours and menu wording
 * (table `app_branding`, migration 046). Ported from the base template's
 * branding.tsx.
 *
 * - Reads the single row once (anyone may read it, so the login page works).
 * - Keeps `<style id="brand-css">` and `data-brand` on <html> in step with it.
 * - Caches `{branding, css}` in localStorage; the boot script in the root
 *   layout injects that css before the first paint, so there's no flash.
 * - If the table doesn't exist yet (migration not run), everything quietly
 *   stays the Clinicoro default.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { BLANK_BRANDING, COLOR_KEYS, brandingCss, type Branding } from "@/lib/branding";

export const BRANDING_CACHE_KEY = "clinicoro.branding.v1";
export const BRAND_STYLE_ID = "brand-css";
const COLUMNS = ["title", "subtitle", "logo", "menu", ...COLOR_KEYS].join(",");
const DEFAULT_TITLE = "Clinicoro";

type BrandingContextValue = {
  branding: Branding;
  /** True once the row has been read (or found missing). */
  loaded: boolean;
  /** Show a branding without saving it (live preview); `null` returns to the saved one. */
  preview: (b: Branding | null) => void;
  reload: () => Promise<void>;
  /** Save changed fields. Resolves to an error message, or null on success. */
  save: (patch: Partial<Branding>) => Promise<string | null>;
};

const BrandingContext = createContext<BrandingContextValue>({
  branding: BLANK_BRANDING,
  loaded: false,
  preview: () => {},
  reload: async () => {},
  save: async () => "Branding isn't available here.",
});

function normalise(row: Partial<Branding> | null | undefined): Branding {
  const b = { ...BLANK_BRANDING, ...(row ?? {}) } as Branding;
  if (!b.menu || typeof b.menu !== "object") b.menu = {};
  return b;
}

function readCache(): Branding {
  if (typeof window === "undefined") return BLANK_BRANDING;
  try {
    const raw = localStorage.getItem(BRANDING_CACHE_KEY);
    if (raw) return normalise(JSON.parse(raw).branding);
  } catch {
    // Private mode or a broken cache: start from the defaults.
  }
  return BLANK_BRANDING;
}

/** Put the branding's colours on the page. */
function applyCss(b: Branding) {
  if (typeof document === "undefined") return;
  const css = brandingCss(b);
  let el = document.getElementById(BRAND_STYLE_ID) as HTMLStyleElement | null;
  if (css) {
    if (!el) {
      el = document.createElement("style");
      el.id = BRAND_STYLE_ID;
      document.head.appendChild(el);
    }
    el.textContent = css;
    document.documentElement.dataset.brand = "1";
  } else {
    el?.remove();
    delete document.documentElement.dataset.brand;
  }
}

function writeCache(b: Branding) {
  try {
    localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify({ branding: b, css: brandingCss(b) }));
  } catch {
    // Not fatal: the next load just fetches again.
  }
}

/** "Inbox — Clinicoro" → "Inbox — <clinic name>". */
function brandTitle(title: string, name: string | null) {
  if (!name || name === DEFAULT_TITLE) return title;
  return title === DEFAULT_TITLE ? name : title.replace(/ — Clinicoro$/, ` — ${name}`);
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<Branding>(readCache);
  const [previewing, setPreviewing] = useState<Branding | null>(null);
  const [loaded, setLoaded] = useState(false);
  const supabase = useMemo(() => createClient(), []);
  const branding = previewing ?? saved;

  /** Read the row; `null` when it can't be read (most likely migration 046 hasn't been run). */
  const fetchRow = useCallback(async (): Promise<Branding | null> => {
    const { data, error } = await supabase.from("app_branding").select(COLUMNS).eq("id", 1).maybeSingle();
    if (error) {
      console.warn("[branding] not loaded:", error.message); // keep the defaults, don't nag
      return null;
    }
    return normalise(data as Partial<Branding> | null);
  }, [supabase]);

  const take = useCallback((b: Branding | null) => {
    if (b) {
      setSaved(b);
      writeCache(b);
    }
    setLoaded(true);
  }, []);

  const reload = useCallback(async () => take(await fetchRow()), [fetchRow, take]);

  useEffect(() => {
    let active = true;
    fetchRow().then((b) => {
      if (active) take(b);
    });
    return () => {
      active = false;
    };
  }, [fetchRow, take]);

  useEffect(() => {
    applyCss(branding);
  }, [branding]);

  // Browser tab title follows the clinic name, including after client-side navigation.
  useEffect(() => {
    const name = saved.title;
    const fix = () => {
      const next = brandTitle(document.title, name);
      if (next !== document.title) document.title = next;
    };
    fix();
    const titleEl = document.querySelector("title");
    if (!titleEl) return;
    const observer = new MutationObserver(fix);
    observer.observe(titleEl, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [saved.title]);

  const save = useCallback(
    async (patch: Partial<Branding>) => {
      const { data, error } = await supabase
        .from("app_branding")
        .update(patch)
        .eq("id", 1)
        .select(COLUMNS)
        .maybeSingle();
      if (error) return error.message;
      if (!data) return "You don't have permission to change the branding.";
      const b = normalise(data as Partial<Branding>);
      setSaved(b);
      setPreviewing(null);
      writeCache(b);
      return null;
    },
    [supabase],
  );

  const value = useMemo(
    () => ({ branding, loaded, preview: setPreviewing, reload, save }),
    [branding, loaded, reload, save],
  );
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding(): BrandingContextValue {
  return useContext(BrandingContext);
}
