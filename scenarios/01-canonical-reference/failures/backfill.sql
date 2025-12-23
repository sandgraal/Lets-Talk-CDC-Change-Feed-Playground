-- =============================================================================
-- Failure: Backfill
-- =============================================================================
--
-- WHAT THIS DOES:
-- Inserts historical data directly into the source database,
-- simulating a data migration or backfill operation.
--
-- WHY IT MATTERS:
-- - Tests ordering guarantees (offset order vs timestamp order)
-- - Reveals merge vs replace semantics at sink
-- - Shows the difference between CDC time and business time
-- - Demonstrates the challenges of mixing batch and streaming
--
-- EXPECTED BEHAVIOR:
-- - Historical records are captured by CDC as new inserts
-- - Records appear in Kafka with current timestamps
-- - Sink receives them in offset order, not created_at order
-- - Business logic must handle "late arriving" data
--
-- =============================================================================

-- Log the backfill start
INSERT INTO cdc_event_log (table_name, operation, record_id, new_data)
VALUES ('_backfill', 'START', '00000000-0000-0000-0000-000000000000',
        '{"reason": "Historical data migration", "rows": 50}'::jsonb);

-- Insert historical customers (with old timestamps)
INSERT INTO customers (external_id, name, email, created_at, updated_at)
SELECT 
  'HIST-CUST-' || to_char(n, 'FM000'),
  'Historical Customer ' || n,
  'historical.' || n || '@legacy.example.com',
  NOW() - INTERVAL '1 year' - (n || ' days')::interval,
  NOW() - INTERVAL '6 months' - (n || ' days')::interval
FROM generate_series(1, 20) AS n
ON CONFLICT (external_id) DO NOTHING;

-- Insert historical orders (with old timestamps)
WITH hist_customers AS (
  SELECT id, external_id 
  FROM customers 
  WHERE external_id LIKE 'HIST-CUST-%'
  LIMIT 20
)
INSERT INTO orders (external_id, customer_id, status, subtotal, tax, total, created_at, updated_at)
SELECT 
  'HIST-ORD-' || to_char(row_number() OVER (), 'FM000'),
  hc.id,
  'delivered',
  round((random() * 200 + 50)::numeric, 2),
  round((random() * 20 + 5)::numeric, 2),
  round((random() * 220 + 55)::numeric, 2),
  NOW() - INTERVAL '11 months' - ((row_number() OVER ()) || ' days')::interval,
  NOW() - INTERVAL '10 months' - ((row_number() OVER ()) || ' days')::interval
FROM hist_customers hc
ON CONFLICT (external_id) DO NOTHING;

-- Insert historical order items
WITH hist_orders AS (
  SELECT id, external_id
  FROM orders
  WHERE external_id LIKE 'HIST-ORD-%'
)
INSERT INTO order_items (order_id, sku, name, quantity, unit_price, line_total, created_at)
SELECT 
  ho.id,
  'HIST-SKU-' || to_char((random() * 10 + 1)::int, 'FM00'),
  'Legacy Product ' || (random() * 10 + 1)::int,
  (random() * 5 + 1)::int,
  round((random() * 50 + 10)::numeric, 2),
  round((random() * 100 + 20)::numeric, 2),
  NOW() - INTERVAL '11 months'
FROM hist_orders ho;

-- Log the backfill completion
INSERT INTO cdc_event_log (table_name, operation, record_id, new_data)
VALUES ('_backfill', 'COMPLETE', '00000000-0000-0000-0000-000000000000',
        jsonb_build_object(
          'customers_added', (SELECT count(*) FROM customers WHERE external_id LIKE 'HIST-CUST-%'),
          'orders_added', (SELECT count(*) FROM orders WHERE external_id LIKE 'HIST-ORD-%'),
          'items_added', (SELECT count(*) FROM order_items WHERE sku LIKE 'HIST-SKU-%')
        ));

-- Show what was added
SELECT 
  'Backfill Summary' as info,
  (SELECT count(*) FROM customers WHERE external_id LIKE 'HIST-CUST-%') as historical_customers,
  (SELECT count(*) FROM orders WHERE external_id LIKE 'HIST-ORD-%') as historical_orders,
  (SELECT count(*) FROM order_items WHERE sku LIKE 'HIST-SKU-%') as historical_items;
