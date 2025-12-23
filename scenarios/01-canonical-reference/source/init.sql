-- =============================================================================
-- Source Database Schema
-- The Failure-Aware CDC Reference Pipeline
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- CUSTOMERS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS customers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_id     TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    email           TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    version         INTEGER NOT NULL DEFAULT 1
);

-- Index for soft-delete queries
CREATE INDEX idx_customers_deleted_at ON customers(deleted_at) WHERE deleted_at IS NULL;

-- =============================================================================
-- ORDERS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS orders (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_id     TEXT UNIQUE NOT NULL,
    customer_id     UUID NOT NULL REFERENCES customers(id),
    status          TEXT NOT NULL DEFAULT 'pending',
    subtotal        NUMERIC(10,2) NOT NULL DEFAULT 0,
    tax             NUMERIC(10,2) NOT NULL DEFAULT 0,
    total           NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    shipped_at      TIMESTAMPTZ,
    version         INTEGER NOT NULL DEFAULT 1,
    
    CONSTRAINT valid_status CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled'))
);

CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);

-- =============================================================================
-- ORDER ITEMS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS order_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    sku             TEXT NOT NULL,
    name            TEXT NOT NULL,
    quantity        INTEGER NOT NULL DEFAULT 1,
    unit_price      NUMERIC(10,2) NOT NULL,
    line_total      NUMERIC(10,2) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT positive_quantity CHECK (quantity > 0)
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_sku ON order_items(sku);

-- =============================================================================
-- CDC EVENT LOG (for debugging)
-- =============================================================================
CREATE TABLE IF NOT EXISTS cdc_event_log (
    id              BIGSERIAL PRIMARY KEY,
    table_name      TEXT NOT NULL,
    operation       TEXT NOT NULL,
    record_id       UUID NOT NULL,
    old_data        JSONB,
    new_data        JSONB,
    captured_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- TRIGGERS FOR updated_at
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.version = OLD.version + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- PUBLICATION FOR DEBEZIUM
-- =============================================================================
DROP PUBLICATION IF EXISTS cdc_publication;
CREATE PUBLICATION cdc_publication FOR TABLE customers, orders, order_items;

-- =============================================================================
-- SEED DATA
-- =============================================================================

-- Insert initial customers
INSERT INTO customers (external_id, name, email) VALUES
    ('CUST-001', 'Alice Johnson', 'alice@example.com'),
    ('CUST-002', 'Bob Smith', 'bob@example.com'),
    ('CUST-003', 'Carol Williams', 'carol@example.com');

-- Insert initial orders
INSERT INTO orders (external_id, customer_id, status, subtotal, tax, total)
SELECT 
    'ORD-001',
    id,
    'confirmed',
    99.99,
    8.00,
    107.99
FROM customers WHERE external_id = 'CUST-001';

INSERT INTO orders (external_id, customer_id, status, subtotal, tax, total)
SELECT 
    'ORD-002',
    id,
    'pending',
    249.99,
    20.00,
    269.99
FROM customers WHERE external_id = 'CUST-002';

-- Insert initial order items
INSERT INTO order_items (order_id, sku, name, quantity, unit_price, line_total)
SELECT 
    o.id,
    'SKU-WIDGET-001',
    'Premium Widget',
    2,
    49.99,
    99.98
FROM orders o WHERE o.external_id = 'ORD-001';

INSERT INTO order_items (order_id, sku, name, quantity, unit_price, line_total)
SELECT 
    o.id,
    'SKU-GADGET-001',
    'Super Gadget',
    1,
    249.99,
    249.99
FROM orders o WHERE o.external_id = 'ORD-002';

-- Log initial seed
INSERT INTO cdc_event_log (table_name, operation, record_id, new_data)
SELECT 'customers', 'SEED', id, to_jsonb(customers.*) FROM customers;

RAISE NOTICE 'Source database initialized with seed data';
