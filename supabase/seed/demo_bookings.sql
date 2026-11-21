-- ============================================================
-- Demo master data + bookings — past, today and future.
--
-- Run in the Supabase SQL editor. Seeds ONE account: the one with the
-- most active doctors (your clinic), or set v_account below by hand.
--
--   Masters:  2 branches, 6 services, 4 doctors, which doctor does
--             which service (doctor_services)
--   Contacts: 20 demo patients (+91 90000 000xx, @demo.example)
--   Bookings: 45 days back → 21 days ahead, Mon–Sat, 1–3 per doctor
--             per day, in the business timezone (booking settings).
--             Past: mostly completed, some no-shows and cancellations.
--             Today: earlier slots completed, later ones booked.
--             Future: scheduled / confirmed, a few cancelled.
--
-- Nothing is sent: no messages, no WhatsApp, no notifications (there
-- are no triggers on these tables). Idempotent: masters are keyed on
-- name, and bookings are skipped if demo bookings already exist.
--
-- Everything it adds is marked (notes = 'demo seed', services
-- '(demo seed)', contacts '@demo.example'); remove it all with
-- supabase/scripts/clear_demo_bookings.sql.
-- ============================================================

DO $$
DECLARE
  v_account UUID;          -- set this to seed a specific account
  v_owner   UUID;
  v_tz      TEXT;
  v_today   DATE;
  v_b1 UUID; v_b2 UUID;
  v_docs    UUID[];
  v_svc     RECORD;
  v_contacts UUID[];
  d DATE; k INT; s INT; n INT; h INT;
  v_doc UUID; v_branch UUID; v_service TEXT; v_dur INT;
  v_start TIMESTAMPTZ; v_status TEXT; v_source TEXT;
  v_services TEXT[] := ARRAY['Consultation','Dental cleaning','Root canal','Tooth extraction','Braces review','Teeth whitening'];
  v_durs     INT[]  := ARRAY[20, 45, 90, 30, 30, 60];
