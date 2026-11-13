-- 076_phone_verification.sql
--
-- Phone verification for new sign-ups: a 6-digit code sent on WhatsApp from AutoShift's own number.
--   profiles.phone / phone_verified_at : the verified number. Only the server (service role) can set
--     them; a signed-in person can't mark themselves verified (guard trigger below).
--   phone_verifications : one pending code per person, stored only as a hash, with attempt and
--     resend counters. No policies: only the server reads or writes it.
-- Settings live in platform_settings under the key 'phone_otp'.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;
-- One verified number per login.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_verified_phone_key ON public.profiles (phone) WHERE phone_verified_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_profile_phone_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.phone IS DISTINCT FROM OLD.phone OR NEW.phone_verified_at IS DISTINCT FROM OLD.phone_verified_at)
     AND current_user = 'authenticated'
  THEN
    RAISE EXCEPTION 'phone and phone_verified_at are set by phone verification only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION public.enforce_profile_phone_columns() OWNER TO postgres;
DROP TRIGGER IF EXISTS enforce_profile_phone_columns ON public.profiles;
CREATE TRIGGER enforce_profile_phone_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_phone_columns();

CREATE TABLE IF NOT EXISTS public.phone_verifications (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone         TEXT NOT NULL,
  code_hash     TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  attempts      INT NOT NULL DEFAULT 0,
  sends         INT NOT NULL DEFAULT 1,
  window_start  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sent_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.phone_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.phone_verifications FROM anon, authenticated;
