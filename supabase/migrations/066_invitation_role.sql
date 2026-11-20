-- ============================================================
-- 066_invitation_role.sql — invite people with a Role, not an access level
--
-- Until now an invite link carried only an access level (admin / agent /
-- viewer, migration 017/019). Everything a person can actually do comes
-- from their Role (designation, 043), and the Users page derives the
-- access level from the Role — so the level picked on the invite was
-- overwritten the moment staff gave the newcomer a Role.
--
-- An invitation now records the Role. The app works out the access level
-- from it when the link is created (same rule as the Users page,
-- `accessLevelFromRole` in src/lib/master/staff.ts) and stores that in
-- `role` as before, so `redeem_invitation` (019) is unchanged. After a
-- successful redeem, POST /api/invitations/<token>/redeem copies
-- `designation_id` onto the new member's profile and creates their
-- bookable staff row when the Role is a bookable one.
--
-- ON DELETE SET NULL: deleting a Role doesn't break a pending link; the
-- newcomer joins with the stored access level and no Role.
--
-- Run after 043. Safe to run more than once.
-- ============================================================

ALTER TABLE account_invitations
  ADD COLUMN IF NOT EXISTS designation_id UUID REFERENCES designations(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
