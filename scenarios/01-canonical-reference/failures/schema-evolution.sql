-- =============================================================================
-- Failure: Schema Evolution
-- =============================================================================
--
-- WHAT THIS DOES:
-- Adds a new column to the customers table mid-stream.
--
-- WHY IT MATTERS:
-- - Tests Debezium schema change event handling
-- - Reveals sink schema compatibility issues
-- - Shows forward vs backward compatibility
-- - Demonstrates the need for schema registry
--
-- EXPECTED BEHAVIOR:
-- - Debezium emits schema change event to schema change topic
-- - New events include the new column
-- - Existing events don't have the column (null handling)
-- - Sink must handle schema evolution gracefully
--
-- =============================================================================

-- Log the schema change
INSERT INTO cdc_event_log (table_name, operation, record_id, new_data)
VALUES ('_schema', 'ALTER_TABLE', '00000000-0000-0000-0000-000000000000', 
        '{"change": "ADD COLUMN tier", "table": "customers"}'::jsonb);

-- Perform the schema change
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS tier VARCHAR(20) DEFAULT 'standard';

-- Update some existing customers with the new column
UPDATE customers 
SET tier = CASE 
  WHEN random() < 0.2 THEN 'premium'
  WHEN random() < 0.5 THEN 'gold'
  ELSE 'standard'
END
WHERE tier IS NULL OR tier = 'standard';

-- Insert a new customer using the new column
INSERT INTO customers (external_id, name, email, tier)
VALUES (
  'CUST-' || to_char(nextval('customers_id_seq'::regclass), 'FM000'),
  'Schema Test Customer',
  'schema.test@example.com',
  'premium'
);

-- Log completion
INSERT INTO cdc_event_log (table_name, operation, record_id, new_data)
VALUES ('_schema', 'ALTER_TABLE_COMPLETE', '00000000-0000-0000-0000-000000000000',
        '{"change": "ADD COLUMN tier", "status": "complete"}'::jsonb);

-- Show the new schema
\d customers
