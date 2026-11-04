-- 061_backend_foundation.sql
--
-- Tables the FastAPI backend needs for data that lived only in the browser:
-- AI assistants, flow connections (with secrets kept apart), platform AI
-- providers and models, platform admins and the audit log.
--
-- Tenant rules follow migration 017: members of an account can read its rows,
-- admins and owners can change them. Tables with no policy at all are reachable
-- only with the service-role key (the backend), never from a browser.

-- ---------------------------------------------------------------- assistants
CREATE TABLE IF NOT EXISTS assistants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name          TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  role          TEXT NOT NULL DEFAULT 'custom',
  color         TEXT NOT NULL DEFAULT '#1E4C41',
  enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  tone          TEXT NOT NULL DEFAULT 'friendly'
                CHECK (tone IN ('friendly', 'professional', 'concise')),
  instructions  TEXT NOT NULL DEFAULT '',
  greeting      TEXT NOT NULL DEFAULT '',
  provider      TEXT NOT NULL DEFAULT 'openai',
  model_id      TEXT NOT NULL DEFAULT '',
  knowledge     JSONB NOT NULL DEFAULT '[]'::jsonb,
  tool_ids      TEXT[] NOT NULL DEFAULT '{}',
  capture_leads BOOLEAN NOT NULL DEFAULT FALSE,
  audience      TEXT NOT NULL DEFAULT 'all'
                CHECK (audience IN ('all', 'new_contacts', 'tagged', 'after_hours')),
  tags          TEXT[] NOT NULL DEFAULT '{}',
  handoff       JSONB NOT NULL DEFAULT '{"onRequest": true, "onUnknown": true, "maxReplies": 15}'::jsonb,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assistants_account ON assistants(account_id, created_at);
ALTER TABLE assistants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assistants_select ON assistants;
DROP POLICY IF EXISTS assistants_insert ON assistants;
DROP POLICY IF EXISTS assistants_update ON assistants;
DROP POLICY IF EXISTS assistants_delete ON assistants;
CREATE POLICY assistants_select ON assistants FOR SELECT USING (is_account_member(account_id));
CREATE POLICY assistants_insert ON assistants FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY assistants_update ON assistants FOR UPDATE USING (is_account_member(account_id, 'admin'));
CREATE POLICY assistants_delete ON assistants FOR DELETE USING (is_account_member(account_id, 'admin'));

-- --------------------------------------------------------- flow connections
-- The row users can read holds only what is safe to show (an email, a masked
-- key id). The secret itself lives in flow_connection_secrets, which has no
-- policy: only the backend (service role) can read or write it.
CREATE TABLE IF NOT EXISTS flow_connections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('google', 'razorpay')),
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  detail      TEXT NOT NULL DEFAULT '',
  mode        TEXT,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flow_connections_account ON flow_connections(account_id, created_at);
ALTER TABLE flow_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS flow_connections_select ON flow_connections;
DROP POLICY IF EXISTS flow_connections_insert ON flow_connections;
DROP POLICY IF EXISTS flow_connections_delete ON flow_connections;
CREATE POLICY flow_connections_select ON flow_connections FOR SELECT USING (is_account_member(account_id));
CREATE POLICY flow_connections_insert ON flow_connections FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY flow_connections_delete ON flow_connections FOR DELETE USING (is_account_member(account_id, 'admin'));

CREATE TABLE IF NOT EXISTS flow_connection_secrets (
  connection_id UUID PRIMARY KEY REFERENCES flow_connections(id) ON DELETE CASCADE,
  ciphertext    TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE flow_connection_secrets ENABLE ROW LEVEL SECURITY;  -- no policy: service role only

-- ----------------------------------------------------------- platform admins
CREATE TABLE IF NOT EXISTS platform_admins (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'support'
              CHECK (role IN ('super_admin', 'finance', 'support', 'read_only')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;  -- no policy: service role only

-- ------------------------------------------------- platform AI providers/models
-- Set up in the admin panel. The key is encrypted by the backend; users never
-- see it. Businesses see only which providers and models are switched on.
CREATE TABLE IF NOT EXISTS platform_ai_providers (
  vendor         TEXT PRIMARY KEY
                 CHECK (vendor IN ('openai', 'google', 'anthropic', 'deepseek', 'deepinfra')),
  enabled        BOOLEAN NOT NULL DEFAULT FALSE,
  key_ciphertext TEXT,
  key_tail       TEXT,
  saved_at       TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE platform_ai_providers ENABLE ROW LEVEL SECURITY;  -- service role only

CREATE TABLE IF NOT EXISTS platform_ai_models (
  vendor     TEXT NOT NULL REFERENCES platform_ai_providers(vendor) ON DELETE CASCADE,
  model_id   TEXT NOT NULL,
  label      TEXT NOT NULL,
  tier       TEXT NOT NULL DEFAULT 'balanced'
             CHECK (tier IN ('newest', 'flagship', 'balanced', 'fast', 'reasoning', 'preview', 'value')),
  enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  is_custom  BOOLEAN NOT NULL DEFAULT FALSE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (vendor, model_id)
);
-- At most one default model on the platform.
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_ai_models_default
  ON platform_ai_models ((TRUE)) WHERE is_default;
ALTER TABLE platform_ai_models ENABLE ROW LEVEL SECURITY;  -- service role only

INSERT INTO platform_ai_providers (vendor, enabled) VALUES
  ('openai', FALSE), ('google', FALSE), ('anthropic', FALSE), ('deepseek', FALSE), ('deepinfra', FALSE)
ON CONFLICT (vendor) DO NOTHING;

-- --------------------------------------------------------------- audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  account_id  UUID REFERENCES accounts(id) ON DELETE SET NULL,
  scope       TEXT NOT NULL CHECK (scope IN ('account', 'platform')),
  action      TEXT NOT NULL,
  target      TEXT NOT NULL DEFAULT '',
  details     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_account ON audit_log(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_scope ON audit_log(scope, created_at DESC);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Account owners and admins may read their own account's trail.
DROP POLICY IF EXISTS audit_log_select ON audit_log;
CREATE POLICY audit_log_select ON audit_log FOR SELECT
  USING (scope = 'account' AND account_id IS NOT NULL AND is_account_member(account_id, 'admin'));

-- ------------------------------------------------- keep updated_at honest
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assistants_updated ON assistants;
CREATE TRIGGER trg_assistants_updated BEFORE UPDATE ON assistants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
