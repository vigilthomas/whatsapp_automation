# Doctor login and login on/off — design (approved 2026-11-21)

**Why:** clinics add doctors under Master → Doctors without a login, and
later want some of them to sign in; they also need to stop someone
signing in without deleting them.

**What:**
- Master → Doctors gets a **Login** switch per row.
  - On, for a doctor with no login: a form (email pre-filled from the
    doctor, password, role) creates the login and links it to that same
    doctor row (no duplicate). The doctor then shows in Master → Users.
  - Off: blocks sign-in. Doctor stays bookable, keeps history, stays in
    Users marked "Login disabled". On again just unblocks (no form).
- Master → Users gets the same **Login** switch for everyone.
- Owner and yourself can't be switched off. Needs Users → Edit.

**How:** block = Supabase Auth ban (`ban_duration`), mirrored in
`profiles.login_disabled` (migration 070, a privilege column).
`POST /api/account/users` takes `doctor_id` to link an existing doctor;
`PUT /api/account/members/:userId/login {enabled}` blocks/unblocks.

**Known limit:** a signed-in session keeps working until its access
token expires (about an hour).

**Non-goals:** deleting logins from Doctors (Users still does that);
changing a linked doctor's email from the Doctors form.
