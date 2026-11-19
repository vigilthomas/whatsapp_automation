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
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { BLANK_BRANDING, BRANDING_CACHE_KEY, BRAND_STYLE_ID, COLOR_KEYS, brandingCss, retitle, type Branding } from "@/lib/branding";



const COLUMNS = ["title", "subtitle", "logo", "logo_shape", "menu", ...COLOR_KEYS].join(",");
const DEFAULT_TITLE = "Clinicoro";

type BrandingContextValue = {
  branding: Branding;
  /** True once the row has been read (or found missing). */
  loaded: boolean;
  /** False when the table can't be read (migration 046 not run yet). */
  available: boolean;
  /** The signed-in member is an owner or admin of the clinic's own account (migration 047). */
  canEdit: boolean;
  /** Show a branding without saving it (live preview); `null` returns to the saved one. */
  preview: (b: Branding | null) => void;
  reload: () => Promise<void>;
  /** Save changed fields. Resolves to an error message, or null on success. */
  save: (patch: Partial<Branding>) => Promise<string | null>;
};

const BrandingContext = createContext<BrandingContextValue>({
  branding: BLANK_BRANDING,
  loaded: false,
  available: false,
  canEdit: false,
  preview: () => {},
  reload: async () => {},
  save: async () => "Branding isn't available here.",
});

function normalise(row: Partial<Branding> | null | undefined): Branding {
  const b = { ...BLANK_BRANDING, ...(row ?? {}) } as Branding;
  if (!b.menu || typeof b.menu !== "object") b.menu = {};
  return b;
}

/** The cached row as stored (a string, so React can compare snapshots); null on the server or when empty. */
function readCacheRaw(): string | null {
  try {
    return localStorage.getItem(BRANDING_CACHE_KEY);
  } catch {
    return null; // private mode
  }
}
const noSubscribe = () => () => {};

function parseCache(raw: string | null): Branding {
  try {
    if (raw) return normalise(JSON.parse(raw).branding);
  } catch {
    // A broken cache: start from the defaults.
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

export function BrandingProvider({ children }: { children: ReactNode }) {
  // The first render uses the defaults on the server and in the browser alike (no hydration
  // mismatch); React then re-renders with the cache. The boot script has already put the
  // cached colours on the page, so there's no flash.
  const cacheRaw = useSyncExternalStore(noSubscribe, readCacheRaw, () => null);
  const cached = useMemo(() => parseCache(cacheRaw), [cacheRaw]);
  const [fetched, setSaved] = useState<Branding | null>(null);
  const saved = fetched ?? cached;
  const [previewing, setPreviewing] = useState<Branding | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [available, setAvailable] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
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
    setAvailable(!!b);
    setLoaded(true);
  }, []);

  /** Only the clinic's own owners and admins may change the branding; any signed-up user owns an account of their own. */
  const checkEdit = useCallback(async () => {
    const { data, error } = await supabase.rpc("can_edit_branding");
    setCanEdit(!error && data === true);
  }, [supabase]);

  const reload = useCallback(async () => {
    take(await fetchRow());
    await checkEdit();
  }, [fetchRow, take, checkEdit]);

  useEffect(() => {
    let active = true;
    const run = () => {
      supabase.rpc("can_edit_branding").then(({ data, error }) => {
        if (active) setCanEdit(!error && data === true);
      });
    };
    run();
    const { data } = supabase.auth.onAuthStateChange(() => run());
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

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

  // Browser tab title follows the clinic name, including after client-side
  // navigation (Next writes "Page — Clinicoro"). `shown` is the name in the
  // tab now, so clearing the name puts "Clinicoro" back.
  const shown = useRef(DEFAULT_TITLE);
  useEffect(() => {
    const name = saved.title || DEFAULT_TITLE;
    const fix = () => {
      let next = retitle(document.title, shown.current, name);
      if (shown.current !== DEFAULT_TITLE) next = retitle(next, DEFAULT_TITLE, name); // a fresh "— Clinicoro" from Next
      shown.current = name;
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
    () => ({ branding, loaded, available, canEdit, preview: setPreviewing, reload, save }),
    [branding, loaded, available, canEdit, reload, save],
  );
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding(): BrandingContextValue {
  return useContext(BrandingContext);
}
