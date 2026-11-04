-- 066_outbound_webhooks.sql
--
-- Events AutoShift sends OUT to a business's own URL (n8n, Zapier, their server).
-- Service role only: the signing secret is stored encrypted and never leaves the backend.
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  url            TEXT NOT NULL CHECK (url LIKE 'https://%'),
  events         TEXT[] NOT NULL DEFAULT '{*}',
  label          TEXT NOT NULL DEFAULT '',
  secret_cipher  TEXT NOT NULL,
  enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_account ON webhook_subscriptions(account_id);
ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;   -- no policy: service role only

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  event           TEXT NOT NULL,
  payload         JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
  attempts        INT NOT NULL DEFAULT 0,
  last_status     INT,
  last_error      TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_due ON webhook_deliveries(next_attempt_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_sub ON webhook_deliveries(subscription_id, created_at DESC);
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;      -- no policy: service role only
