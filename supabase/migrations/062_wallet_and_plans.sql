-- 062_wallet_and_plans.sql
--
-- Razorpay wallet and plans. All money is stored in paise (integers).
--
--   * wallet_ledger is append-only: rows are never changed or deleted. The
--     balance is the sum of the ledger, kept in wallet_balances by wallet_apply().
--   * wallet_apply() is the only way money moves. It locks the balance row,
--     refuses to go below zero on a debit, and is idempotent on idem_key, so a
--     repeated webhook or retried job can never credit or charge twice.
--   * Users can read their own rows; every write goes through the backend
--     (service role). Tables without a policy are service-role only.

-- ---------------------------------------------------------------- ledger
CREATE TABLE IF NOT EXISTS wallet_balances (
  account_id    UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  balance_paise BIGINT NOT NULL DEFAULT 0 CHECK (balance_paise >= 0),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE wallet_balances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wallet_balances_select ON wallet_balances;
CREATE POLICY wallet_balances_select ON wallet_balances FOR SELECT USING (is_account_member(account_id));

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN (
                  'topup', 'adjustment', 'refund',
                  'charge_marketing', 'charge_utility', 'charge_authentication',
                  'charge_service', 'charge_ai')),
  amount_paise  BIGINT NOT NULL CHECK (amount_paise <> 0),   -- + credit, - debit
  balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
  ref           TEXT NOT NULL DEFAULT '',                    -- payment id, message id, note ...
  idem_key      TEXT NOT NULL UNIQUE,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_account ON wallet_ledger(account_id, id DESC);
ALTER TABLE wallet_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wallet_ledger_select ON wallet_ledger;
CREATE POLICY wallet_ledger_select ON wallet_ledger FOR SELECT USING (is_account_member(account_id, 'admin'));

-- Append-only: nobody (not even the service role) may edit or remove history.
CREATE OR REPLACE FUNCTION wallet_ledger_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'wallet_ledger is append-only';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_wallet_ledger_immutable ON wallet_ledger;
CREATE TRIGGER trg_wallet_ledger_immutable BEFORE UPDATE OR DELETE ON wallet_ledger
  FOR EACH ROW EXECUTE FUNCTION wallet_ledger_immutable();