BEGIN
  IF v_account IS NULL THEN
    SELECT account_id INTO v_account
    FROM doctors WHERE deleted_at IS NULL AND is_active
    GROUP BY account_id ORDER BY count(*) DESC LIMIT 1;
  END IF;
  IF v_account IS NULL THEN
    SELECT id INTO v_account FROM accounts ORDER BY created_at LIMIT 1;
  END IF;
  SELECT owner_user_id INTO v_owner FROM accounts WHERE id = v_account;
  RAISE NOTICE 'Seeding account % (%)', v_account, (SELECT name FROM accounts WHERE id = v_account);

  v_tz := COALESCE((SELECT config->>'timezone' FROM booking_settings WHERE account_id = v_account), 'Asia/Kolkata');
  v_today := (now() AT TIME ZONE v_tz)::date;

  -- Branches -------------------------------------------------------
  INSERT INTO branches (account_id, name, address, city, phone, notes)
  SELECT v_account, b.name, b.address, b.city, b.phone, 'demo seed'
  FROM (VALUES
    ('Aluva (Demo)',   'Bank Junction, Aluva',      'Kochi',    '+91 484 262 0000'),
    ('Thrissur (Demo)','MG Road, Round East',       'Thrissur', '+91 487 242 0000')
  ) AS b(name, address, city, phone)
  WHERE NOT EXISTS (SELECT 1 FROM branches x WHERE x.account_id = v_account AND x.name = b.name AND x.deleted_at IS NULL);
  SELECT id INTO v_b1 FROM branches WHERE account_id = v_account AND name = 'Aluva (Demo)' AND deleted_at IS NULL;
  SELECT id INTO v_b2 FROM branches WHERE account_id = v_account AND name = 'Thrissur (Demo)' AND deleted_at IS NULL;

  -- Services -------------------------------------------------------
  INSERT INTO services (account_id, name, description, duration_min, buffer_min, price)
  SELECT v_account, s.name, s.description || ' (demo seed)', s.dur, s.buf, s.price
  FROM (VALUES
    ('Consultation',     'General dental consultation', 20, 5,  500.00),
    ('Dental cleaning',  'Scaling and polishing',       45, 10, 1500.00),
    ('Root canal',       'Single-sitting RCT',          90, 15, 6500.00),
    ('Tooth extraction', 'Simple extraction',           30, 10, 1800.00),
    ('Braces review',    'Orthodontic adjustment',      30, 5,  1200.00),
    ('Teeth whitening',  'In-chair whitening',          60, 10, 8000.00)
  ) AS s(name, description, dur, buf, price)
  WHERE NOT EXISTS (SELECT 1 FROM services x WHERE x.account_id = v_account AND x.name = s.name AND x.deleted_at IS NULL);

  -- Doctors --------------------------------------------------------
  INSERT INTO doctors (account_id, branch_id, name, speciality, phone, whatsapp_number, email, notes)
  SELECT v_account, CASE WHEN d.br = 1 THEN v_b1 ELSE v_b2 END, d.name, d.spec, d.phone, d.phone, d.email, 'demo seed'
  FROM (VALUES
    ('Dr. Arjun Pillai (Demo)',  'Dental Surgeon', '+91 90000 10001', 'arjun@demo.example',  1),
    ('Dr. Kavya Nair (Demo)',    'Orthodontist',   '+91 90000 10002', 'kavya@demo.example',  1),
    ('Dr. Rohan Mathew (Demo)',  'Endodontist',    '+91 90000 10003', 'rohan@demo.example',  2),
    ('Dr. Sana Rahman (Demo)',   'Cosmetic Dentist','+91 90000 10004','sana@demo.example',   2)
  ) AS d(name, spec, phone, email, br)
  WHERE NOT EXISTS (SELECT 1 FROM doctors x WHERE x.account_id = v_account AND x.name = d.name AND x.deleted_at IS NULL);
  SELECT array_agg(id ORDER BY name) INTO v_docs
  FROM doctors WHERE account_id = v_account AND notes = 'demo seed' AND deleted_at IS NULL;

  -- Every demo doctor does every demo service
  INSERT INTO doctor_services (account_id, doctor_id, service_id, notes)
  SELECT v_account, doc.id, svc.id, 'demo seed'
  FROM doctors doc
  CROSS JOIN services svc
  WHERE doc.account_id = v_account AND doc.notes = 'demo seed' AND doc.deleted_at IS NULL
    AND svc.account_id = v_account AND svc.description LIKE '%(demo seed)' AND svc.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM doctor_services x WHERE x.doctor_id = doc.id AND x.service_id = svc.id AND x.deleted_at IS NULL
    );

  -- Contacts -------------------------------------------------------
  INSERT INTO contacts (user_id, account_id, phone, name, email)
  SELECT v_owner, v_account, '+91 90000 000' || lpad(i::text, 2, '0'), c.name,
         lower(split_part(c.name, ' ', 1)) || i || '@demo.example'
  FROM unnest(ARRAY[
    'Aarav Menon','Diya Krishnan','Ishaan Varghese','Ananya Pillai','Vihaan Nair',
    'Meera Joseph','Kabir Thomas','Saanvi Iyer','Aditya Kurian','Nila Rajan',
    'Reyansh George','Tara Suresh','Arnav Das','Ira Mohan','Dev Abraham',
    'Riya Chandran','Neel Philip','Zara Hameed','Kiran Babu','Lakshmi Unni'
  ]) WITH ORDINALITY AS c(name, i)
  WHERE NOT EXISTS (
    SELECT 1 FROM contacts x WHERE x.account_id = v_account AND x.phone = '+91 90000 000' || lpad(i::text, 2, '0')
  );
  SELECT array_agg(id ORDER BY phone) INTO v_contacts
  FROM contacts WHERE account_id = v_account AND email LIKE '%@demo.example';

  -- Bookings -------------------------------------------------------
  IF EXISTS (SELECT 1 FROM appointments WHERE account_id = v_account AND notes = 'demo seed') THEN
    RAISE NOTICE 'Demo bookings already exist; skipped. Run clear_demo_bookings.sql first to reseed.';
    RETURN;
  END IF;

  FOR d IN SELECT generate_series(v_today - 45, v_today + 21, interval '1 day')::date LOOP
    CONTINUE WHEN extract(isodow FROM d) = 7;           -- closed Sundays
    FOR k IN 1 .. array_length(v_docs, 1) LOOP
      v_doc := v_docs[k];
      v_branch := CASE WHEN k <= 2 THEN v_b1 ELSE v_b2 END;
      n := 1 + abs(hashtext(d::text || k)) % 3;         -- 1–3 bookings
      FOR s IN 0 .. n - 1 LOOP
        h := abs(hashtext(d::text || k || s));
        v_service := v_services[1 + h % 6];
        v_dur := v_durs[1 + h % 6];
        -- 09:30, 11:30, 14:30 (+0/15/30 min) so a doctor never overlaps
        v_start := ((d + time '09:30' + (CASE s WHEN 0 THEN 0 WHEN 1 THEN 120 ELSE 300 END + (h % 3) * 15) * interval '1 minute')
                    AT TIME ZONE v_tz);
        v_source := CASE WHEN h % 5 < 2 THEN 'whatsapp' ELSE 'manual' END;
        IF v_start + v_dur * interval '1 minute' < now() THEN
          v_status := CASE WHEN h % 10 = 0 THEN 'no_show' WHEN h % 10 = 1 THEN 'cancelled' ELSE 'completed' END;
        ELSE
          v_status := CASE WHEN h % 12 = 0 THEN 'cancelled' WHEN h % 2 = 0 THEN 'confirmed' ELSE 'scheduled' END;
        END IF;
        INSERT INTO appointments (account_id, branch_id, doctor_id, contact_id, service, starts_at, ends_at, status, source, notes, created_by)
        VALUES (v_account, v_branch, v_doc, v_contacts[1 + (h / 7) % array_length(v_contacts, 1)], v_service,
                v_start, v_start + v_dur * interval '1 minute', v_status, v_source, 'demo seed', v_owner);
      END LOOP;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Done: % demo bookings', (SELECT count(*) FROM appointments WHERE account_id = v_account AND notes = 'demo seed');
END $$;
