-- ============================================================
-- Demo clinic master data — clinics, clinic admins, doctors,
-- branches, services, designations.
--
-- Run AFTER supabase/apply_all_migrations.sql (needs 041 + 043). Seeds the
-- same three clinics into EVERY account so whichever login you use
-- sees data. Idempotent: rows are keyed on (account_id, name) and
-- skipped if already present, so re-running adds nothing twice.
--
-- Delete everything it created with:
--   DELETE FROM doctors       WHERE notes = 'demo seed';
--   DELETE FROM clinic_admins WHERE notes = 'demo seed';
--   DELETE FROM branches      WHERE notes = 'demo seed';
--   DELETE FROM services      WHERE description LIKE '%(demo seed)';
--   DELETE FROM designations  WHERE description LIKE '%(demo seed)';
--   DELETE FROM clinics       WHERE notes = 'demo seed';
-- ============================================================

BEGIN;

-- 1. Clinics ---------------------------------------------------
INSERT INTO clinics (account_id, name, phone, email, address, city, notes)
SELECT a.id, c.name, c.phone, c.email, c.address, c.city, 'demo seed'
FROM accounts a
CROSS JOIN (VALUES
  ('Sunrise Dental & Diagnostics', '+91 487 242 1100', 'hello@sunrisedental.example',
   '14 MG Road, Round East', 'Thrissur'),
  ('City Clinic',                  '+91 484 236 5500', 'care@cityclinic.example',
   '2nd Floor, Lulu Cyber Tower, Kakkanad', 'Kochi'),
  ('Green Valley Physio',          '+91 471 233 8800', 'front@greenvalleyphysio.example',
   'Kowdiar Avenue', 'Thiruvananthapuram')
) AS c(name, phone, email, address, city)
WHERE NOT EXISTS (
  SELECT 1 FROM clinics x WHERE x.account_id = a.id AND x.name = c.name
);

-- 2. Clinic admins ----------------------------------------------
INSERT INTO clinic_admins (account_id, clinic_id, name, phone, email, notes)
SELECT cl.account_id, cl.id, d.name, d.phone, d.email, 'demo seed'
FROM clinics cl
JOIN (VALUES
  ('Sunrise Dental & Diagnostics', 'Priya Menon',   '+91 98470 11001', 'priya@sunrisedental.example'),
  ('City Clinic',                  'Arun Krishnan', '+91 98950 22002', 'arun@cityclinic.example'),
  ('Green Valley Physio',          'Lakshmi Pillai','+91 94470 33003', 'lakshmi@greenvalleyphysio.example')
) AS d(clinic, name, phone, email) ON d.clinic = cl.name
WHERE cl.notes = 'demo seed'
  AND NOT EXISTS (
    SELECT 1 FROM clinic_admins x WHERE x.account_id = cl.account_id AND x.name = d.name
  );

-- 3. Doctors ------------------------------------------------------
INSERT INTO doctors (account_id, clinic_id, name, speciality, phone, whatsapp_number, email, notes)
SELECT cl.account_id, cl.id, d.name, d.speciality, d.phone, d.phone, d.email, 'demo seed'
FROM clinics cl
JOIN (VALUES
  -- Sunrise Dental
  ('Sunrise Dental & Diagnostics', 'Dr. Anil Menon',    'Dental Surgeon',   '+91 98460 10001', 'anil@sunrisedental.example'),
  ('Sunrise Dental & Diagnostics', 'Dr. Reshma Nair',   'Orthodontist',     '+91 98460 10002', 'reshma@sunrisedental.example'),
  ('Sunrise Dental & Diagnostics', 'Dr. Vivek Sharma',  'Physiotherapist',  '+91 98460 10003', 'vivek@sunrisedental.example'),
  -- City Clinic
  ('City Clinic',                  'Dr. Meera Das',     'General Physician','+91 98950 20001', 'meera@cityclinic.example'),
  ('City Clinic',                  'Dr. Rahul Varma',   'Pediatrician',     '+91 98950 20002', 'rahul@cityclinic.example'),
  ('City Clinic',                  'Dr. Sneha Iyer',    'Dermatologist',    '+91 98950 20003', 'sneha@cityclinic.example'),
  -- Green Valley Physio
  ('Green Valley Physio',          'Dr. Joseph Thomas', 'Physiotherapist',  '+91 94470 30001', 'joseph@greenvalleyphysio.example'),
  ('Green Valley Physio',          'Dr. Divya Raj',     'Sports Medicine',  '+91 94470 30002', 'divya@greenvalleyphysio.example')
) AS d(clinic, name, speciality, phone, email) ON d.clinic = cl.name
WHERE cl.notes = 'demo seed'
  AND NOT EXISTS (
    SELECT 1 FROM doctors x WHERE x.account_id = cl.account_id AND x.name = d.name
  );

-- 4. Branches ------------------------------------------------------
INSERT INTO branches (account_id, clinic_id, name, address, city, phone, notes)
SELECT cl.account_id, cl.id, b.name, b.address, b.city, b.phone, 'demo seed'
FROM clinics cl
JOIN (VALUES
  ('Sunrise Dental & Diagnostics', 'Round East (Main)', '14 MG Road, Round East', 'Thrissur', '+91 487 242 1100'),
  ('Sunrise Dental & Diagnostics', 'Punkunnam',         'Sobha Plaza, Punkunnam',  'Thrissur', '+91 487 238 4400'),
  ('City Clinic',                  'Kakkanad (Main)',   'Lulu Cyber Tower',        'Kochi',    '+91 484 236 5500'),
  ('City Clinic',                  'Edappally',         'Oberon Mall Road',        'Kochi',    '+91 484 280 7700'),
  ('Green Valley Physio',          'Kowdiar (Main)',    'Kowdiar Avenue',          'Thiruvananthapuram', '+91 471 233 8800')
) AS b(clinic, name, address, city, phone) ON b.clinic = cl.name
WHERE cl.notes = 'demo seed'
  AND NOT EXISTS (SELECT 1 FROM branches x WHERE x.account_id = cl.account_id AND x.name = b.name);

