-- ============================================================
-- 062_private_patient_media.sql
--
-- Security audit F-01 (Critical) and F-14 (Low).
--
-- Before this migration, the `chat-media`, `flow-media` and `avatars`
-- buckets each had a SELECT policy on storage.objects with no role and
-- no account predicate (migrations 008, 016, 023):
--
--     FOR SELECT USING (bucket_id = 'chat-media')
--
-- storage.objects SELECT is what governs the Storage LIST endpoint, so
-- anyone holding the public anon key (it ships in every browser
-- bundle) could enumerate every `account-<uuid>/` folder and, since the
-- buckets are public, download every object in them. Migration 039
-- started mirroring INBOUND patient attachments (prescriptions,
-- X-rays, ID cards, voice notes) into `chat-media`, so that was
-- cross-tenant health data.
--
-- Two changes:
--
--   1. A new PRIVATE bucket, `patient-media`, for inbound media. The
--      webhook writes it with the service role; members of the account
--      read it through the signed-in route
--      `/api/whatsapp/media/stored/<path>` (which checks the account
--      folder AND relies on the SELECT policy below). Nothing in it has
--      a public URL.
--
--   2. The three public buckets keep `public = true` — Meta must fetch
--      outbound media and template headers by plain URL, and avatars
--      render in <img> tags — but their SELECT (= list) policies now
--      only let a signed-in member see their own account's folder.
--      Public object URLs bypass RLS entirely, so nothing that renders
--      today breaks; what stops is enumeration.
--
-- Existing inbound objects already in chat-media/account-*/inbound/
-- are NOT moved by SQL (a Storage object is a row plus a file in the
-- backing store). Run `node scripts/move-inbound-media.mjs` once after
-- applying this migration; it moves them into `patient-media` and
-- rewrites messages.media_url. Until then they are no longer listable,
-- but anyone who already has an exact URL can still fetch it.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ============================================================
-- 1. patient-media: private bucket for inbound attachments
--    (same size cap and MIME allow-list as chat-media after 039)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'patient-media',
  'patient-media',
  FALSE,
  16777216,
  ARRAY[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'video/mp4', 'video/3gpp', 'video/3gp', 'video/quicktime',
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'audio/ogg', 'audio/mpeg', 'audio/aac', 'audio/mp4', 'audio/amr', 'audio/opus'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = FALSE,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Members read their own account's folder. No INSERT/UPDATE/DELETE
-- policies: only the service role (webhook, move script) writes here.
DROP POLICY IF EXISTS "Members can read patient media" ON storage.objects;
CREATE POLICY "Members can read patient media"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'patient-media'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

-- ============================================================
-- 2. chat-media: list only your own account's folder
-- ============================================================
DROP POLICY IF EXISTS "Chat media is publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Members can read chat media" ON storage.objects;
CREATE POLICY "Members can read chat media"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

-- ============================================================
-- 3. flow-media: same, keeping 020's legacy `<user_id>/` folders
-- ============================================================
DROP POLICY IF EXISTS "Flow media is publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Members can read flow media" ON storage.objects;
CREATE POLICY "Members can read flow media"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'flow-media'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid()
          AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
      )
      OR auth.uid()::text = (storage.foldername(name))[1]
    )
  );

-- ============================================================
-- 4. avatars: list only your own `<user_id>/` folder
-- ============================================================
DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their own avatar folder" ON storage.objects;
CREATE POLICY "Users can read their own avatar folder"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
