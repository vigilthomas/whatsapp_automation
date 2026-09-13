-- ============================================================
-- 040_module_access
--
-- Per-role module access matrix (Settings → Access control).
--
-- Lets an owner/admin hide whole app modules (Inbox, Broadcasts,
-- Flows, …) from a given role. Stored as a JSONB deny-list keyed by
-- role, so the default `{}` means "everything visible" and a module
-- added in a future release is visible to everyone until someone
-- turns it off — no data migration needed when the module list
-- grows.
--
--   { "viewer": ["broadcasts", "automations"], "agent": ["flows"] }
--
-- `owner` is never a key: the app ignores it on read and refuses it
-- on write, so there is always a role that can undo a lock-out.
--
-- Scope: this is UI-level gating (sidebar visibility + a client
-- redirect for denied routes). Data access stays governed by RLS and
-- the role hierarchy from 017/018 — see src/lib/auth/module-access.ts.
--
-- RLS: no change. The `accounts_update` policy (017) already limits
-- writes on `accounts` to admins+, which is exactly who may edit
-- this matrix.
-- ============================================================

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS module_access JSONB NOT NULL DEFAULT '{}'::jsonb;

-- The app tolerates unknown keys/values (it filters on read), but the
-- top level must be an object — an array or scalar would be a bug in
-- whoever wrote it, so reject it at the boundary.
ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_module_access_is_object;
ALTER TABLE accounts
  ADD CONSTRAINT accounts_module_access_is_object
  CHECK (jsonb_typeof(module_access) = 'object');
