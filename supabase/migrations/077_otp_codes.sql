-- 077_otp_codes.sql
--
-- One-time WhatsApp codes for account actions (changing or resetting a password), sent to the
-- person's verified phone. One pending code per person and purpose, stored only as a hash, with
-- attempt and resend counters. No policies: only the server reads or writes it.
CREATE TABLE IF NOT EXISTS public.otp_codes (
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose       TEXT NOT NULL CHECK (purpose IN ('password_change', 'password_reset')),
  code_hash     TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  attempts      INT NOT NULL DEFAULT 0,
  sends         INT NOT NULL DEFAULT 1,
  window_start  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sent_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, purpose)
);
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.otp_codes FROM anon, authenticated;
