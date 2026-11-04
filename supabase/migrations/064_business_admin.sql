-- 064_business_admin.sql
--
-- What the admin panel needs to know about a business beyond its name:
-- industry, city, and whether platform staff have suspended it.
-- Written only by the backend (service role) through the platform routes.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS industry         TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS city             TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT;
