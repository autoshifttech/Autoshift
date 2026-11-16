-- 082_shop_payments.sql
-- E-commerce in flows: the 'add_to_cart' step, and the Razorpay payment links (and UPI QR codes)
-- a flow sends to a customer, paid into the business's own Razorpay account.
ALTER TABLE flow_nodes DROP CONSTRAINT IF EXISTS flow_nodes_node_type_check;
ALTER TABLE flow_nodes ADD CONSTRAINT flow_nodes_node_type_check CHECK (node_type IN (
  'start', 'send_buttons', 'send_list', 'send_message', 'send_media', 'collect_input',
  'condition', 'set_tag', 'action', 'create_lead', 'add_to_cart', 'handoff', 'http_fetch', 'end'
));

CREATE TABLE IF NOT EXISTS payment_links (
  id                  UUID PRIMARY KEY,
  account_id          UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  connection_id       UUID REFERENCES flow_connections(id) ON DELETE SET NULL,
  contact_id          UUID,
  conversation_id     UUID,
  flow_run_id         UUID,
  lead_id             UUID,
  description         TEXT NOT NULL DEFAULT '',
  amount_paise        INTEGER NOT NULL CHECK (amount_paise >= 100),
  currency            TEXT NOT NULL DEFAULT 'INR',
  razorpay_link_id    TEXT UNIQUE,
  short_url           TEXT,
  razorpay_qr_id      TEXT UNIQUE,
  qr_image_url        TEXT,
  status              TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'expired', 'cancelled')),
  razorpay_payment_id TEXT,
  paid_at             TIMESTAMPTZ,
  notified_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_links_account ON payment_links(account_id, created_at DESC);
ALTER TABLE payment_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_links_select ON payment_links;
CREATE POLICY payment_links_select ON payment_links FOR SELECT USING (is_account_member(account_id));
-- Written only by the backend (service role).

-- redeem_invitation must not delete an old account that holds customer payments.
CREATE OR REPLACE FUNCTION public.redeem_invitation(
  p_token_hash TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_inv account_invitations%ROWTYPE;
  v_old_account_id UUID;
  v_old_account_owner UUID;
  v_has_other_members BOOLEAN;
  v_has_data BOOLEAN;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv
  FROM account_invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = '22023';
  END IF;
  IF v_inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invitation has already been redeemed'
      USING ERRCODE = '22023';
  END IF;
  IF v_inv.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = '22023';
  END IF;

  SELECT p.account_id, a.owner_user_id
  INTO v_old_account_id, v_old_account_owner
  FROM profiles p
  JOIN accounts a ON a.id = p.account_id
  WHERE p.user_id = v_caller_id
  FOR UPDATE OF p, a;

  IF v_old_account_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no profile' USING ERRCODE = '42501';
  END IF;

  IF v_old_account_id = v_inv.account_id THEN
    RAISE EXCEPTION 'You are already a member of this account'
      USING ERRCODE = '23505';
  END IF;

  IF v_old_account_owner <> v_caller_id THEN
    RAISE EXCEPTION 'You are already in a shared account; sign up with a different email to join this one'
      USING ERRCODE = '23505';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE account_id = v_old_account_id
      AND user_id <> v_caller_id
  ) INTO v_has_other_members;

  IF v_has_other_members THEN
    RAISE EXCEPTION 'Your account has other members; remove them or transfer ownership before joining another account'
      USING ERRCODE = '23505';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM contacts WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM conversations WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM broadcasts WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM automations WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM automation_logs WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM automation_pending_executions WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM flows WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM flow_runs WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM pipelines WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM deals WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM message_templates WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM tags WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM custom_fields WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM contact_notes WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM whatsapp_config WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM api_keys WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM webhook_endpoints WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM quick_replies WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM notifications WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM ai_configs WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM ai_knowledge_documents WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM ai_knowledge_chunks WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM ai_usage_log WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM assistants WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM flow_connections WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM payment_links WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM mcp_keys WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM support_tickets WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM support_messages WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM ai_tools WHERE account_id = v_old_account_id AND NOT builtin
    UNION ALL SELECT 1 FROM business_notes WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM billing_details WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM webhook_subscriptions WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM webhook_deliveries WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM wallet_balances WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM wallet_ledger WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM payment_orders WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM invoices WHERE account_id = v_old_account_id
    -- A trial that was never paid for holds nothing worth keeping.
    UNION ALL SELECT 1 FROM subscriptions WHERE account_id = v_old_account_id
      AND (status <> 'trialing' OR razorpay_subscription_id IS NOT NULL)
    LIMIT 1
  ) INTO v_has_data;

  IF v_has_data THEN
    RAISE EXCEPTION 'Your account already contains data; sign up with a different email to join this one'
      USING ERRCODE = '23505';
  END IF;

  UPDATE profiles
  SET account_id = v_inv.account_id,
      account_role = v_inv.role
  WHERE user_id = v_caller_id;

  UPDATE account_invitations
  SET accepted_at = NOW(),
      accepted_by_user_id = v_caller_id
  WHERE id = v_inv.id;

  DELETE FROM accounts WHERE id = v_old_account_id;

  RETURN v_inv.account_id;
END;
$$;

ALTER FUNCTION public.redeem_invitation(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.redeem_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_invitation(TEXT) TO authenticated;
