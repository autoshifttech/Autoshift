-- Shopify and WooCommerce on Flows → Connections. Products sync into product_catalog every hour;
-- paid or cash-on-delivery WhatsApp orders are created in the store; the store's status comes back.
ALTER TABLE flow_connections DROP CONSTRAINT IF EXISTS flow_connections_kind_check;
ALTER TABLE flow_connections ADD CONSTRAINT flow_connections_kind_check
  CHECK (kind IN ('google', 'razorpay', 'cashfree', 'shopify', 'woocommerce'));
-- Options that aren't secret (send orders, sync products).
ALTER TABLE flow_connections ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE product_catalog ADD COLUMN IF NOT EXISTS store_connection_id UUID REFERENCES flow_connections(id) ON DELETE SET NULL;

ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS ext_source TEXT;
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS ext_order_id TEXT;
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS ext_order_name TEXT;
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS ext_error TEXT;
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS ext_synced_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_shop_orders_ext_pending ON shop_orders(created_at) WHERE ext_order_id IS NULL AND payment_status IN ('paid', 'cod');
CREATE INDEX IF NOT EXISTS idx_shop_orders_ext_open ON shop_orders(created_at) WHERE ext_order_id IS NOT NULL AND status IN ('new', 'packed', 'shipped');
