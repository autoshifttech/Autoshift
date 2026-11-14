-- 079_admin_login_codes.sql
-- WhatsApp sign-in codes for the admin panel reuse otp_codes (one pending code per person and purpose).
ALTER TABLE public.otp_codes DROP CONSTRAINT IF EXISTS otp_codes_purpose_check;
ALTER TABLE public.otp_codes ADD CONSTRAINT otp_codes_purpose_check
  CHECK (purpose IN ('password_change', 'password_reset', 'admin_login'));
