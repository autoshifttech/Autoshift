-- Flows can start when a customer's payment is confirmed (Razorpay / Cashfree webhook).
ALTER TABLE flows DROP CONSTRAINT IF EXISTS flows_trigger_type_check;
ALTER TABLE flows
  ADD CONSTRAINT flows_trigger_type_check
  CHECK (trigger_type IN ('keyword', 'first_inbound_message', 'manual', 'payment_received'));
