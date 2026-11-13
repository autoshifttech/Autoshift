-- 075_custom_mcp_tools.sql
--
-- Custom MCP tools the AutoShift team defines in the admin panel. Each one calls a public https
-- webhook (for example an n8n workflow), signed with its own secret, and shows up for AI assistants
-- through the MCP tools custom_tools_list and custom_tool_run.
--   audience 'business' : any workspace key can use it (at least min_role), for its own business
--   audience 'platform' : only AutoShift staff keys
-- Only the backend (service role) reads or writes this table; nobody else gets access.
CREATE TABLE IF NOT EXISTS custom_mcp_tools (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL UNIQUE CHECK (name ~ '^[a-z][a-z0-9_]{1,47}$'),
  description      TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 1000),
  params           JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(params) = 'array'),
  webhook_url      TEXT NOT NULL CHECK (webhook_url LIKE 'https://%' AND char_length(webhook_url) <= 500),
  secret_cipher    TEXT NOT NULL,
  audience         TEXT NOT NULL DEFAULT 'platform' CHECK (audience IN ('platform', 'business')),
  min_role         TEXT NOT NULL DEFAULT 'agent' CHECK (min_role IN ('viewer', 'agent', 'admin', 'owner')),
  requires_confirm BOOLEAN NOT NULL DEFAULT TRUE,
  enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  calls            INT NOT NULL DEFAULT 0,
  last_called_at   TIMESTAMPTZ,
  last_status      INT,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE custom_mcp_tools ENABLE ROW LEVEL SECURITY;
-- No policies: browsers and logins can't read it (it holds encrypted webhook secrets); the backend uses the service role.
REVOKE ALL ON custom_mcp_tools FROM anon, authenticated;
