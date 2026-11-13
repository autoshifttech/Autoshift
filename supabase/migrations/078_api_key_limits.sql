-- 078_api_key_limits.sql
--
-- Safety for API keys (MCP and automation tools):
--   api_key_usage   : how much each key used today (messages sent, broadcast recipients, AI replies),
--                     checked against daily limits (platform_settings 'api_key_limits').
--   api_idempotency : remembers the answer to a request id, so a retried send never goes out twice.
-- Only the backend (service role) reads or writes these.
CREATE TABLE IF NOT EXISTS public.api_key_usage (
  key_id  UUID NOT NULL REFERENCES public.mcp_keys(id) ON DELETE CASCADE,
  day     DATE NOT NULL,
  metric  TEXT NOT NULL CHECK (metric IN ('messages', 'broadcast_recipients', 'ai_replies')),
  used    INT NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, day, metric)
);
ALTER TABLE public.api_key_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_key_usage FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.api_idempotency (
  key_id      UUID NOT NULL REFERENCES public.mcp_keys(id) ON DELETE CASCADE,
  request_id  TEXT NOT NULL CHECK (char_length(request_id) BETWEEN 1 AND 100),
  route       TEXT NOT NULL,
  response    JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (key_id, request_id)
);
ALTER TABLE public.api_idempotency ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_idempotency FROM anon, authenticated;
