/**
 * Data Generator for The Failure-Aware CDC Reference Pipeline
 *
 * Continuously generates realistic database operations to stress-test
 * the CDC pipeline under various failure conditions.
 */

import pg from "pg";

const { Pool } = pg;

const config = {
  host: process.env.SOURCE_HOST || "localhost",
  port: parseInt(process.env.SOURCE_PORT || "5432"),
  user: process.env.SOURCE_USER || "postgres",
  password: process.env.SOURCE_PASSWORD || "postgres",
  database: process.env.SOURCE_DB || "source",
};

const intervalMs = parseInt(process.env.INTERVAL_MS || "2000");
const maxOps = parseInt(process.env.MAX_OPS || "0");

const pool = new Pool(config);

let opCount = 0;
let customerCount = 3; // From seed data
let orderCount = 2; // From seed data

const operations = [
  "insert_customer",
  "update_customer",
  "insert_order",
  "update_order_status",
  "add_order_item",
  "soft_delete_customer",
];

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomId(prefix, max) {
  return `${prefix}-${String(Math.floor(Math.random() * max) + 1).padStart(
    3,
    "0"
  )}`;
}

async function insertCustomer() {
  customerCount++;
  const externalId = `CUST-${String(customerCount).padStart(3, "0")}`;
  const names = [
    "David",
    "Emma",
    "Frank",
    "Grace",
    "Henry",
    "Ivy",
    "Jack",
    "Kate",
  ];
  const name = `${randomChoice(names)} ${randomChoice([
    "Brown",
    "Davis",
    "Miller",
    "Wilson",
    "Moore",
  ])}`;
  const email = `${name.toLowerCase().replace(" ", ".")}@example.com`;

  await pool.query(
    "INSERT INTO customers (external_id, name, email) VALUES ($1, $2, $3)",
    [externalId, name, email]
  );

  console.log(`[INSERT] Customer: ${externalId} - ${name}`);
}

async function updateCustomer() {
  const result = await pool.query(
    "SELECT id, external_id, email FROM customers WHERE deleted_at IS NULL ORDER BY RANDOM() LIMIT 1"
  );

  if (result.rows.length === 0) return;

  const customer = result.rows[0];
  const newEmail = customer.email.replace(
    "@example.com",
    `+${Date.now()}@example.com`
  );

  await pool.query("UPDATE customers SET email = $1 WHERE id = $2", [
    newEmail,
    customer.id,
  ]);

  console.log(
    `[UPDATE] Customer: ${customer.external_id} email -> ${newEmail}`
  );
}

async function insertOrder() {
  const customerResult = await pool.query(
    "SELECT id, external_id FROM customers WHERE deleted_at IS NULL ORDER BY RANDOM() LIMIT 1"
  );

  if (customerResult.rows.length === 0) return;

  orderCount++;
  const customer = customerResult.rows[0];
  const externalId = `ORD-${String(orderCount).padStart(3, "0")}`;
  const subtotal = (Math.random() * 500 + 10).toFixed(2);
  const tax = (parseFloat(subtotal) * 0.08).toFixed(2);
  const total = (parseFloat(subtotal) + parseFloat(tax)).toFixed(2);

  await pool.query(
    "INSERT INTO orders (external_id, customer_id, status, subtotal, tax, total) VALUES ($1, $2, $3, $4, $5, $6)",
    [externalId, customer.id, "pending", subtotal, tax, total]
  );

  console.log(
    `[INSERT] Order: ${externalId} for ${customer.external_id} - $${total}`
  );
}

