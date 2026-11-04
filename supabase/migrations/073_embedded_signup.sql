-- 073_embedded_signup.sql
--
-- Numbers connected through WhatsApp Embedded Signup are registered with a two-step PIN AutoShift
-- generates. It is kept (encrypted by the app, like the access token) so the number can be
-- re-registered later without asking the business. `onboarded_via` tells manual setups apart.
ALTER TABLE whatsapp_config ADD COLUMN IF NOT EXISTS two_step_pin TEXT;
ALTER TABLE whatsapp_config ADD COLUMN IF NOT EXISTS onboarded_via TEXT NOT NULL DEFAULT 'manual'
  CHECK (onboarded_via IN ('manual', 'embedded_signup'));
