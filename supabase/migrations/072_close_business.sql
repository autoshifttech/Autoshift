-- 072_close_business.sql
--
-- Closing a business that has handled money. Its money records (wallet ledger and balance, orders,
-- invoices, subscription) and the audit log must be kept, and the ledger can't be edited, so the
-- account row stays as an anonymous "closed" shell. Everything else that belongs to it - customers,
-- chats, assistants, flows, keys - is deleted.
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_status_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_status_check CHECK (status IN ('active', 'suspended', 'closed'));
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
-- The owner asks to delete; it happens after a grace period during which they can change their mind.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS close_after TIMESTAMPTZ;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS close_reason TEXT;

CREATE OR REPLACE FUNCTION close_account_data(p_account UUID) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  -- Kept: the account shell, the people (moved elsewhere by the backend first), money and audit.
  v_keep TEXT[] := ARRAY['accounts', 'profiles', 'wallet_ledger', 'wallet_balances', 'invoices',
                         'payment_orders', 'subscriptions', 'audit_log', 'razorpay_events'];
  v_table TEXT;
  v_pass INT;
  v_blocked INT := 0;
  v_deleted BIGINT := 0;
  v_n BIGINT;
BEGIN
  -- Every table with an account_id, including ones added later. Tables that point at each other are
  -- retried in further passes until nothing is left (a child must go before its parent).
  FOR v_pass IN 1..8 LOOP
    v_blocked := 0;
    FOR v_table IN
      SELECT c.table_name FROM information_schema.columns c
      JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public' AND c.column_name = 'account_id' AND t.table_type = 'BASE TABLE'
        AND c.table_name <> ALL (v_keep)
    LOOP
      BEGIN
        EXECUTE format('DELETE FROM %I WHERE account_id = $1', v_table) USING p_account;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_deleted := v_deleted + v_n;
      EXCEPTION WHEN foreign_key_violation THEN
        v_blocked := v_blocked + 1;
      END;
    END LOOP;
    EXIT WHEN v_blocked = 0;
  END LOOP;
  IF v_blocked > 0 THEN
    RAISE EXCEPTION 'close_account_data: % tables still hold rows for %', v_blocked, p_account;
  END IF;
  RETURN jsonb_build_object('deleted_rows', v_deleted, 'passes', v_pass);
END;
$$;
REVOKE ALL ON FUNCTION close_account_data(UUID) FROM PUBLIC, anon, authenticated;
