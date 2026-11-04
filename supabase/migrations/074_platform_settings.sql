-- 074_platform_settings.sql
--
-- Platform-wide switches set by super admins. First one: who Meta bills for WhatsApp message fees.
--   'business'  - each business pays Meta with its own card (Tech Provider). AutoShift's wallet does
--                 NOT charge for WhatsApp messages, only for AI replies. The default.
--   'autoshift' - AutoShift is a Solution Partner and shares its credit line, so Meta bills AutoShift
--                 and the wallet recovers the fee per message.
CREATE TABLE IF NOT EXISTS platform_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;  -- service role only

INSERT INTO platform_settings (key, value) VALUES ('meta_fees_billed_to', '"business"')
ON CONFLICT (key) DO NOTHING;
