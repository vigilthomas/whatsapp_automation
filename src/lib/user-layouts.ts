/**
 * Per-user saved layouts (table `user_layouts`, migration 064): the
 * dashboard's card arrangement and every table's columns, each with a
 * "current" layout (kept automatically) and one "preset" the user saved
 * on purpose.
 *
 * The database is the source of truth so a layout follows the user to
 * another device. localStorage is a cache for instant first paint and
 * the fallback while migration 064 hasn't been run (a missing table is
 * remembered per page load so we stop asking).
 *
 * Keys: `<screen>` and `<screen>:preset`, where screen is "dashboard" or
 * "table:<tableId>". The DB CHECK allows `[a-z0-9:._-]`, so ids are
 * lower-cased and anything else becomes "-".
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type LayoutKind = "current" | "preset";

export function layoutDbKey(screen: string, kind: LayoutKind): string {
  const s = screen.toLowerCase().replace(/[^a-z0-9:._-]/g, "-").slice(0, 70);
  return kind === "preset" ? `${s}:preset` : s;
}

const LOCAL_PREFIX = "clinicoro.layout";
const localKey = (dbKey: string, userId: string | null) => `${LOCAL_PREFIX}.${dbKey}${userId ? `.${userId}` : ""}`;

export function readLocal(dbKey: string, userId: string | null): unknown {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(localKey(dbKey, userId)) : null;
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeLocal(dbKey: string, userId: string | null, value: unknown): void {
  try {
    if (value === null || value === undefined) window.localStorage.removeItem(localKey(dbKey, userId));
    else window.localStorage.setItem(localKey(dbKey, userId), JSON.stringify(value));
  } catch {
    // Storage blocked or full: the layout still works for this visit.
  }
}

/** Set once the table turns out to be missing (064 not run). */
let tableMissing = false;
const MISSING = new Set(["42P01", "PGRST205"]);

/**
 * Read several layouts for the signed-in user. Resolves to a map of the
 * rows found, or null when the database can't be used (no user, table
 * missing, network) — callers then keep what they read from localStorage.
 */
export async function fetchLayouts(
  db: SupabaseClient,
  userId: string | null,
  keys: string[],
): Promise<Record<string, unknown> | null> {
  if (!userId || tableMissing || keys.length === 0) return null;
  const { data, error } = await db.from("user_layouts").select("key, layout").eq("user_id", userId).in("key", keys);
  if (error) {
    if (MISSING.has(error.code ?? "")) tableMissing = true;
    return null;
  }
  const out: Record<string, unknown> = {};
  for (const row of (data ?? []) as { key: string; layout: unknown }[]) out[row.key] = row.layout;
  return out;
}

/** Save (or with `null`, delete) one layout. Best effort: failures only log. */
export async function storeLayout(
  db: SupabaseClient,
  userId: string | null,
  key: string,
  value: unknown,
): Promise<void> {
  writeLocal(key, userId, value);
  if (!userId || tableMissing) return;
  const { error } =
    value === null || value === undefined
      ? await db.from("user_layouts").delete().eq("user_id", userId).eq("key", key)
      : await db
          .from("user_layouts")
          .upsert({ user_id: userId, key, layout: value, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" });
  if (error) {
    if (MISSING.has(error.code ?? "")) tableMissing = true;
    else console.warn("[layouts] not saved:", error.message);
  }
}

/** Debounced `storeLayout`, so dragging doesn't write on every pixel. */
export function debouncedStore(db: SupabaseClient, delayMs = 800) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  return (userId: string | null, key: string, value: unknown) => {
    writeLocal(key, userId, value);
    const prev = timers.get(key);
    if (prev) clearTimeout(prev);
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        void storeLayout(db, userId, key, value);
      }, delayMs),
    );
  };
}

/** Test seam. */
export function __resetLayoutStore(): void {
  tableMissing = false;
}
