#!/usr/bin/env node
/**
 * One-off: move inbound patient media out of the PUBLIC `chat-media`
 * bucket into the PRIVATE `patient-media` bucket (migration 062,
 * security audit F-01), and point messages.media_url at the signed-in
 * route `/api/whatsapp/media/stored/<path>`.
 *
 * Apply migration 062 first. Then:
 *
 *   node scripts/move-inbound-media.mjs            # dry run, changes nothing
 *   node scripts/move-inbound-media.mjs --apply    # copy, repoint, delete
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the
 * environment (e.g. `node --env-file=.env.local scripts/...`). Uses the
 * service role, so run it from a trusted machine only.
 *
 * Order per object: copy → update message rows → delete the public copy.
 * A failure at any step leaves the public copy in place and moves on, so
 * a re-run picks up where it stopped. Safe to run more than once.
 */
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const FROM = "chat-media";
const TO = "patient-media";
const ROUTE = "/api/whatsapp/media/stored/";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const routeUrl = (path) => ROUTE + path.split("/").map(encodeURIComponent).join("/");

async function listAll(bucket, prefix) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage
      .from(bucket)
      .list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

let moved = 0;
let failed = 0;

const folders = (await listAll(FROM, "")).filter((e) => /^account-[0-9a-f-]{36}$/.test(e.name));
for (const folder of folders) {
  const prefix = `${folder.name}/inbound`;
  const files = (await listAll(FROM, prefix)).filter((e) => e.id); // skip sub-folders
  for (const file of files) {
    const path = `${prefix}/${file.name}`;
    const publicUrl = db.storage.from(FROM).getPublicUrl(path).data.publicUrl;
    if (!APPLY) {
      console.log(`[dry run] would move ${path}`);
      moved++;
      continue;
    }
    try {
      const { data: blob, error: dlErr } = await db.storage.from(FROM).download(path);
      if (dlErr || !blob) throw new Error(`download: ${dlErr?.message}`);
      const { error: upErr } = await db.storage.from(TO).upload(path, blob, {
        contentType: blob.type || file.metadata?.mimetype || "application/octet-stream",
        upsert: true,
      });
      if (upErr) throw new Error(`upload: ${upErr.message}`);
      const { error: msgErr } = await db
        .from("messages")
        .update({ media_url: routeUrl(path) })
        .eq("media_url", publicUrl);
      if (msgErr) throw new Error(`update messages: ${msgErr.message}`);
      const { error: rmErr } = await db.storage.from(FROM).remove([path]);
      if (rmErr) throw new Error(`remove public copy: ${rmErr.message}`);
      console.log(`moved ${path}`);
      moved++;
    } catch (err) {
      console.error(`FAILED ${path}: ${err instanceof Error ? err.message : err}`);
      failed++;
    }
  }
}

console.log(
  `${APPLY ? "Moved" : "Would move"} ${moved} object(s) across ${folders.length} account folder(s)` +
    (failed ? `; ${failed} failed (re-run to retry)` : "") +
    (APPLY ? "." : ". Re-run with --apply to do it."),
);
process.exit(failed ? 1 : 0);
