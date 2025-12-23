-- =============================================================================
-- Sink Database Schema
-- The Failure-Aware CDC Reference Pipeline
-- 
-- NOTE: Intentionally slightly different from source to demonstrate
-- schema evolution handling.
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- CUSTOMERS TABLE (matches source initially)
-- =============================================================================
CREATE TABLE IF NOT EXISTS customers (
    id              UUID PRIMARY KEY,
    external_id     TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    email           TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL,
    deleted_at      TIMESTAMPTZ,
    version         INTEGER NOT NULL DEFAULT 1,
    
    -- CDC metadata columns
    _cdc_source_ts  TIMESTAMPTZ,
    _cdc_op         TEXT,
    _cdc_lsn        TEXT,
    _cdc_received   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sink_customers_deleted ON customers(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_sink_customers_cdc_lsn ON customers(_cdc_lsn);

-- =============================================================================
-- ORDERS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS orders (
    id              UUID PRIMARY KEY,
    external_id     TEXT UNIQUE NOT NULL,
    customer_id     UUID NOT NULL,
    status          TEXT NOT NULL,
    subtotal        NUMERIC(10,2) NOT NULL,
    tax             NUMERIC(10,2) NOT NULL,
    total           NUMERIC(10,2) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL,
    shipped_at      TIMESTAMPTZ,
    version         INTEGER NOT NULL DEFAULT 1,
    
    -- CDC metadata columns
    _cdc_source_ts  TIMESTAMPTZ,
    _cdc_op         TEXT,
    _cdc_lsn        TEXT,
    _cdc_received   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sink_orders_customer ON orders(customer_id);
CREATE INDEX idx_sink_orders_status ON orders(status);
CREATE INDEX idx_sink_orders_cdc_lsn ON orders(_cdc_lsn);

-- =============================================================================
-- ORDER ITEMS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS order_items (
    id              UUID PRIMARY KEY,
    order_id        UUID NOT NULL,
    sku             TEXT NOT NULL,
    name            TEXT NOT NULL,
    quantity        INTEGER NOT NULL,
    unit_price      NUMERIC(10,2) NOT NULL,
    line_total      NUMERIC(10,2) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL,
    
    -- CDC metadata columns
    _cdc_source_ts  TIMESTAMPTZ,
    _cdc_op         TEXT,
    _cdc_lsn        TEXT,
    _cdc_received   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sink_items_order ON order_items(order_id);
CREATE INDEX idx_sink_items_cdc_lsn ON order_items(_cdc_lsn);

-- =============================================================================
-- DEDUPLICATION TRACKING TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS _cdc_dedup (
    topic           TEXT NOT NULL,
    partition       INTEGER NOT NULL,
    offset_value    BIGINT NOT NULL,
    record_key      TEXT NOT NULL,
    processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (topic, partition, offset_value)
);

CREATE INDEX idx_cdc_dedup_key ON _cdc_dedup(record_key);
CREATE INDEX idx_cdc_dedup_time ON _cdc_dedup(processed_at);

-- Cleanup old dedup records (keep 24 hours)
CREATE OR REPLACE FUNCTION cleanup_dedup_records()
RETURNS void AS $$
BEGIN
    DELETE FROM _cdc_dedup WHERE processed_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- CDC PROCESSING LOG
-- =============================================================================
CREATE TABLE IF NOT EXISTS _cdc_processing_log (
    id              BIGSERIAL PRIMARY KEY,
    event_type      TEXT NOT NULL,
    table_name      TEXT,
    record_id       TEXT,
    details         JSONB,
    logged_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cdc_log_type ON _cdc_processing_log(event_type);
CREATE INDEX idx_cdc_log_time ON _cdc_processing_log(logged_at);

-- =============================================================================
-- SCHEMA EVOLUTION HELPER
-- =============================================================================
-- This function adds missing columns to sink tables when source schema changes.
-- Called by the consumer when it detects new fields in CDC events.

CREATE OR REPLACE FUNCTION add_column_if_missing(
    p_table_name TEXT,
    p_column_name TEXT,
    p_column_type TEXT DEFAULT 'TEXT'
) RETURNS BOOLEAN AS $$
DECLARE
    v_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = p_table_name 
        AND column_name = p_column_name
    ) INTO v_exists;
    
    IF NOT v_exists THEN
        EXECUTE format('ALTER TABLE %I ADD COLUMN %I %s', 
                       p_table_name, p_column_name, p_column_type);
        
        INSERT INTO _cdc_processing_log (event_type, table_name, details)
        VALUES ('SCHEMA_EVOLUTION', p_table_name, 
                jsonb_build_object('column', p_column_name, 'type', p_column_type));
        
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Pre-add the 'tier' column to handle the schema evolution demo
-- This makes the demo more resilient (column exists before ALTER TABLE on source)
-- In production, you'd either:
-- 1. Use Schema Registry with auto-evolve
-- 2. Run migrations ahead of source changes
-- 3. Have the consumer detect and add columns dynamically

-- Note: We're NOT adding tier here - we'll let the demo show what happens
-- when schema evolves and sink needs to adapt

RAISE NOTICE 'Sink database initialized';
