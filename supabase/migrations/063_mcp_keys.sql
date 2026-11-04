-- 063_mcp_keys.sql
--
-- API keys for the MCP server and automation tools (n8n). Only a SHA-256 hash is
-- stored; the key itself is shown once at creation. No policies: service role only.
--
--   kind  'account'  acts as its owner inside one workspace (role re-read on every call)
--         'platform' acts as platform staff (owner must be in platform_admins)
--   scope 'read'     GET requests only
--         'write'      everything its owner's role allows
CREATE TABLE IF NOT EXISTS mcp_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash     TEXT NOT NULL UNIQUE,
  prefix       TEXT NOT NULL,
  name         TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  kind         TEXT NOT NULL CHECK (kind IN ('account', 'platform')),
  scope        TEXT NOT NULL CHECK (scope IN ('read', 'write')),
  account_id   UUID REFERENCES accounts(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at   TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((kind = 'account' AND account_id IS NOT NULL) OR (kind = 'platform' AND account_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_mcp_keys_account ON mcp_keys(account_id, created_at DESC);
ALTER TABLE mcp_keys ENABLE ROW LEVEL SECURITY;  -- service role only
