-- Admin login with a username and password (the WhatsApp code step after it is unchanged).
-- Usernames are stored lowercase; one per admin.
ALTER TABLE platform_admins ADD COLUMN IF NOT EXISTS username TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_admins_username ON platform_admins (username) WHERE username IS NOT NULL;
