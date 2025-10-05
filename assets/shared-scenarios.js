const defaultScenarios = [
  {
    id: "orders",
    name: "Omnichannel Orders",
    label: "Omnichannel Orders",
    description: "Track order lifecycle and fulfillment signals across channels.",
    highlight: "Focus on status transitions, totals, and fulfillment metadata.",
    table: "orders",
    schema: [
      { name: "order_id", type: "string", pk: true },
      { name: "customer_id", type: "string", pk: false },
      { name: "status", type: "string", pk: false },
      { name: "subtotal", type: "number", pk: false },
      { name: "shipping_method", type: "string", pk: false },
      { name: "updated_at", type: "string", pk: false }
    ],
    rows: [
      { order_id: "ORD-1001", customer_id: "C-204", status: "processing", subtotal: 184.5, shipping_method: "Expedited", updated_at: "2025-03-20T15:04:00Z" },
      { order_id: "ORD-1002", customer_id: "C-412", status: "packed", subtotal: 92.1, shipping_method: "Standard", updated_at: "2025-03-20T14:45:00Z" },
      { order_id: "ORD-1003", customer_id: "C-102", status: "cancelled", subtotal: 248.0, shipping_method: "Store Pickup", updated_at: "2025-03-19T21:10:00Z" }
    ],
    events: [
      {
        payload: {
          before: null,
          after: { order_id: "ORD-1001", customer_id: "C-204", status: "pending", subtotal: 184.5, shipping_method: "Expedited", updated_at: "2025-03-20T14:40:00Z" },
          source: { name: "playground", version: "0.1.0" },
          op: "c",
          ts_ms: 1742472000000
        },
        key: { order_id: "ORD-1001" }
      },
      {
        payload: {
          before: { order_id: "ORD-1001", customer_id: "C-204", status: "pending", subtotal: 184.5, shipping_method: "Expedited", updated_at: "2025-03-20T14:40:00Z" },
          after: { order_id: "ORD-1001", customer_id: "C-204", status: "processing", subtotal: 184.5, shipping_method: "Expedited", updated_at: "2025-03-20T15:04:00Z" },
          source: { name: "playground", version: "0.1.0" },
          op: "u",
          ts_ms: 1742473440000
        },
        key: { order_id: "ORD-1001" }
      },
      {
        payload: {
          before: null,
          after: { order_id: "ORD-1002", customer_id: "C-412", status: "packed", subtotal: 92.1, shipping_method: "Standard", updated_at: "2025-03-20T14:45:00Z" },
          source: { name: "playground", version: "0.1.0" },
          op: "c",
          ts_ms: 1742472300000
        },
        key: { order_id: "ORD-1002" }
      },
      {
        payload: {
          before: null,
          after: { order_id: "ORD-1003", customer_id: "C-102", status: "pending", subtotal: 248.0, shipping_method: "Store Pickup", updated_at: "2025-03-19T19:42:00Z" },
          source: { name: "playground", version: "0.1.0" },
          op: "c",
          ts_ms: 1742384520000
        },
        key: { order_id: "ORD-1003" }
      },
      {
        payload: {
          before: { order_id: "ORD-1003", customer_id: "C-102", status: "pending", subtotal: 248.0, shipping_method: "Store Pickup", updated_at: "2025-03-19T19:42:00Z" },
          after: { order_id: "ORD-1003", customer_id: "C-102", status: "cancelled", subtotal: 248.0, shipping_method: "Store Pickup", updated_at: "2025-03-19T21:10:00Z" },
          source: { name: "playground", version: "0.1.0" },
          op: "u",
          ts_ms: 1742391000000
        },
        key: { order_id: "ORD-1003" }
      }
    ],
    ops: [
      { t: 0, op: "insert", table: "orders", pk: { id: "ORD-1001" }, after: { order_id: "ORD-1001", customer_id: "C-204", status: "pending", subtotal: 184.5, shipping_method: "Expedited", updated_at: "2025-03-20T14:40:00Z" } },
      { t: 200, op: "update", table: "orders", pk: { id: "ORD-1001" }, after: { order_id: "ORD-1001", customer_id: "C-204", status: "processing", subtotal: 184.5, shipping_method: "Expedited", updated_at: "2025-03-20T15:04:00Z" } },
      { t: 150, op: "insert", table: "orders", pk: { id: "ORD-1002" }, after: { order_id: "ORD-1002", customer_id: "C-412", status: "packed", subtotal: 92.1, shipping_method: "Standard", updated_at: "2025-03-20T14:45:00Z" } },
      { t: 250, op: "insert", table: "orders", pk: { id: "ORD-1003" }, after: { order_id: "ORD-1003", customer_id: "C-102", status: "pending", subtotal: 248.0, shipping_method: "Store Pickup", updated_at: "2025-03-19T19:42:00Z" } },
      { t: 360, op: "update", table: "orders", pk: { id: "ORD-1003" }, after: { order_id: "ORD-1003", customer_id: "C-102", status: "cancelled", subtotal: 248.0, shipping_method: "Store Pickup", updated_at: "2025-03-19T21:10:00Z" } }
    ]
  },
  {
    id: "payments",
    name: "Real-time Payments",
    label: "Real-time Payments",
    description: "Model authorization, capture, and decline flows for transactions.",
    highlight: "Great for demonstrating idempotent updates and risk review.",
    table: "payments",
    schema: [
      { name: "transaction_id", type: "string", pk: true },
      { name: "account_id", type: "string", pk: false },
      { name: "payment_method", type: "string", pk: false },
      { name: "amount", type: "number", pk: false },
      { name: "status", type: "string", pk: false },
      { name: "authorized_at", type: "string", pk: false },
      { name: "captured_at", type: "string", pk: false }
    ],
    rows: [
      { transaction_id: "PAY-88341", account_id: "ACC-0937", payment_method: "card", amount: 72.4, status: "captured", authorized_at: "2025-03-18T10:04:00Z", captured_at: "2025-03-18T10:06:10Z" },
      { transaction_id: "PAY-88355", account_id: "ACC-4201", payment_method: "wallet", amount: 15.0, status: "authorized", authorized_at: "2025-03-20T16:20:00Z", captured_at: null },
      { transaction_id: "PAY-88377", account_id: "ACC-0937", payment_method: "card", amount: 420.0, status: "declined", authorized_at: "2025-03-20T08:11:00Z", captured_at: null }
    ],
    events: [
      {
        payload: {
          before: null,
          after: { transaction_id: "PAY-88341", account_id: "ACC-0937", payment_method: "card", amount: 72.4, status: "authorized", authorized_at: "2025-03-18T10:04:00Z", captured_at: null },
          source: { name: "playground", version: "0.1.0" },
          op: "c",
          ts_ms: 1742292240000
        },
        key: { transaction_id: "PAY-88341" }
      },
      {
        payload: {
          before: { transaction_id: "PAY-88341", account_id: "ACC-0937", payment_method: "card", amount: 72.4, status: "authorized", authorized_at: "2025-03-18T10:04:00Z", captured_at: null },
          after: { transaction_id: "PAY-88341", account_id: "ACC-0937", payment_method: "card", amount: 72.4, status: "captured", authorized_at: "2025-03-18T10:04:00Z", captured_at: "2025-03-18T10:06:10Z" },
          source: { name: "playground", version: "0.1.0" },
          op: "u",
          ts_ms: 1742292370000
        },
        key: { transaction_id: "PAY-88341" }
      },
      {
        payload: {
          before: null,
          after: { transaction_id: "PAY-88355", account_id: "ACC-4201", payment_method: "wallet", amount: 15.0, status: "authorized", authorized_at: "2025-03-20T16:20:00Z", captured_at: null },
          source: { name: "playground", version: "0.1.0" },
          op: "c",
          ts_ms: 1742478000000
        },
        key: { transaction_id: "PAY-88355" }
      },
      {
        payload: {
          before: null,
          after: { transaction_id: "PAY-88377", account_id: "ACC-0937", payment_method: "card", amount: 420.0, status: "pending_review", authorized_at: "2025-03-20T08:11:00Z", captured_at: null },
          source: { name: "playground", version: "0.1.0" },
          op: "c",
          ts_ms: 1742448660000
        },
        key: { transaction_id: "PAY-88377" }
      },
      {
        payload: {
          before: { transaction_id: "PAY-88377", account_id: "ACC-0937", payment_method: "card", amount: 420.0, status: "pending_review", authorized_at: "2025-03-20T08:11:00Z", captured_at: null },
          after: { transaction_id: "PAY-88377", account_id: "ACC-0937", payment_method: "card", amount: 420.0, status: "declined", authorized_at: "2025-03-20T08:11:00Z", captured_at: null },
          source: { name: "playground", version: "0.1.0" },
          op: "u",
          ts_ms: 1742449200000
        },
        key: { transaction_id: "PAY-88377" }
      }
    ],
    ops: [
      { t: 0, op: "insert", table: "payments", pk: { id: "PAY-88341" }, after: { transaction_id: "PAY-88341", account_id: "ACC-0937", payment_method: "card", amount: 72.4, status: "authorized", authorized_at: "2025-03-18T10:04:00Z", captured_at: null } },
      { t: 120, op: "update", table: "payments", pk: { id: "PAY-88341" }, after: { transaction_id: "PAY-88341", account_id: "ACC-0937", payment_method: "card", amount: 72.4, status: "captured", authorized_at: "2025-03-18T10:04:00Z", captured_at: "2025-03-18T10:06:10Z" } },
      { t: 200, op: "insert", table: "payments", pk: { id: "PAY-88355" }, after: { transaction_id: "PAY-88355", account_id: "ACC-4201", payment_method: "wallet", amount: 15.0, status: "authorized", authorized_at: "2025-03-20T16:20:00Z", captured_at: null } },
      { t: 240, op: "insert", table: "payments", pk: { id: "PAY-88377" }, after: { transaction_id: "PAY-88377", account_id: "ACC-0937", payment_method: "card", amount: 420.0, status: "pending_review", authorized_at: "2025-03-20T08:11:00Z", captured_at: null } },
      { t: 300, op: "update", table: "payments", pk: { id: "PAY-88377" }, after: { transaction_id: "PAY-88377", account_id: "ACC-0937", payment_method: "card", amount: 420.0, status: "declined", authorized_at: "2025-03-20T08:11:00Z", captured_at: null } }
    ]
  },
  {
    id: "iot",
    name: "IoT Telemetry",
    label: "IoT Telemetry",
    description: "Capture rolling sensor readings with anomaly flags.",
    highlight: "Simulate snapshots, drifts, and device alerts in edge pipelines.",
    table: "telemetry",
    schema: [
      { name: "reading_id", type: "string", pk: true },
      { name: "device_id", type: "string", pk: false },
      { name: "temperature_c", type: "number", pk: false },
      { name: "pressure_kpa", type: "number", pk: false },
      { name: "status", type: "string", pk: false },
      { name: "recorded_at", type: "string", pk: false }
    ],
    rows: [
      { reading_id: "READ-301", device_id: "THERM-04", temperature_c: 21.4, pressure_kpa: 101.3, status: "nominal", recorded_at: "2025-03-20T15:00:00Z" },
      { reading_id: "READ-302", device_id: "THERM-04", temperature_c: 24.9, pressure_kpa: 101.1, status: "warning", recorded_at: "2025-03-20T15:15:00Z" },
      { reading_id: "READ-377", device_id: "THERM-11", temperature_c: 18.0, pressure_kpa: 99.5, status: "nominal", recorded_at: "2025-03-20T15:10:00Z" }
    ],
    events: [
      {
        payload: {
          before: null,
          after: { reading_id: "READ-301", device_id: "THERM-04", temperature_c: 19.8, pressure_kpa: 101.6, status: "nominal", recorded_at: "2025-03-20T14:30:00Z" },
          source: { name: "playground", version: "0.1.0" },
          op: "c",
          ts_ms: 1742471400000
        },
        key: { reading_id: "READ-301" }
      },
      {
        payload: {
          before: { reading_id: "READ-301", device_id: "THERM-04", temperature_c: 19.8, pressure_kpa: 101.6, status: "nominal", recorded_at: "2025-03-20T14:30:00Z" },
          after: { reading_id: "READ-301", device_id: "THERM-04", temperature_c: 21.4, pressure_kpa: 101.3, status: "nominal", recorded_at: "2025-03-20T15:00:00Z" },
          source: { name: "playground", version: "0.1.0" },
          op: "u",
          ts_ms: 1742473200000
        },
        key: { reading_id: "READ-301" }
      },
      {
        payload: {
          before: null,
          after: { reading_id: "READ-302", device_id: "THERM-04", temperature_c: 24.9, pressure_kpa: 101.1, status: "warning", recorded_at: "2025-03-20T15:15:00Z" },
          source: { name: "playground", version: "0.1.0" },
          op: "c",
          ts_ms: 1742474100000
        },
        key: { reading_id: "READ-302" }
      },
      {
        payload: {
          before: null,
          after: { reading_id: "READ-377", device_id: "THERM-11", temperature_c: 18.0, pressure_kpa: 99.5, status: "nominal", recorded_at: "2025-03-20T15:10:00Z" },
          source: { name: "playground", version: "0.1.0" },
          op: "c",
          ts_ms: 1742473800000
        },
        key: { reading_id: "READ-377" }
      },
      {
        payload: {
          before: { reading_id: "READ-302", device_id: "THERM-04", temperature_c: 24.9, pressure_kpa: 101.1, status: "warning", recorded_at: "2025-03-20T15:15:00Z" },
          after: { reading_id: "READ-302", device_id: "THERM-04", temperature_c: 26.3, pressure_kpa: 100.8, status: "alert", recorded_at: "2025-03-20T15:20:00Z" },
          source: { name: "playground", version: "0.1.0" },
          op: "u",
          ts_ms: 1742474400000
        },
        key: { reading_id: "READ-302" }
      }
    ],
    ops: [
      { t: 0, op: "insert", table: "telemetry", pk: { id: "READ-301" }, after: { reading_id: "READ-301", device_id: "THERM-04", temperature_c: 19.8, pressure_kpa: 101.6, status: "nominal", recorded_at: "2025-03-20T14:30:00Z" } },
      { t: 150, op: "update", table: "telemetry", pk: { id: "READ-301" }, after: { reading_id: "READ-301", device_id: "THERM-04", temperature_c: 21.4, pressure_kpa: 101.3, status: "nominal", recorded_at: "2025-03-20T15:00:00Z" } },
      { t: 210, op: "insert", table: "telemetry", pk: { id: "READ-302" }, after: { reading_id: "READ-302", device_id: "THERM-04", temperature_c: 24.9, pressure_kpa: 101.1, status: "warning", recorded_at: "2025-03-20T15:15:00Z" } },
      { t: 260, op: "update", table: "telemetry", pk: { id: "READ-302" }, after: { reading_id: "READ-302", device_id: "THERM-04", temperature_c: 26.3, pressure_kpa: 100.8, status: "alert", recorded_at: "2025-03-20T15:20:00Z" } },
      { t: 180, op: "insert", table: "telemetry", pk: { id: "READ-377" }, after: { reading_id: "READ-377", device_id: "THERM-11", temperature_c: 18.0, pressure_kpa: 99.5, status: "nominal", recorded_at: "2025-03-20T15:10:00Z" } }
    ]
  },
  {
    id: "crud-basic",
    name: "CRUD Basic",
    label: "CRUD Basic",
    description: "Insert, update, and delete a single customer to highlight delete visibility.",
    seed: 42,
    ops: [
      { t: 100, op: "insert", table: "customers", pk: { id: "1" }, after: { name: "A", email: "a@example.com" } },
      { t: 400, op: "update", table: "customers", pk: { id: "1" }, after: { name: "A1", email: "a@example.com" } },
      { t: 700, op: "delete", table: "customers", pk: { id: "1" } }
    ]
  },
  {
    id: "burst-updates",
    name: "Burst Updates",
    label: "Burst Updates",
    description: "Five quick updates to expose lost intermediate writes for polling.",
    seed: 7,
    ops: [
      { t: 100, op: "insert", table: "customers", pk: { id: "200" }, after: { name: "Burst", email: "burst@example.com" } },
      { t: 150, op: "update", table: "customers", pk: { id: "200" }, after: { name: "Burst-1", email: "burst@example.com" } },
      { t: 180, op: "update", table: "customers", pk: { id: "200" }, after: { name: "Burst-2", email: "burst@example.com" } },
      { t: 210, op: "update", table: "customers", pk: { id: "200" }, after: { name: "Burst-3", email: "burst@example.com" } },
      { t: 240, op: "update", table: "customers", pk: { id: "200" }, after: { name: "Burst-4", email: "burst@example.com" } },
      { t: 600, op: "update", table: "customers", pk: { id: "200" }, after: { name: "Burst-Final", email: "burst@example.com" } }
    ]
  }
];

if (typeof window !== "undefined") {
  window.CDC_SCENARIOS = defaultScenarios;
}

export default defaultScenarios;
