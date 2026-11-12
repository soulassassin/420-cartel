-- Migration: Enterprise POS System Extensions
-- Adds Multi-Branch Overrides, Dynamic Modifiers, Volume Pricing Tiers,
-- Stock Reservation Locks, and Multi-Tier Affiliate Commission Ledger.

-- 1. Commission Structure Type & Enhanced Affiliate Fields
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'commission_type') THEN
        CREATE TYPE commission_type AS ENUM ('FIXED_FEE_ORDER', 'MARGIN_PERCENT', 'REVENUE_PERCENT');
    END IF;
END$$;

ALTER TABLE affiliate_codes
    ADD COLUMN IF NOT EXISTS commission_type commission_type NOT NULL DEFAULT 'REVENUE_PERCENT',
    ADD COLUMN IF NOT EXISTS fixed_fee_cents BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- 2. Branch Specific Price Overrides
CREATE TABLE IF NOT EXISTS branch_product_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    override_price_cents BIGINT NOT NULL CHECK (override_price_cents >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (branch_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_product_prices_lookup 
    ON branch_product_prices (branch_id, product_id);

-- 3. Volume / Tiered Price Breaks
CREATE TABLE IF NOT EXISTS product_volume_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE, -- NULL means global
    min_qty INTEGER NOT NULL CHECK (min_qty > 0),
    unit_price_cents BIGINT NOT NULL CHECK (unit_price_cents >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_volume_tiers_lookup 
    ON product_volume_tiers (product_id, min_qty);

-- 4. Dynamic Product Modifiers & Options
CREATE TABLE IF NOT EXISTS product_modifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_name VARCHAR(100) NOT NULL, -- e.g. "Grind", "Custom Packaging", "Pre-Roll Cone"
    name VARCHAR(100) NOT NULL,
    price_delta_cents BIGINT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Inventory Reservations & Distributed Hold Locks
CREATE TABLE IF NOT EXISTS inventory_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_session_id VARCHAR(64) NOT NULL,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_reservations_session
    ON inventory_reservations (cart_session_id, expires_at);

CREATE INDEX IF NOT EXISTS idx_inventory_reservations_active
    ON inventory_reservations (branch_id, product_id, expires_at);

-- 6. Affiliate Commission Reconciled Ledger & Clawback Tracking
CREATE TABLE IF NOT EXISTS affiliate_commission_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affiliate_code_id UUID NOT NULL REFERENCES affiliate_codes(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL,
    commission_cents BIGINT NOT NULL,
    is_clawback BOOLEAN NOT NULL DEFAULT FALSE,
    reason VARCHAR(100) NOT NULL DEFAULT 'ORDER_SETTLEMENT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_commission_ledger_affiliate
    ON affiliate_commission_ledger (affiliate_code_id, created_at);

CREATE INDEX IF NOT EXISTS idx_affiliate_commission_ledger_order
    ON affiliate_commission_ledger (order_id);

-- Enable Row Level Security (RLS)
ALTER TABLE branch_product_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_volume_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_commission_ledger ENABLE ROW LEVEL SECURITY;

-- Default Read Policies
CREATE POLICY "Public read for modifiers" ON product_modifiers
    FOR SELECT USING (is_active = true);

CREATE POLICY "Public read for volume tiers" ON product_volume_tiers
    FOR SELECT USING (true);

CREATE POLICY "Public read for branch prices" ON branch_product_prices
    FOR SELECT USING (true);

-- Staff permissions for reservations & ledger
CREATE POLICY "Staff manage reservations" ON inventory_reservations
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Staff view commission ledger" ON affiliate_commission_ledger
    FOR SELECT USING (auth.role() = 'authenticated');

