-- ============================================================
-- 069_designation_dashboard_cards.sql — per-role dashboard card switches
--
-- Access Control → (role) → Dashboard lets an admin switch each
-- dashboard card on or off for a role. Stored here as the cards that
-- are switched OFF:
--
--   { "disabled": ["stat-takings", "recent-chats"] }
--
-- NULL (every existing role) = all cards on. Storing the disabled list
-- rather than the enabled one means new cards and a change of business
-- type default to on, with no data migration.
--
-- This only decides what the dashboard shows. What a role can READ is
-- still its module permissions and data scope (058/063).
--
-- Writes go through PATCH /api/master/designations/:id on the
-- service-role client, which sanitizes the value (known card ids only),
-- so no column grant is needed. The app reads this column with a
-- fallback, so it keeps working (all cards on) before this runs.
--
-- Safe to run more than once.
-- ============================================================

ALTER TABLE designations ADD COLUMN IF NOT EXISTS dashboard_cards JSONB;

NOTIFY pgrst, 'reload schema';
