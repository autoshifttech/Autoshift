-- Flows → Connections: Cashfree joins Google and Razorpay. Its keys live, encrypted, in
-- flow_connection_secrets like the others; payment links use the same payment_links table
-- (razorpay_link_id holds the provider's link id for either provider).
ALTER TABLE flow_connections DROP CONSTRAINT IF EXISTS flow_connections_kind_check;
ALTER TABLE flow_connections ADD CONSTRAINT flow_connections_kind_check CHECK (kind IN ('google', 'razorpay', 'cashfree'));