async function updateOrderStatus() {
  const statusTransitions = {
    pending: "confirmed",
    confirmed: "shipped",
    shipped: "delivered",
  };

  const result = await pool.query(
    `SELECT id, external_id, status FROM orders 
     WHERE status NOT IN ('delivered', 'cancelled') 
     ORDER BY RANDOM() LIMIT 1`
  );

  if (result.rows.length === 0) return;

  const order = result.rows[0];
  const newStatus = statusTransitions[order.status] || "confirmed";
  const shippedAt = newStatus === "shipped" ? new Date().toISOString() : null;

  await pool.query(
    "UPDATE orders SET status = $1, shipped_at = COALESCE($2::timestamptz, shipped_at) WHERE id = $3",
    [newStatus, shippedAt, order.id]
  );

  console.log(
    `[UPDATE] Order: ${order.external_id} status: ${order.status} -> ${newStatus}`
  );
}

async function addOrderItem() {
  const orderResult = await pool.query(
    "SELECT id, external_id FROM orders ORDER BY RANDOM() LIMIT 1"
  );

  if (orderResult.rows.length === 0) return;

  const order = orderResult.rows[0];
  const skus = [
    "SKU-WIDGET-001",
    "SKU-GADGET-001",
    "SKU-GIZMO-001",
    "SKU-TOOL-001",
    "SKU-PART-001",
  ];
  const names = [
    "Premium Widget",
    "Super Gadget",
    "Mega Gizmo",
    "Pro Tool",
    "Basic Part",
  ];
  const idx = Math.floor(Math.random() * skus.length);
  const quantity = Math.floor(Math.random() * 5) + 1;
  const unitPrice = (Math.random() * 100 + 5).toFixed(2);
  const lineTotal = (quantity * parseFloat(unitPrice)).toFixed(2);

  await pool.query(
    "INSERT INTO order_items (order_id, sku, name, quantity, unit_price, line_total) VALUES ($1, $2, $3, $4, $5, $6)",
    [order.id, skus[idx], names[idx], quantity, unitPrice, lineTotal]
  );

  console.log(
    `[INSERT] OrderItem: ${skus[idx]} x${quantity} for ${order.external_id}`
  );
}

async function softDeleteCustomer() {
  const result = await pool.query(
    `SELECT id, external_id FROM customers 
     WHERE deleted_at IS NULL 
     AND id NOT IN (SELECT DISTINCT customer_id FROM orders WHERE status NOT IN ('delivered', 'cancelled'))
     ORDER BY RANDOM() LIMIT 1`
  );

  if (result.rows.length === 0) return;

  const customer = result.rows[0];

  await pool.query("UPDATE customers SET deleted_at = NOW() WHERE id = $1", [
    customer.id,
  ]);

  console.log(`[SOFT DELETE] Customer: ${customer.external_id}`);
}

const operationFunctions = {
  insert_customer: insertCustomer,
  update_customer: updateCustomer,
  insert_order: insertOrder,
  update_order_status: updateOrderStatus,
  add_order_item: addOrderItem,
  soft_delete_customer: softDeleteCustomer,
};

async function runOperation() {
  const op = randomChoice(operations);
  const fn = operationFunctions[op];

  try {
    await fn();
    opCount++;

    if (maxOps > 0 && opCount >= maxOps) {
      console.log(`\nReached max operations (${maxOps}). Stopping.`);
      process.exit(0);
    }
  } catch (err) {
    console.error(`[ERROR] ${op}: ${err.message}`);
  }
}

async function main() {
  console.log("CDC Data Generator Starting...");
  console.log(`  Source: ${config.host}:${config.port}/${config.database}`);
  console.log(`  Interval: ${intervalMs}ms`);
  console.log(`  Max ops: ${maxOps || "unlimited"}`);
  console.log("");

  // Wait for database to be ready
  let retries = 30;
  while (retries > 0) {
    try {
      await pool.query("SELECT 1");
      console.log("Database connected.\n");
      break;
    } catch (err) {
      console.log(`Waiting for database... (${retries} retries left)`);
      retries--;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  if (retries === 0) {
    console.error("Could not connect to database. Exiting.");
    process.exit(1);
  }

  // Start generating operations
  setInterval(runOperation, intervalMs);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
