-- ============================================================
-- Remove everything supabase/seed/demo_bookings.sql added, in every
-- account: demo bookings, demo patients, doctor ↔ service links,
-- doctors, services and branches. Your own data is untouched (only
-- rows carrying the seed's markers are deleted).
-- ============================================================

BEGIN;
DELETE FROM appointments    WHERE notes = 'demo seed';
-- Any other bookings on demo patients (e.g. made while testing) go too.
DELETE FROM contacts        WHERE email LIKE '%@demo.example' AND phone LIKE '+91 90000 000%';
DELETE FROM doctor_services WHERE notes = 'demo seed';
DELETE FROM doctors         WHERE notes = 'demo seed';
DELETE FROM services        WHERE description LIKE '%(demo seed)';
DELETE FROM branches        WHERE notes = 'demo seed';
COMMIT;
