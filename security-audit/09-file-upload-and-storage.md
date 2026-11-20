# 09 — File upload and storage

## Buckets

| Bucket | Public | Contents | Write policy | Read/list policy | Verdict |
|---|---|---|---|---|---|
| `chat-media` | **Yes** | Outbound media staff send; **inbound patient media mirrored by default (039)** | account folder (`account-<id>/`) for members | `FOR SELECT USING (bucket_id='chat-media')`, **everyone incl. anon** | **Critical (F-01)** |
| `flow-media` | Yes | Flow builder images/docs | account folder | public SELECT | Low (F-14) |
| `avatars` | Yes | Staff profile photos | user folder | public SELECT | Low (F-14) |

## Upload controls

| Control | Status |
|---|---|
| Size limits | Bucket `file_size_limit` set in migrations ✅ |
| MIME allow-list | Bucket `allowed_mime_types` ✅; branding logo also sniffs magic bytes (`sniffImage`) ✅ |
| Filename handling | `buildMediaPath` strips to `[a-zA-Z0-9_-]`, max 40 chars, adds timestamp/id ✅ |
| Path traversal | Not possible: names sanitised; folder enforced by RLS on INSERT ✅ |
| Overwrite | Members can UPDATE objects in their account folder (needed for re-upload). Acceptable |
| Executable content | Served by Supabase Storage with the stored content type from a separate origin, not the app origin ✅. SVG allowed for logos (stored as data URL in the branding row, rendered via `<img>`) ✅ |
| Malware scanning | None (Low; patients send files to staff, and staff open them locally) |
| Archive bombs | Not processed server-side ✅ |

## Downloads

- **Inbound (pointer mode)** `/api/whatsapp/media/:mediaId`: session + account's token, streams from Meta ✅.
- **Mirrored inbound & outbound:** public URLs. Anyone with the URL can download, and with F-01 anyone can **enumerate** URLs.

## Remediation (F-01, priority 0)

```sql
-- 1. Stop anonymous/cross-tenant listing (public object URLs keep working for Meta).
DROP POLICY IF EXISTS "Chat media is publicly readable" ON storage.objects;
CREATE POLICY "Members list their chat media" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'chat-media' AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]));
-- Same for flow-media and avatars.
```

2. Create a **private** bucket `patient-media` for the inbound mirror; serve it only through the authenticated media route or 5-minute signed URLs. Migrate existing `account-*/inbound/*` objects.
3. Decide retention for mirrored media (e.g. 2 years, or the clinic's records policy) and add a purge job.
4. Verify: an anon list returns empty; account B can't list A; outbound media still reaches Meta.
