-- 085_shop_orders.sql
-- Orders the AI shop assistant takes on WhatsApp. The assistant helps the customer choose from
-- the product list, then places the order: prices always come from the product list, never from
-- the AI. Online orders get a Razorpay payment link on the business's own account; cash on
-- delivery orders are confirmed straight away. The business follows them on the Orders page.
CREATE TABLE IF NOT EXISTS shop_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  number          INTEGER NOT NULL,
  assistant_id    UUID REFERENCES assistants(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  lead_id         UUID REFERENCES deals(id) ON DELETE SET NULL,
  items           JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal_paise  BIGINT NOT NULL DEFAULT 0,
  delivery_paise  BIGINT NOT NULL DEFAULT 0,
  total_paise     BIGINT NOT NULL DEFAULT 0,
  customer_name   TEXT NOT NULL DEFAULT '',
  customer_phone  TEXT NOT NULL DEFAULT '',
  address         TEXT NOT NULL DEFAULT '',
  note            TEXT NOT NULL DEFAULT '',
  payment_method  TEXT NOT NULL CHECK (payment_method IN ('online', 'cod')),
  payment_status  TEXT NOT NULL DEFAULT 'awaiting' CHECK (payment_status IN ('awaiting', 'paid', 'cod', 'expired', 'refunded')),
  status          TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'packed', 'shipped', 'delivered', 'cancelled')),
  payment_link_id UUID REFERENCES payment_links(id) ON DELETE SET NULL,
  payment_url     TEXT,
  tracking        TEXT NOT NULL DEFAULT '',
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, number)
);
CREATE INDEX IF NOT EXISTS idx_shop_orders_account_created ON shop_orders(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_orders_contact ON shop_orders(contact_id, created_at DESC);
ALTER TABLE shop_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shop_orders_select ON shop_orders;
CREATE POLICY shop_orders_select ON shop_orders FOR SELECT USING (is_account_member(account_id));
-- Written only by the backend (service role).

ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES shop_orders(id) ON DELETE SET NULL;

-- The shop settings of an assistant: take orders, payment options, delivery charge.
ALTER TABLE assistants ADD COLUMN IF NOT EXISTS shop JSONB NOT NULL DEFAULT '{}'::jsonb;

-- redeem_invitation must not delete an old account that holds shop orders.
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
    UNION ALL SELECT 1 FROM product_catalog WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM shop_orders WHERE account_id = v_old_account_id
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