-- 5. Services (per account; priced in the account currency) ---------
INSERT INTO services (account_id, name, description, duration_min, price)
SELECT a.id, s.name, s.description || ' (demo seed)', s.duration_min, s.price
FROM accounts a
CROSS JOIN (VALUES
  ('Consultation',         'General consultation with a doctor',            20,  500.00),
  ('Follow-up',            'Review visit within 14 days of a consultation', 15,  300.00),
  ('Dental cleaning',      'Scaling and polishing',                         45, 1500.00),
  ('Root canal',           'Single-sitting endodontic treatment',           90, 6500.00),
  ('Tooth extraction',     'Simple extraction under local anaesthesia',     30, 1800.00),
  ('Check-up',             'Routine dental / health check',                 20,  400.00),
  ('Physiotherapy session','45-minute guided session',                      45,  900.00),
  ('Skin consultation',    'Dermatology consultation',                      20,  800.00),
  ('Child wellness visit', 'Pediatric growth and vaccination review',       30,  600.00)
) AS s(name, description, duration_min, price)
WHERE NOT EXISTS (SELECT 1 FROM services x WHERE x.account_id = a.id AND x.name = s.name);

-- 6. Designations (per account) with a starting permission set --------
-- Module ids and actions match src/lib/auth/permissions.ts. Adjust
-- under Access control afterwards; this just gives each one a
-- sensible starting point.
INSERT INTO designations (account_id, name, description, permissions)
SELECT a.id, d.name, d.description || ' (demo seed)', d.permissions::jsonb
FROM accounts a
CROSS JOIN (VALUES
  ('Clinic Admin', 'Runs the clinic: staff, settings, all records',
   '[{"module":"appointments","actions":["view","read","write","delete","export"]},
     {"module":"inbox","actions":["view","read","write","delete","export"]},
     {"module":"contacts","actions":["view","read","write","delete","export"]},
     {"module":"doctors","actions":["view","read","write","delete","export"]},
     {"module":"services","actions":["view","read","write","delete","export"]},
     {"module":"branches","actions":["view","read","write","delete","export"]},
     {"module":"clinics","actions":["view","read","write","export"]},
     {"module":"clinic-admins","actions":["view","read","write","delete"]},
     {"module":"users","actions":["view","read","write","delete"]},
     {"module":"designations","actions":["view","read","write","delete"]},
     {"module":"templates","actions":["view","read","write","delete"]},
     {"module":"quick-replies","actions":["view","read","write","delete"]},
     {"module":"fields","actions":["view","read","write","delete"]},
     {"module":"deals","actions":["view","read","write"]},
     {"module":"pipelines","actions":["view","read","write","delete","export"]},
     {"module":"broadcasts","actions":["view","read","write","delete","export"]},
     {"module":"automations","actions":["view","read","write","delete"]},
     {"module":"flows","actions":["view","read","write","delete"]},
     {"module":"agents","actions":["view","read","write","delete"]},
     {"module":"notifications","actions":["view","read"]}]'),
  ('Doctor', 'Consults; owns their appointments and patient records',
   '[{"module":"appointments","actions":["view","read","write","export"]},
     {"module":"contacts","actions":["view","read","write"]},
     {"module":"inbox","actions":["view","read","write"]},
     {"module":"services","actions":["read"]},
     {"module":"notifications","actions":["view","read"]}]'),
  ('Receptionist', 'Front desk: bookings, WhatsApp, patient intake',
   '[{"module":"appointments","actions":["view","read","write"]},
     {"module":"inbox","actions":["view","read","write"]},
     {"module":"contacts","actions":["view","read","write"]},
     {"module":"quick-replies","actions":["view","read"]},
     {"module":"notifications","actions":["view","read"]}]'),
  ('Assistant', 'Chair-side support: read-only view of the day',
   '[{"module":"appointments","actions":["view","read"]},
     {"module":"contacts","actions":["view","read"]},
     {"module":"notifications","actions":["view","read"]}]'),
  ('Accounts', 'Billing and reporting: exports, no clinical edits',
   '[{"module":"appointments","actions":["view","read","export"]},
     {"module":"contacts","actions":["view","read","export"]},
     {"module":"services","actions":["view","read","write"]},
     {"module":"deals","actions":["view","read","write","export"]},
     {"module":"pipelines","actions":["view","read","export"]}]')
) AS d(name, description, permissions)
WHERE NOT EXISTS (SELECT 1 FROM designations x WHERE x.account_id = a.id AND x.name = d.name);

COMMIT;

-- Sanity check — expect 3 / 3 / 8 / 5 / 9 / 5 per account:
-- SELECT a.name,
--        (SELECT count(*) FROM clinics       WHERE account_id = a.id) AS clinics,
--        (SELECT count(*) FROM clinic_admins WHERE account_id = a.id) AS admins,
--        (SELECT count(*) FROM doctors       WHERE account_id = a.id) AS doctors,
--        (SELECT count(*) FROM branches      WHERE account_id = a.id) AS branches,
--        (SELECT count(*) FROM services      WHERE account_id = a.id) AS services,
--        (SELECT count(*) FROM designations  WHERE account_id = a.id) AS designations
-- FROM accounts a;
