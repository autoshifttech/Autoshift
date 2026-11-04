-- 071_support_and_announcements.sql
--
-- Support tickets a business opens from the help button, the replies, and staff-only notes;
-- announcements staff publish to businesses. Written only by the backend.
CREATE TABLE IF NOT EXISTS support_tickets (
  number      BIGINT GENERATED ALWAYS AS IDENTITY (START WITH 1041) PRIMARY KEY,
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  subject     TEXT NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 160),
  category    TEXT NOT NULL CHECK (category IN ('WhatsApp connection', 'Billing', 'Templates', 'AI assistant', 'Bug', 'Other')),
  priority    TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'closed')),
  assignee    TEXT,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_account ON support_tickets(account_id, number DESC);
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS support_tickets_select ON support_tickets;
CREATE POLICY support_tickets_select ON support_tickets FOR SELECT USING (is_account_member(account_id));

CREATE TABLE IF NOT EXISTS support_messages (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket      BIGINT NOT NULL REFERENCES support_tickets(number) ON DELETE CASCADE,
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  sender      TEXT NOT NULL CHECK (sender IN ('business', 'admin', 'note')),
  author      TEXT NOT NULL DEFAULT '',
  text        TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 5000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages(ticket, id);
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;
-- A business never sees staff-only notes.
DROP POLICY IF EXISTS support_messages_select ON support_messages;
CREATE POLICY support_messages_select ON support_messages FOR SELECT USING (sender <> 'note' AND is_account_member(account_id));

CREATE TABLE IF NOT EXISTS announcements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body        TEXT NOT NULL DEFAULT '' CHECK (char_length(body) <= 2000),
  kind        TEXT NOT NULL DEFAULT 'news' CHECK (kind IN ('news', 'maintenance', 'banner')),
  audience    TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'trial', 'paying', 'starter', 'growth', 'pro')),
  draft       BOOLEAN NOT NULL DEFAULT FALSE,
  publish_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  views       INT NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;  -- service role only; businesses read through the backend