-- Moves money. Returns {applied, balance_paise}; applied=false means this idem_key
-- was already used, so nothing changed (safe retry).
CREATE OR REPLACE FUNCTION wallet_apply(
  p_account    UUID,
  p_amount     BIGINT,
  p_kind       TEXT,
  p_ref        TEXT,
  p_idem_key   TEXT,
  p_created_by UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_balance BIGINT;
BEGIN
  IF p_amount = 0 THEN
    RAISE EXCEPTION 'amount_must_not_be_zero';
  END IF;

  INSERT INTO wallet_balances (account_id) VALUES (p_account) ON CONFLICT DO NOTHING;
  SELECT balance_paise INTO v_balance FROM wallet_balances WHERE account_id = p_account FOR UPDATE;

  IF EXISTS (SELECT 1 FROM wallet_ledger WHERE idem_key = p_idem_key) THEN
    RETURN jsonb_build_object('applied', false, 'balance_paise', v_balance);
  END IF;

  IF v_balance + p_amount < 0 THEN
    RAISE EXCEPTION 'insufficient_funds';
  END IF;

  v_balance := v_balance + p_amount;
  UPDATE wallet_balances SET balance_paise = v_balance, updated_at = now() WHERE account_id = p_account;
  INSERT INTO wallet_ledger (account_id, kind, amount_paise, balance_after, ref, idem_key, created_by)
  VALUES (p_account, p_kind, p_amount, v_balance, p_ref, p_idem_key, p_created_by);

  RETURN jsonb_build_object('applied', true, 'balance_paise', v_balance);
END;
$$;
REVOKE ALL ON FUNCTION wallet_apply(UUID, BIGINT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------- plans
CREATE TABLE IF NOT EXISTS plans (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  monthly_paise       BIGINT NOT NULL CHECK (monthly_paise > 0),
  seats               INT,            -- NULL = unlimited
  contacts            INT,
  ai_replies          INT NOT NULL,
  popular             BOOLEAN NOT NULL DEFAULT FALSE,
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  razorpay_plan_monthly TEXT,
  razorpay_plan_yearly  TEXT
);
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plans_select ON plans;
CREATE POLICY plans_select ON plans FOR SELECT USING (active);

INSERT INTO plans (id, name, monthly_paise, seats, contacts, ai_replies, popular) VALUES
  ('starter', 'Starter',  99900,  2,  1000, 1000,  FALSE),
  ('growth',  'Growth',  249900,  5, 10000, 5000,  TRUE),
  ('pro',     'Pro',     599900, 15,  NULL, 20000, FALSE)
ON CONFLICT (id) DO NOTHING;

-- --------------------------------------------------------- subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  account_id               UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  plan_id                  TEXT NOT NULL REFERENCES plans(id),
  cycle                    TEXT NOT NULL DEFAULT 'monthly' CHECK (cycle IN ('monthly', 'yearly')),
  status                   TEXT NOT NULL DEFAULT 'trialing'
                           CHECK (status IN ('trialing', 'active', 'past_due', 'cancelled', 'expired')),
  trial_ends_at            TIMESTAMPTZ NOT NULL,
  current_period_end       TIMESTAMPTZ,
  cancel_at_period_end     BOOLEAN NOT NULL DEFAULT FALSE,
  razorpay_subscription_id TEXT UNIQUE,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscriptions_select ON subscriptions;
CREATE POLICY subscriptions_select ON subscriptions FOR SELECT USING (is_account_member(account_id));

-- ------------------------------------------------------- orders and events
CREATE TABLE IF NOT EXISTS payment_orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  purpose             TEXT NOT NULL CHECK (purpose IN ('topup')),
  razorpay_order_id   TEXT NOT NULL UNIQUE,
  base_paise          BIGINT NOT NULL CHECK (base_paise > 0),   -- credited to the wallet
  gst_paise           BIGINT NOT NULL CHECK (gst_paise >= 0),
  total_paise         BIGINT NOT NULL CHECK (total_paise = base_paise + gst_paise),
  status              TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed')),
  razorpay_payment_id TEXT UNIQUE,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at             TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_payment_orders_account ON payment_orders(account_id, created_at DESC);
ALTER TABLE payment_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_orders_select ON payment_orders;
CREATE POLICY payment_orders_select ON payment_orders FOR SELECT USING (is_account_member(account_id, 'admin'));

-- One row per Razorpay webhook delivery, so a repeat is recognised and ignored.
CREATE TABLE IF NOT EXISTS razorpay_events (
  event_id     TEXT PRIMARY KEY,
  event_type   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'processed', 'failed', 'ignored')),
  payload      JSONB NOT NULL,
  error        TEXT,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
ALTER TABLE razorpay_events ENABLE ROW LEVEL SECURITY;  -- service role only

-- --------------------------------------------------------------- invoices
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq;

CREATE OR REPLACE FUNCTION next_invoice_number() RETURNS TEXT
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 'INV-' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY') || '-' || lpad(nextval('invoice_number_seq')::text, 6, '0');
$$;
REVOKE ALL ON FUNCTION next_invoice_number() FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS invoices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  number              TEXT NOT NULL UNIQUE,
  kind                TEXT NOT NULL CHECK (kind IN ('topup', 'subscription')),
  description         TEXT NOT NULL DEFAULT '',
  base_paise          BIGINT NOT NULL,
  gst_paise           BIGINT NOT NULL,
  total_paise         BIGINT NOT NULL CHECK (total_paise = base_paise + gst_paise),
  razorpay_payment_id TEXT NOT NULL UNIQUE,
  issued_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoices_account ON invoices(account_id, issued_at DESC);
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoices_select ON invoices;
CREATE POLICY invoices_select ON invoices FOR SELECT USING (is_account_member(account_id, 'admin'));
