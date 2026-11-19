-- ============================================================
-- clear_master_data.sql — start Master over with a clean slate
-- ============================================================
-- NOT a migration. Run it by hand in the Supabase SQL editor, once,
-- after migrations 052–054, when you want to delete the existing master
-- records and enter them again.
--
-- It PERMANENTLY deletes, for every account in this database:
--   clinics, branches, clinic admins, services, and the doctor records
--   of people who are not users (doctors added by hand in the old
--   Doctors list). Deleting clinics also deletes their per-clinic AI
--   gateway settings from migration 045 (the app doesn't use them).
--
-- It keeps:
--   users and their logins, roles (Access control), contacts, chats,
--   appointments (their doctor / branch / clinic links become empty),
--   and the doctor records of users with a doctor role (they come back
--   with their user).
--
-- There is no undo. Take a backup first (Database → Backups) if unsure.
-- Delete the "--" in front of the roles line at the end only if you also
-- want to remove every role; users then fall back to their access level.

BEGIN;

-- Appointments keep their history, without the links that are going.
UPDATE appointments SET branch_id = NULL, clinic_id = NULL;
UPDATE appointments a SET doctor_id = NULL
  FROM doctors d
  WHERE a.doctor_id = d.id AND d.user_id IS NULL;

-- Users keep their login; only their branch / clinic link is cleared.
UPDATE profiles SET branch_id = NULL, clinic_id = NULL;
UPDATE doctors SET branch_id = NULL, clinic_id = NULL WHERE user_id IS NOT NULL;

DELETE FROM doctors WHERE user_id IS NULL;
DELETE FROM clinic_admins;
DELETE FROM services;
DELETE FROM branches;
DELETE FROM clinics;

-- DELETE FROM designations;

COMMIT;
