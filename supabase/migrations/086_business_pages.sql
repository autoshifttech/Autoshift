-- 086_business_pages.sql
-- What a business uses AutoShift for, and which pages it gets.
--   business_type : chosen at sign-up (retail = shop / e-commerce, clinic, salon, real_estate, education,
--                   restaurant, services, other). It sets the starting pages.
--   shop_source   : for shops, where products and orders are managed (whatsapp, shopify, website).
--   pages         : the optional pages switched on for this business. NULL means every page (existing
--                   businesses keep everything until the AutoShift team changes it). Core pages (dashboard,
--                   inbox, contacts, AI agents, settings, wallet, support) are always on.
-- Only the AutoShift team changes pages (through the backend); members can read them.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS business_type TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS shop_source TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS pages TEXT[];
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_business_type_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_business_type_check
  CHECK (business_type IS NULL OR business_type IN ('retail', 'restaurant', 'clinic', 'salon', 'real_estate', 'education', 'services', 'other'));
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_shop_source_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_shop_source_check
  CHECK (shop_source IS NULL OR shop_source IN ('whatsapp', 'shopify', 'website'));
