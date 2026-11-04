-- 068_business_notes.sql
--
-- Private notes platform staff keep on a business ("called, wants a demo"). The business never sees them.
CREATE TABLE IF NOT EXISTS business_notes (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  author_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL DEFAULT '',
  text        TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 500),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_business_notes_account ON business_notes(account_id, id DESC);
ALTER TABLE business_notes ENABLE ROW LEVEL SECURITY;   -- no policy: service role only
