-- 087_catalog_feed.sql
-- A business's own website can keep the product list up to date: AutoShift re-reads a product feed
-- link (CSV, Excel or JSON) every hour, or the website sends its products to the API.
ALTER TABLE product_catalog ADD COLUMN IF NOT EXISTS feed_url TEXT;
ALTER TABLE product_catalog ADD COLUMN IF NOT EXISTS feed_synced_at TIMESTAMPTZ;
ALTER TABLE product_catalog ADD COLUMN IF NOT EXISTS feed_error TEXT;
ALTER TABLE product_catalog ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'file';
