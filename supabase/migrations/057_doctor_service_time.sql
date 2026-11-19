-- ============================================================
-- 057_doctor_service_time.sql — a doctor's own time for a service
-- ============================================================
-- Master → Doctor services gets an optional time. Empty means the
-- service's default time (Master → Services). When set, booking that
-- doctor for that service uses this time instead.
--
-- Run after 056. Safe to run more than once.

ALTER TABLE doctor_services
  ADD COLUMN IF NOT EXISTS duration_min INTEGER
    CHECK (duration_min IS NULL OR (duration_min >= 5 AND duration_min <= 720));

NOTIFY pgrst, 'reload schema';
