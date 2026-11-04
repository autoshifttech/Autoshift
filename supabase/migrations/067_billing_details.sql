-- 067_billing_details.sql
--
-- Who a GST invoice is made out to. One row per business, written only by the backend
-- (it validates the GSTIN); admins can read it. Each invoice keeps a snapshot, so changing
-- the details later never rewrites an invoice that was already issued.
CREATE TABLE IF NOT EXISTS billing_details (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  legal_name TEXT NOT NULL DEFAULT '',
  has_gstin  BOOLEAN NOT NULL DEFAULT FALSE,
  gstin      TEXT NOT NULL DEFAULT '',
  state_code TEXT NOT NULL DEFAULT '',
  address    TEXT NOT NULL DEFAULT '',
  city       TEXT NOT NULL DEFAULT '',
  pincode    TEXT NOT NULL DEFAULT '',
  email      TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE billing_details ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_details_select ON billing_details;
CREATE POLICY billing_details_select ON billing_details FOR SELECT USING (is_account_member(account_id, 'admin'));

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS buyer JSONB NOT NULL DEFAULT '{}'::jsonb;
