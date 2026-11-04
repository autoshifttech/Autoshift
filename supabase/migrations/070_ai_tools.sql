-- 070_ai_tools.sql
--
-- What an assistant can do in a chat: built-in tools (save a lead, add a tag, hand off ...) that a business
-- switches on or off, and its own tools that call a webhook. Assistants refer to tools by `key`.
-- Members can read; the backend writes (it checks webhook URLs are public https addresses).
CREATE TABLE IF NOT EXISTS ai_tools (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  key         TEXT NOT NULL CHECK (key ~ '^[a-z0-9_]{2,64}$'),
  builtin     BOOLEAN NOT NULL DEFAULT FALSE,
  category    TEXT NOT NULL DEFAULT 'custom' CHECK (category IN ('leads', 'messaging', 'team', 'custom')),
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  webhook     JSONB,
  calls       INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, key),
  CHECK (builtin OR webhook IS NOT NULL)
);
ALTER TABLE ai_tools ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_tools_select ON ai_tools;
CREATE POLICY ai_tools_select ON ai_tools FOR SELECT USING (is_account_member(account_id));
