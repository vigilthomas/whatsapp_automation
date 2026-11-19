-- ============================================================
-- 056_leave_types.sql — half days and late coming
-- ============================================================
-- A leave is now one of:
--   full     the whole day (as before)
--   half_am  away until the middle of opening hours
--   half_pm  away from the middle of opening hours
--   late     arrives `late_minutes` after opening
-- The booking assistant only offers a doctor at times they're in.
--
-- Run after 055. Safe to run more than once.

ALTER TABLE user_leaves
  ADD COLUMN IF NOT EXISTS leave_type TEXT NOT NULL DEFAULT 'full'
    CHECK (leave_type IN ('full', 'half_am', 'half_pm', 'late')),
  ADD COLUMN IF NOT EXISTS late_minutes INTEGER
    CHECK (late_minutes IS NULL OR (late_minutes > 0 AND late_minutes <= 720));

NOTIFY pgrst, 'reload schema';
