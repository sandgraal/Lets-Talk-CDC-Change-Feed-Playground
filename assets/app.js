// Minimal CDC simulator with Debezium-like envelopes.
// Now with Appwrite Realtime.
// State is in-memory + localStorage snapshot.

import tooltipCopy from "./tooltip-copy.js";

function randomInt(min, max) {
  const hasMax = typeof max === "number";
  if (!hasMax) {
    max = min;
    min = 0;
  }

  const lower = Math.ceil(Number(min));
  const upper = Math.floor(Number(max));
  if (!Number.isFinite(lower) || !Number.isFinite(upper)) {
    throw new TypeError("randomInt bounds must be finite numbers");
  }

  if (upper <= lower) {
    if (upper === lower) return lower;
    throw new RangeError("randomInt max must be greater than min");
  }

  const range = upper - lower;
  const cryptoObj =
    typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.getRandomValues === "function"
      ? globalThis.crypto
      : null;

  if (!cryptoObj || range > 0xffffffff) {
    return lower + Math.floor(Math.random() * range);
  }

  const maxUint32 = 0xffffffff;
  const slice = maxUint32 - (maxUint32 % range);
  const bucket = new Uint32Array(1);
  let value = 0;

  do {
    cryptoObj.getRandomValues(bucket);
    value = bucket[0];
  } while (value >= slice);

  return lower + (value % range);
}

const STORAGE_KEYS = Object.freeze({
  state: "cdc_playground",
  onboarding: "cdc_playground_onboarding_v1",
  lastTemplate: "cdc_playground_last_template_v1",
  scenarioFilter: "cdc_playground_template_filter_v1",
  officeOptIn: "cdc_playground_office_opt_in_v1",
});

const THEME_PREF_KEY = "cdc_theme_preference_v1";
const DEFAULT_THEME = "dark";

function createSafeStorage() {
  const memory = new Map();
  const fallback = {
    available: false,
    get(key) {
      return memory.has(key) ? memory.get(key) ?? null : null;
    },
    set(key, value) {
      const stringValue = typeof value === "string" ? value : String(value);
      memory.set(key, stringValue);
    },
    remove(key) {
      memory.delete(key);
    },
    clear() {
      memory.clear();
    },
  };

  const globalStorage = (() => {
    try {
      if (typeof window !== "undefined") {
        try {
          return window.localStorage;
        } catch {
          return null;
        }
      }
      if (typeof globalThis !== "undefined") {
        try {
          return globalThis.localStorage;
        } catch {
          return null;
        }
      }
    } catch {
      return null;
    }
    return null;
  })();

  if (!globalStorage) return fallback;

  try {
    const probe = "__cdc_storage_probe__";
    globalStorage.setItem(probe, "1");
    globalStorage.removeItem(probe);
  } catch {
    return fallback;
  }

  return {
    available: true,
    get(key) {
      try {
        const value = globalStorage.getItem(key);
        if (value === null && memory.has(key)) {
          return memory.get(key) ?? null;
        }
        return value;
      } catch {
        return fallback.get(key);
      }
    },
    set(key, value) {
      const stringValue = typeof value === "string" ? value : String(value);
      try {
        globalStorage.setItem(key, stringValue);
        memory.delete(key);
      } catch {
        fallback.set(key, stringValue);
      }
    },
    remove(key) {
      try {
        globalStorage.removeItem(key);
        memory.delete(key);
      } catch {
        fallback.remove(key);
      }
    },
    clear() {
      try {
        globalStorage.clear();
        memory.clear();
      } catch {
        fallback.clear();
      }
    },
  };
}

const storage = createSafeStorage();

function applyThemePreference(theme) {
  if (typeof document === "undefined") return DEFAULT_THEME;

  const normalized = theme === "light" ? "light" : DEFAULT_THEME;
  const body = document.body || document.querySelector("body");
  if (!body) return normalized;
  body.dataset.theme = normalized;

  const toggle = document.getElementById("themeToggle");
  if (toggle) {
    toggle.dataset.mode = normalized;
    toggle.setAttribute("aria-pressed", normalized === "light" ? "true" : "false");
    toggle.setAttribute(
      "aria-label",
      normalized === "light" ? "Switch to dark theme" : "Switch to light theme",
    );
  }

  return normalized;
}

function readStoredThemePreference() {
  try {
    const stored = storage.get(THEME_PREF_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* ignore */
  }

  return DEFAULT_THEME;
}

function initThemeToggle() {
  if (typeof document === "undefined") return DEFAULT_THEME;

  let appliedTheme = applyThemePreference(readStoredThemePreference());
  const toggle = document.getElementById("themeToggle");

  if (!toggle) return appliedTheme;

  toggle.addEventListener("click", () => {
    appliedTheme = appliedTheme === "light" ? "dark" : "light";
    appliedTheme = applyThemePreference(appliedTheme);

    try {
      storage.set(THEME_PREF_KEY, appliedTheme);
    } catch {
      /* ignore */
    }
  });

  return appliedTheme;
}

if (typeof window !== "undefined") {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has("resetOnboarding")) {
      storage.remove(STORAGE_KEYS.onboarding);
    }
  } catch { /* ignore */ }
}

if (typeof document !== "undefined") {
  initThemeToggle();
}

const COMPARATOR_PREFS_KEY = "cdc_comparator_prefs_v1";
const SCHEMA_DEMO_COLUMN = { name: "priority_flag", type: "boolean" };

const officeEasterEgg = {
  toastShown: false,
  seedCount: 0,
  bankruptcyShown: false,
  megadeskActive: false,
};

let officeSchemaOptIn = true;

const DEFAULT_SCHEMA = [
  { name: "id", type: "number", pk: true },
  { name: "customer_name", type: "string", pk: false },
  { name: "price_per_unit", type: "number", pk: false },
  { name: "order_total", type: "number", pk: false },
  { name: "sales_rep", type: "string", pk: false },
  { name: "region", type: "string", pk: false },
];

const FALLBACK_SCENARIOS = [
  {
    id: "crud-basic",
    name: "CRUD Basic",
    label: "CRUD Basic",
    description: "Teaching delete visibility basics.",
    highlight: "Minimal ops for first-time comparator demos.",
    tags: ["crud", "basics"],
    seed: 42,
    table: "customers",
    schema: [
      { name: "id", type: "string", pk: true },
      { name: "name", type: "string", pk: false },
      { name: "email", type: "string", pk: false },
    ],
    rows: [
      { id: "1", name: "Alice", email: "alice@contoso.io" },
    ],
    events: [],
    ops: [
      { t: 100, op: "insert", table: "customers", pk: { id: "1" }, after: { name: "Alice", email: "alice@example.com" } },
      { t: 350, op: "update", table: "customers", pk: { id: "1" }, after: { email: "alice@contoso.io" } },
      { t: 700, op: "delete", table: "customers", pk: { id: "1" } },
    ],
  },
  {
    id: "omnichannel-orders",
    name: "Omnichannel Orders",
    label: "Omnichannel Orders",
    description: "Walking through status transitions and fulfilment edge cases.",
    highlight: "Mix of inserts/updates with delete coverage; great for lag comparisons.",
    tags: ["orders", "lag", "fulfilment"],
    seed: 21,
    table: "orders",
    schema: [
      { name: "id", type: "string", pk: true },
      { name: "customer_id", type: "string", pk: false },
      { name: "status", type: "string", pk: false },
      { name: "channel", type: "string", pk: false },
      { name: "total", type: "number", pk: false },
      { name: "pickup_ts", type: "number", pk: false },
    ],
    rows: [
      { id: "ORD-501", customer_id: "C-19", status: "collected", channel: "store-108", total: 189.5, pickup_ts: 420 },
    ],
    events: [],
    ops: [
      {
        t: 120,
        op: "insert",
        table: "orders",
        pk: { id: "ORD-501" },
        after: { customer_id: "C-19", status: "pending", channel: "web", total: 189.5 },
      },
      {
        t: 240,
        op: "update",
        table: "orders",
        pk: { id: "ORD-501" },
        after: { status: "ready_for_pickup", channel: "store-108" },
      },
      {
        t: 260,
        op: "insert",
        table: "fulfilment_events",
        pk: { id: "FUL-501-1" },
        after: { order_id: "ORD-501", type: "picking", associate: "EMP-88" },
      },
      {
        t: 420,
        op: "update",
        table: "orders",
        pk: { id: "ORD-501" },
        after: { status: "collected", pickup_ts: 420 },
      },
      { t: 600, op: "delete", table: "fulfilment_events", pk: { id: "FUL-501-1" } },
    ],
  },
  {
    id: "real-time-payments",
    name: "Real-time Payments",
    label: "Real-time Payments",
    description: "Demonstrating idempotent updates or risk review flows.",
    highlight: "Trigger overhead tuning + delete capture expectations.",
    tags: ["payments", "risk", "latency"],
    seed: 73,
    table: "payments",
    schema: [
      { name: "id", type: "string", pk: true },
      { name: "account_id", type: "string", pk: false },
      { name: "amount", type: "number", pk: false },
      { name: "currency", type: "string", pk: false },
      { name: "status", type: "string", pk: false },
      { name: "released_by", type: "string", pk: false },
      { name: "settled_ts", type: "number", pk: false },
    ],
    rows: [
      { id: "PAY-009", account_id: "AC-77", amount: 985.4, currency: "USD", status: "settled", settled_ts: 280 },
    ],
    events: [],
    ops: [
      {
        t: 50,
        op: "insert",
        table: "payments",
        pk: { id: "PAY-009" },
        after: { account_id: "AC-77", amount: 985.4, currency: "USD", status: "authorised" },
      },
      {
        t: 95,
        op: "insert",
        table: "risk_reviews",
        pk: { id: "RR-009" },
        after: { payment_id: "PAY-009", score: 412, disposition: "manual" },
      },
      { t: 140, op: "update", table: "risk_reviews", pk: { id: "RR-009" }, after: { disposition: "approved" } },
      { t: 180, op: "update", table: "payments", pk: { id: "PAY-009" }, after: { status: "released", released_by: "agent-5" } },
      { t: 220, op: "delete", table: "risk_reviews", pk: { id: "RR-009" } },
      { t: 280, op: "update", table: "payments", pk: { id: "PAY-009" }, after: { status: "settled", settled_ts: 280 } },
    ],
  },
  {
    id: "iot-telemetry",
    name: "IoT Telemetry",
    label: "IoT Telemetry",
    description: "Showing rolling measurements with anomaly flags.",
    highlight: "Highlights soft-delete vs. log consistency and clock controls.",
    tags: ["iot", "telemetry", "anomaly"],
    seed: 88,
    table: "device_readings",
    schema: [
      { name: "id", type: "string", pk: true },
      { name: "device_id", type: "string", pk: false },
      { name: "temp_c", type: "number", pk: false },
      { name: "humidity", type: "number", pk: false },
      { name: "anomaly", type: "bool", pk: false },
      { name: "anomaly_reason", type: "string", pk: false },
    ],
    rows: [
      { id: "DEV-5@130", device_id: "DEV-5", temp_c: 19.2, humidity: 0.39, anomaly: false },
    ],
    events: [],
    ops: [
      {
        t: 10,
        op: "insert",
        table: "device_readings",
        pk: { id: "DEV-5@10" },
        after: { device_id: "DEV-5", temp_c: 18.4, humidity: 0.41, anomaly: false },
      },
      {
        t: 55,
        op: "update",
        table: "device_readings",
        pk: { id: "DEV-5@10" },
        after: { temp_c: 28.9, anomaly: true, anomaly_reason: "spike" },
      },
      {
        t: 130,
        op: "insert",
        table: "device_readings",
        pk: { id: "DEV-5@130" },
        after: { device_id: "DEV-5", temp_c: 19.2, humidity: 0.39, anomaly: false },
      },
      {
        t: 200,
        op: "delete",
        table: "device_readings",
        pk: { id: "DEV-5@10" },
      },
    ],
  },
  {
    id: "schema-evolution",
    name: "Schema Evolution",
    label: "Schema Evolution",
    description: "Demonstrating column additions while capturing changes.",
    highlight: "Compare immediate log/trigger propagation with polling lag.",
    tags: ["schema", "backfill"],
    seed: 64,
    table: "customers",
    schemaVersion: 2,
    schema: [
      { name: "id", type: "string", pk: true },
      { name: "name", type: "string", pk: false },
      { name: "email", type: "string", pk: false },
      { name: "loyalty_tier", type: "string", pk: false },
      { name: "preferences", type: "json", pk: false },
    ],
    schemaVersion: 2,
    rows: [
      {
        id: "C-881",
        name: "Ishaan",
        email: "ishaan@example.net",
        loyalty_tier: "bronze",
        preferences: { marketing_opt_in: false, locale: "en-GB" },
      },
    ],
    events: [],
    ops: [
      {
        t: 75,
        op: "insert",
        table: "customers",
        pk: { id: "C-880" },
        after: { name: "Mira", email: "mira@example.net", loyalty_tier: "silver" },
      },
      {
        t: 140,
        op: "update",
        table: "customers",
        pk: { id: "C-880" },
        after: { loyalty_tier: "gold", preferences: { marketing_opt_in: true } },
      },
      {
        t: 210,
        op: "insert",
        table: "customers",
        pk: { id: "C-881" },
        after: { name: "Ishaan", email: "ishaan@example.net", loyalty_tier: "bronze" },
      },
      {
        t: 360,
        op: "update",
        table: "customers",
        pk: { id: "C-881" },
        after: { preferences: { marketing_opt_in: false, locale: "en-GB" } },
      },
    ],
  },
  {
    id: "orders-items-transactions",
    name: "Orders + Items Transactions",
    label: "Orders + Items Transactions",
    description: "Teaching multi-table commit semantics.",
    highlight: "Toggle apply-on-commit to keep orders/items destinations consistent.",
    tags: ["transactions", "orders"],
    seed: 58,
    table: "orders",
    schema: [
      { name: "id", type: "string", pk: true },
      { name: "customer_id", type: "string", pk: false },
      { name: "status", type: "string", pk: false },
      { name: "subtotal", type: "number", pk: false },
      { name: "shipped_ts", type: "number", pk: false },
    ],
    rows: [
      { id: "ORD-720", customer_id: "C-32", status: "shipped", subtotal: 412.5, shipped_ts: 520 },
    ],
    events: [],
    ops: [
      {
        t: 300,
        op: "insert",
        table: "orders",
        pk: { id: "ORD-720" },
        after: { customer_id: "C-32", status: "pending", subtotal: 412.5 },
        txn: { id: "TX-720", index: 0, total: 3 },
      },
      {
        t: 300,
        op: "insert",
        table: "order_items",
        pk: { id: "ORD-720-1" },
        after: { order_id: "ORD-720", sku: "SKU-9", qty: 2, price: 99.5 },
        txn: { id: "TX-720", index: 1, total: 3 },
      },
      {
        t: 300,
        op: "insert",
        table: "order_items",
        pk: { id: "ORD-720-2" },
        after: { order_id: "ORD-720", sku: "SKU-44", qty: 1, price: 213.5 },
        txn: { id: "TX-720", index: 2, total: 3, last: true },
      },
      {
        t: 520,
        op: "update",
        table: "orders",
        pk: { id: "ORD-720" },
        after: { status: "shipped", shipped_ts: 520 },
      },
    ],
  },
  {
    id: "burst-updates",
    name: "Burst Updates",
    label: "Burst Updates",
    description: "Stressing lag/ordering behaviour under rapid updates.",
    highlight: "Highlights polling gaps and diff overlays.",
    tags: ["lag", "polling"],
    seed: 7,
    table: "widgets",
    schema: [
      { name: "id", type: "string", pk: true },
      { name: "status", type: "string", pk: false },
    ],
    rows: [
      { id: "W-1", status: "ready" },
    ],
    events: [],
    ops: [
      { t: 100, op: "insert", table: "widgets", pk: { id: "W-1" }, after: { status: "new" } },
      { t: 150, op: "update", table: "widgets", pk: { id: "W-1" }, after: { status: "processing" } },
      { t: 200, op: "update", table: "widgets", pk: { id: "W-1" }, after: { status: "picking" } },
      { t: 260, op: "update", table: "widgets", pk: { id: "W-1" }, after: { status: "packing" } },
      { t: 320, op: "update", table: "widgets", pk: { id: "W-1" }, after: { status: "ready" } },
    ],
  },
];

const SHARED_SCENARIOS =
  (typeof window !== "undefined" && Array.isArray(window.CDC_SCENARIOS) && window.CDC_SCENARIOS.length)
    ? window.CDC_SCENARIOS
    : FALLBACK_SCENARIOS;

const FALLBACK_TEMPLATE_SEED_BASE = 1000;

function cloneTemplateOps(ops, index) {
  if (!Array.isArray(ops)) return [];
  return ops
    .filter(op => Boolean(op))
    .map(op => {
      const clone = { ...op };
      if (op?.pk) {
        clone.pk = { ...op.pk };
      }
      if ("after" in clone && op && "after" in op && op.after) {
        clone.after = { ...op.after };
      }
      if (op?.txn) {
        clone.txn = { ...op.txn };
      }
      clone.t = typeof clone.t === "number" ? clone.t : index * 200;
      return clone;
    });
}

function cloneTemplateRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(row => row && typeof row === "object")
    .map(row => ({ ...row }));
}

function cloneTemplateSchema(schema) {
  if (!Array.isArray(schema)) return [];
  return schema
    .filter(column => column && typeof column.name === "string")
    .map(column => ({ ...column }));
}

function cloneTemplateEvents(events) {
  if (!Array.isArray(events)) return [];
  return events
    .filter(event => event && typeof event === "object")
    .map(event => ({ ...event }));
}

function deriveTemplateSeed(seed, index) {
  return typeof seed === "number" ? seed : FALLBACK_TEMPLATE_SEED_BASE + index;
}

const SCENARIO_TEMPLATES = Object.freeze(
  SHARED_SCENARIOS
    .map((template, index) => ({
      id: template.id,
      name: template.name,
      label: template.label || template.name,
      description: template.description,
      highlight: template.highlight,
      tags: Array.isArray(template.tags) ? [...template.tags] : [],
      seed: deriveTemplateSeed(template.seed, index),
      schemaVersion: typeof template.schemaVersion === "number" ? template.schemaVersion : undefined,
      table: template.table,
      schema: cloneTemplateSchema(template.schema),
      rows: cloneTemplateRows(template.rows),
      events: cloneTemplateEvents(template.events),
      ops: cloneTemplateOps(template.ops, index),
    }))
    .filter(template => template.id && template.ops.length > 0)
);

const TEMPLATE_ICON_LIBRARY = Object.freeze({
  payments: {
    viewBox: "0 0 24 24",
    paths: [
      "M2.25 6A2.25 2.25 0 0 1 4.5 3.75h15A2.25 2.25 0 0 1 21.75 6v12A2.25 2.25 0 0 1 19.5 20.25h-15A2.25 2.25 0 0 1 2.25 18V6Z",
      "M2.25 9h19.5v2.25H2.25V9Z",
      "M6 15.75h4.5M6 13.5h2.25",
    ],
  },
  orders: {
    viewBox: "0 0 24 24",
    paths: [
      "M4.5 7.5 12 3l7.5 4.5v9L12 21l-7.5-4.5v-9Z",
      "M12 12v9",
      "m4.5 6 7.5-4.5",
      "M12 12 4.5 7.5",
    ],
  },
  telemetry: {
    viewBox: "0 0 24 24",
    paths: [
      "M4.5 18.75 9 12l3 4.5 3.75-6 3 4.5",
      "M4.5 18.75H19.5",
      "M6.75 8.25a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
    ],
  },
  schema: {
    viewBox: "0 0 24 24",
    paths: [
      "M4.5 6A1.5 1.5 0 0 1 6 4.5h12A1.5 1.5 0 0 1 19.5 6v12A1.5 1.5 0 0 1 18 19.5H6A1.5 1.5 0 0 1 4.5 18V6Z",
      "M9 4.5v15",
      "M15 4.5v15",
      "M4.5 12h15",
    ],
  },
  default: {
    viewBox: "0 0 24 24",
    paths: [
      "M12 3.75a8.25 8.25 0 1 0 0 16.5 8.25 8.25 0 0 0 0-16.5Z",
      "M9 12L11.25 15L15 9",
    ],
  },
});

const state = {
  schema: [],     // [{name, type, pk}]
  rows: [],       // [{col: value}]
  events: [],     // emitted events (local + realtime)
  schemaVersion: 1,
  scenarioId: null,
  remoteId: null,
};

const els = {
  schemaPills: document.getElementById("schemaPills"),
  rowEditor: document.getElementById("rowEditor"),
  tbl: document.getElementById("tbl"),
  eventLog: document.getElementById("eventLog"),
  eventStatsPanel: document.getElementById("eventStatsPanel"),
  eventStatsPulse: document.getElementById("eventStatsPulse"),
  eventStatsEmpty: document.getElementById("eventStatsEmpty"),
  eventStatsGrid: document.getElementById("eventStatsGrid"),
  eventStatsTotal: document.getElementById("eventStatsTotal"),
  eventStatsLastOp: document.getElementById("eventStatsLastOp"),
  eventStatsLastTs: document.getElementById("eventStatsLastTs"),
  eventStatsCounts: {
    c: document.getElementById("statInsertCount"),
    u: document.getElementById("statUpdateCount"),
    d: document.getElementById("statDeleteCount"),
    r: document.getElementById("statSnapshotCount"),
    s: document.getElementById("statSchemaCount"),
  },
  debzWrap: document.getElementById("debzWrap"),
  includeBefore: document.getElementById("includeBefore"),
  copyNdjson: document.getElementById("btnCopyNdjson"),
  downloadNdjson: document.getElementById("btnDownloadNdjson"),
  comparatorFeedback: document.getElementById("comparatorFeedback"),
  scenarioFilter: document.getElementById("scenarioFilter"),
  templateTagBar: document.getElementById("templateTagBar"),
  scenarioPreviewModal: document.getElementById("scenarioPreviewModal"),
  scenarioPreviewClose: document.getElementById("scenarioPreviewClose"),
  scenarioPreviewTitle: document.getElementById("scenarioPreviewTitle"),
  scenarioPreviewDescription: document.getElementById("scenarioPreviewDescription"),
  scenarioPreviewTags: document.getElementById("scenarioPreviewTags"),
  scenarioPreviewRows: document.getElementById("scenarioPreviewRows"),
  scenarioPreviewOps: document.getElementById("scenarioPreviewOps"),
  scenarioPreviewLoad: document.getElementById("scenarioPreviewLoad"),
  scenarioPreviewDownload: document.getElementById("scenarioPreviewDownload"),
  schemaStatus: document.getElementById("schemaStatus"),
  stepCards: Array.from(document.querySelectorAll(".step-card")),
  autofillRow: document.getElementById("btnAutofillRow"),
  templateGallery: document.getElementById("templateGallery"),
  onboardingOverlay: document.getElementById("onboardingOverlay"),
  onboardingClose: document.getElementById("onboardingClose"),
  onboardingDismiss: document.getElementById("onboardingDismiss"),
  onboardingStart: document.getElementById("onboardingStart"),
  onboardingEasterEgg: document.getElementById("onboardingEasterEgg"),
  methodGuidance: document.getElementById("methodGuidance"),
  saveRemote: document.getElementById("btnSaveRemote"),
  shareLink: document.getElementById("btnShareLink"),
  quickstartCards: {
    schema: document.getElementById("qsSchema"),
    rows: document.getElementById("qsRows"),
    events: document.getElementById("qsEvents"),
  },
  quickstartButtons: {
    schema: document.getElementById("btnQuickSchema"),
    rows: document.getElementById("btnQuickRows"),
    events: document.getElementById("btnQuickEvents"),
  },
  schemaAdd: document.getElementById("btnSchemaAdd"),
  schemaDrop: document.getElementById("btnSchemaDrop"),
  inspectorList: document.getElementById("eventList"),
  inspectorDetail: document.getElementById("eventDetail"),
  inspectorPrev: document.getElementById("eventPrev"),
  inspectorNext: document.getElementById("eventNext"),
  inspectorReplay: document.getElementById("eventReplay"),
  jumpInspector: document.getElementById("btnJumpInspector"),
};

function ensureHeroCtas() {
  if (typeof document === "undefined") return;
  const actions = document.querySelector(".hero-pathways-actions");
  if (!actions) return;

  if (!document.getElementById("btnGuidedTour")) {
    const guided = document.createElement("button");
    guided.id = "btnGuidedTour";
    guided.type = "button";
    guided.className = "btn-primary";
    guided.textContent = "Start guided walkthrough";
    actions.appendChild(guided);
  }

  if (!document.getElementById("btnOnboarding")) {
    const onboarding = document.createElement("button");
    onboarding.id = "btnOnboarding";
    onboarding.type = "button";
    onboarding.className = "btn-ghost";
    onboarding.textContent = "How the playground works";
    actions.appendChild(onboarding);
  }

  els.guidedTourButton = document.getElementById("btnGuidedTour");
  els.onboardingButton = document.getElementById("btnOnboarding");
}

function ensureOnboardingElements() {
  if (typeof document === "undefined") return;
  if (!els.onboardingOverlay) {
    els.onboardingOverlay = document.getElementById("onboardingOverlay");
  }
  if (!els.onboardingClose) {
    els.onboardingClose = document.getElementById("onboardingClose");
  }
  if (!els.onboardingDismiss) {
    els.onboardingDismiss = document.getElementById("onboardingDismiss");
  }
  if (!els.onboardingStart) {
    els.onboardingStart = document.getElementById("onboardingStart");
  }
  if (!els.onboardingEasterEgg) {
    els.onboardingEasterEgg = document.getElementById("onboardingEasterEgg");
  }
}

if (typeof document !== "undefined") {
  ensureHeroCtas();
  document.getElementById("btnGuidedTour")?.addEventListener("click", () => startGuidedTour());
  document.getElementById("btnOnboarding")?.addEventListener("click", () => {
    showOnboarding();
  });
  document.getElementById("btnReset")?.addEventListener("click", () => {
    storage.remove(STORAGE_KEYS.state);
    storage.remove(STORAGE_KEYS.lastTemplate);
    storage.remove(STORAGE_KEYS.onboarding);
    storage.remove(STORAGE_KEYS.officeOptIn);
    location.reload();
  });
}

const uiState = {
  selectedEventIndex: null, // index within state.events
  lastShareId: null,
  scenarioFilter: "",
  scenarioTags: [],
  previewTemplate: null,
  pendingShareId: (() => {
    if (typeof window === "undefined") return null;
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("scenario");
    } catch {
      return null;
    }
  })(),
  expandedTemplateId: null,
  editorDraft: {},
  editorTouched: {},
  pendingOperation: null,
  eventLogFilters: {
    methodId: null,
    op: null,
    table: null,
    txnId: null,
  },
};

let toastHost = null;
let eventLogWidgetHandle = null;
let eventLogWidgetLoad = null;
const eventLogRowEventMap = new Map();
let comparatorPaused = false;
let applyPausedBanner = null;
let officeBankruptcyOverlay = null;

function featureFlagApi() {
  if (typeof window === "undefined") return undefined;
  return window.cdcFeatureFlags;
}

function hasFeatureFlag(flag) {
  const api = featureFlagApi();
  if (!api) return true;
  const all = api.all?.();
  if (Array.isArray(all) && all.length > 0) {
    if (typeof api.has === "function") return Boolean(api.has(flag));
    return all.map(String).includes(flag);
  }
  return true;
}

function hasCrudFixFlag() {
  return hasFeatureFlag("ff_crud_fix");
}

function ensureToastHost() {
  if (!hasCrudFixFlag()) return;
  if (toastHost || typeof document === "undefined") return;
  toastHost = document.createElement("div");
  toastHost.id = "toastStack";
  toastHost.className = "toast-stack";
  document.body.appendChild(toastHost);
}

function pushToast(message, tone = "info", options = {}) {
  if (!hasCrudFixFlag()) return;
  ensureToastHost();
  if (!toastHost) return;
  const { timeout = 4000 } = options;
  const toast = document.createElement("div");
  toast.className = `toast toast--${tone}`;
  toast.setAttribute("role", "status");
  toast.textContent = message;

  const dismiss = () => {
    toast.classList.add("toast--leaving");
    setTimeout(() => {
      toast.remove();
    }, 250);
  };

  toast.addEventListener("click", dismiss);
  toastHost.appendChild(toast);

  if (timeout > 0) {
    setTimeout(dismiss, timeout);
  }
}

function pushErrorToast(message, options = {}) {
  pushToast(message, "error", options);
}

const learningConfig = [
  {
    id: "schema",
    target: "#schema",
    tip: "Add at least one column and designate a primary key so updates can locate rows.",
    completeTip: "Nice foundation. Explore schema walkthrough to add/drop columns.",
    isComplete: () => state.schema.length > 0,
  },
  {
    id: "rows",
    target: "#table-state",
    tip: "Seed sample data or insert rows so you have something to mutate.",
    completeTip: "Table looks good. Trigger some inserts, updates, or deletes next.",
    isComplete: () => state.rows.length > 0,
  },
  {
    id: "events",
    target: "#change-feed",
    tip: "Run inserts, updates, deletes, or emit snapshot to see change events stream in.",
    completeTip: "Great! Copy or download NDJSON, then compare lanes in the metrics dashboard.",
    isComplete: () => state.events.length > 0,
  },
];

const METHOD_KEYS = ["polling", "trigger", "log"];

const TOUR_DEFAULT_TIMEOUT = 4500;
const TOUR_COMPARATOR_TIMEOUT = 7000;
const GUIDED_TOUR_STEPS = [
  {
    id: "workspace-schema",
    selector: "#schema",
    title: "Model your schema",
    description: "Add at least one column and mark a primary key so downstream mutations can locate rows.",
  },
  {
    id: "workspace-rows",
    selector: "#table-state",
    title: "Populate rows",
    description: "Seed sample data or enter your own records before you start emitting CDC events.",
  },
  {
    id: "workspace-events",
    selector: "#change-feed",
    title: "Stream events",
    description: "Trigger inserts, updates, deletes, or schema changes here. Watch offsets climb and tombstones land when deletes fire.",
  },
  {
    id: "workspace-schema-demo",
    selector: ".schema-demo-actions",
    title: "Schema walkthrough",
    description: "Use these helpers to add or drop the demo column while events stream. Schema change events land alongside CDC operations.",
  },
  {
    id: "comparator-preset",
    selector: ".sim-shell__preset-row",
    title: "Pick a vendor preset",
    timeout: TOUR_COMPARATOR_TIMEOUT,
    description: "Choose the pipeline you want to mirror. The badges reveal source, capture, transport, and sink terminology for the walkthrough.",
  },
  {
    id: "comparator-callouts",
    selector: '[data-tour-target="comparator-callouts"]',
    title: "Honest method callouts",
    timeout: TOUR_COMPARATOR_TIMEOUT,
    getDescription: element => {
      const text = element?.textContent ? element.textContent.trim() : "";
      if (text) {
        return `${text} These callouts are reused in the spotlight so the comparator and workspace stay in sync.`;
      }
      return "Each comparator lane surfaces trade-off copy so the spotlight can reference the exact same language.";
    },
  },
  {
    id: "comparator-metrics",
    selector: '[data-tour-target="comparator-metrics"]',
    title: "Compare lane metrics",
    timeout: TOUR_COMPARATOR_TIMEOUT,
    description:
      "Lag, throughput, delete capture, ordering, and write amplification update live. Use the diff overlay just below to see missing, extra, and out-of-order operations.",
  },
  {
    id: "comparator-dashboard",
    selector: '.sim-shell__metrics-dashboard',
    title: "Metrics dashboard",
    timeout: TOUR_COMPARATOR_TIMEOUT,
    description:
      "Totals across produced/consumed/backlog sit here. Hover to see per-lane lag percentiles, missed deletes, and trigger write amplification.",
  },
  {
    id: "comparator-actions",
    selector: '[data-tour-target="comparator-actions"]',
    title: "Drive the deterministic clock",
    timeout: TOUR_COMPARATOR_TIMEOUT,
    description:
      "Start, pause, or step the timeline. The deterministic clock (`cdcComparatorClock`) powers this spotlight and any guided replay you script.",
  },
];

let activeTour = null;

function isComparatorFlagEnabled() {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(window.cdcFeatureFlags?.has?.("comparator_v2"));
  } catch {
    return false;
  }
}

function renderComparatorFlagState(enabled) {
  const panel = document.getElementById("sim-shell-preview");
  if (!panel) return;
  panel.dataset.comparatorEnabled = enabled ? "true" : "false";

  const noteClass = "comparator-flag-note";
  let note = panel.querySelector(`.${noteClass}`);
  const root = document.getElementById("simShellRoot");

  if (!enabled) {
    if (!note) {
      note = document.createElement("p");
      note.className = noteClass;
      panel.insertBefore(note, panel.querySelector("#simShellRoot"));
    }
    note.textContent = "Comparator preview disabled. Enable the comparator_v2 flag to load the CDC Method Comparator.";
    if (root && root.children.length === 0) {
      root.innerHTML = "<p class=\"sim-shell__placeholder\">Comparator preview is currently disabled.</p>";
    }
  } else if (note) {
    note.remove();
    if (root && /Comparator preview is currently disabled/.test(root.textContent || "")) {
      root.innerHTML = "<p>Preparing simulator preview…</p>";
    }
  }
}

function renderMethodGuidance() {
  const container = els.methodGuidance;
  if (!container) return;
  const copy = typeof window !== "undefined" ? window.CDC_METHOD_COPY : null;
  if (!copy) {
    container.innerHTML = "";
    return;
  }

  const fragment = document.createDocumentFragment();
  const lead = document.createElement("p");
  lead.className = "section-lead";
  lead.textContent = "Use the comparator preview to watch each capture pattern respond to the same operations. Start the guided walkthrough to see how capture choices change envelopes.";
  fragment.appendChild(lead);

  const heading = document.createElement("h3");
  heading.className = "method-guidance__heading";
  heading.textContent = "When to use which";
  fragment.appendChild(heading);

  const list = document.createElement("dl");
  list.className = "method-guidance__list";

  METHOD_KEYS.forEach(key => {
    const entry = copy[key];
    if (!entry) return;
    const dt = document.createElement("dt");
    dt.textContent = entry.label;
    const dd = document.createElement("dd");
    dd.textContent = entry.whenToUse;
    list.appendChild(dt);
    list.appendChild(dd);
  });

  fragment.appendChild(list);
  container.innerHTML = "";
  container.appendChild(fragment);
}

function getTemplateById(id) {
  if (!id) return null;
  return SCENARIO_TEMPLATES.find(t => t.id === id) || null;
}

function pickTemplateIconKey(tags) {
  const normalized = Array.isArray(tags)
    ? tags.map(tag => (typeof tag === "string" ? tag.toLowerCase() : ""))
    : [];
  if (normalized.some(tag => ["payments", "risk", "latency"].includes(tag))) return "payments";
  if (normalized.some(tag => ["orders", "fulfilment", "commerce"].includes(tag))) return "orders";
  if (normalized.some(tag => ["iot", "telemetry", "anomaly"].includes(tag))) return "telemetry";
  if (normalized.some(tag => ["schema", "backfill", "migration"].includes(tag))) return "schema";
  return "default";
}

function createTemplateIcon(tags) {
  const wrap = document.createElement("span");
  wrap.className = "template-icon";

  const iconKey = pickTemplateIconKey(tags);
  const iconDef = TEMPLATE_ICON_LIBRARY[iconKey] || TEMPLATE_ICON_LIBRARY.default;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", iconDef.viewBox);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  (iconDef.paths || []).forEach(d => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.5");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
  });

  wrap.appendChild(svg);
  return wrap;
}

function toggleTemplateExpansion(templateId) {
  uiState.expandedTemplateId = uiState.expandedTemplateId === templateId ? null : templateId;
  renderTemplateGallery();
}

function renderTemplateGallery() {
  if (!els.templateGallery) return;
  els.templateGallery.innerHTML = "";
  if (els.scenarioFilter && els.scenarioFilter.value !== uiState.scenarioFilter) {
    els.scenarioFilter.value = uiState.scenarioFilter;
  }

  const allTags = Array.from(new Set(
    SCENARIO_TEMPLATES.flatMap(template => template.tags || [])
  )).sort((a, b) => a.localeCompare(b));
  renderTemplateTags(allTags);

  const filter = (uiState.scenarioFilter || "").trim().toLowerCase();
  const templates = SCENARIO_TEMPLATES.filter(template => {
    if (!matchesTagFilters(template)) return false;
    if (!filter) return true;
    const haystack = [
      template.name,
      template.description,
      template.highlight,
      template.id,
      (template.tags || []).join(" "),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(filter);
  });

  if (!templates.length) {
    const empty = document.createElement("p");
    empty.className = "template-empty";
    empty.textContent = "No scenarios match your filter.";
    els.templateGallery.appendChild(empty);
    return;
  }

  templates.forEach(template => {
    const card = document.createElement("article");
    card.className = "template-card";
    const isActive = state.scenarioId === template.id;
    const isExpanded = uiState.expandedTemplateId === template.id || isActive;

    const glow = document.createElement("span");
    glow.className = "template-card__glow";
    card.appendChild(glow);

    if (isActive) card.classList.add("is-active");
    if (isExpanded) card.classList.add("is-expanded");

    const header = document.createElement("button");
    header.type = "button";
    header.className = "template-card__header";
    header.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    header.onclick = () => toggleTemplateExpansion(template.id);

    const leading = document.createElement("div");
    leading.className = "template-card__leading";
    leading.appendChild(createTemplateIcon(template.tags));

    const textWrap = document.createElement("div");
    textWrap.className = "template-card__text";

    const kicker = document.createElement("span");
    kicker.className = "template-card__kicker";
    kicker.textContent = template.kicker || "Real-world scenario";
    textWrap.appendChild(kicker);

    const titleRow = document.createElement("div");
    titleRow.className = "template-card__title-row";
    const title = document.createElement("h4");
    title.textContent = template.name;
    titleRow.appendChild(title);

    if (isActive) {
      const activeBadge = document.createElement("span");
      activeBadge.className = "template-card__status";
      activeBadge.textContent = "Active";
      titleRow.appendChild(activeBadge);
    }

    const summary = document.createElement("p");
    summary.className = "template-card__summary";
    summary.textContent = template.highlight || template.description;

    textWrap.appendChild(titleRow);
    textWrap.appendChild(summary);

    const metaRow = document.createElement("div");
    metaRow.className = "template-card__meta";

    const tableChip = document.createElement("span");
    tableChip.className = "template-chip template-chip--ghost";
    tableChip.textContent = template.table ? `${template.table} table` : "Generic table";
    metaRow.appendChild(tableChip);

    const rows = Array.isArray(template.rows) ? template.rows.length : 0;
    const ops = Array.isArray(template.ops) ? template.ops.length : 0;

    const stats = [
      {
        label: "Seed rows",
        value: rows,
        className: "template-stat--rows",
        iconPath: "M6 8.5h12m-12 4h12M6 12.5v3.75A1.25 1.25 0 0 0 7.25 17.5h9.5A1.25 1.25 0 0 0 18 16.25V12.5m0-4.75V7.75A1.25 1.25 0 0 0 16.75 6.5h-9.5A1.25 1.25 0 0 0 6 7.75V7.9",
      },
      {
        label: "Ops queued",
        value: ops,
        className: "template-stat--ops",
        iconPath: "M6.75 8.75v-2m0 0h-2m2 0 6.5 6.5m4-4v2m0 0h2m-2 0-2.75-2.75M7 18h10.25M7 15.5h6.5",
      },
    ];

    const buildStatIcon = pathD => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("aria-hidden", "true");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathD);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "1.5");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      svg.appendChild(path);
      return svg;
    };

    stats.forEach(stat => {
      const statEl = document.createElement("span");
      statEl.className = `template-stat ${stat.className}`;

      const iconWrap = document.createElement("span");
      iconWrap.className = "template-stat__icon";
      iconWrap.appendChild(buildStatIcon(stat.iconPath));

      const textWrap = document.createElement("span");
      textWrap.className = "template-stat__text";
      const valueEl = document.createElement("strong");
      valueEl.textContent = String(stat.value);
      valueEl.className = "template-stat__value";
      const labelEl = document.createElement("small");
      labelEl.textContent = stat.label;
      labelEl.className = "template-stat__label";
      textWrap.appendChild(valueEl);
      textWrap.appendChild(labelEl);

      statEl.appendChild(iconWrap);
      statEl.appendChild(textWrap);
      metaRow.appendChild(statEl);
    });

    textWrap.appendChild(metaRow);

    leading.appendChild(textWrap);
    header.appendChild(leading);

    const chevron = document.createElement("span");
    chevron.className = "template-card__chevron";
    chevron.setAttribute("aria-hidden", "true");

    const chevronIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    chevronIcon.setAttribute("viewBox", "0 0 24 24");
    const chevronPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    chevronPath.setAttribute("d", "M8.25 10.5 12 14.25 15.75 10.5");
    chevronPath.setAttribute("fill", "none");
    chevronPath.setAttribute("stroke", "currentColor");
    chevronPath.setAttribute("stroke-width", "1.5");
    chevronPath.setAttribute("stroke-linecap", "round");
    chevronPath.setAttribute("stroke-linejoin", "round");
    chevronIcon.appendChild(chevronPath);
    chevron.appendChild(chevronIcon);

    header.appendChild(chevron);

    const body = document.createElement("div");
    body.className = "template-card__body" + (isExpanded ? "" : " is-collapsed");
    body.hidden = !isExpanded;
    const desc = document.createElement("p");
    desc.className = "template-card__description";
    desc.textContent = template.description;
    body.appendChild(desc);

    if (template.highlight) {
      const highlight = document.createElement("p");
      highlight.className = "template-highlight";
      highlight.textContent = template.highlight;
      body.appendChild(highlight);
    }

    const tagRow = document.createElement("div");
    tagRow.className = "template-chip-row";
    (template.tags || []).forEach(tag => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "template-chip";
      const active = uiState.scenarioTags.includes(tag);
      chip.setAttribute("aria-pressed", active ? "true" : "false");
      chip.textContent = `#${tag}`;
      chip.onclick = () => toggleScenarioTag(tag);
      tagRow.appendChild(chip);
    });
    if (tagRow.childElementCount) {
      body.appendChild(tagRow);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-primary";
    if (state.scenarioId === template.id) {
      button.textContent = "Active";
      button.disabled = true;
    } else {
      button.textContent = "Use template";
      button.onclick = () => {
        applyScenarioTemplate(template);
      };
    }

    const previewBtn = document.createElement("button");
    previewBtn.type = "button";
    previewBtn.className = "btn-ghost template-preview";
    previewBtn.textContent = "Preview";
    previewBtn.onclick = () => openScenarioPreview(template);

    const downloadBtn = document.createElement("button");
    downloadBtn.type = "button";
    downloadBtn.className = "btn-ghost template-download";
    downloadBtn.textContent = "Download JSON";
    downloadBtn.onclick = () => downloadScenarioTemplate(template);

    const actions = document.createElement("div");
    actions.className = "template-card__actions";
    actions.appendChild(button);
    actions.appendChild(previewBtn);
    actions.appendChild(downloadBtn);
    body.appendChild(actions);

    card.appendChild(header);
    card.appendChild(body);
    els.templateGallery.appendChild(card);
  });
}

function matchesTagFilters(template) {
  if (!uiState.scenarioTags.length) return true;
  if (!Array.isArray(template.tags) || !template.tags.length) return false;
  return uiState.scenarioTags.every(tag => template.tags.includes(tag));
}

function renderTemplateTags(allTags) {
  if (!els.templateTagBar) return;
  els.templateTagBar.innerHTML = "";
  if (!allTags.length) return;

  allTags.forEach(tag => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "template-tag";
    const active = uiState.scenarioTags.includes(tag);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
    btn.textContent = `#${tag}`;
    btn.onclick = () => toggleScenarioTag(tag);
    els.templateTagBar.appendChild(btn);
  });

  if (uiState.scenarioTags.length) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "template-tag template-tag--clear";
    clear.textContent = "Clear tags";
    clear.onclick = () => {
      uiState.scenarioTags = [];
      saveTemplateTags(uiState.scenarioTags);
      renderTemplateGallery();
      window.dispatchEvent(new CustomEvent("cdc:scenario-filter", {
        detail: { query: uiState.scenarioFilter, tags: uiState.scenarioTags },
      }));
    };
    els.templateTagBar.appendChild(clear);
  }
}

function toggleScenarioTag(tag) {
  const idx = uiState.scenarioTags.indexOf(tag);
  if (idx === -1) {
    uiState.scenarioTags.push(tag);
  } else {
    uiState.scenarioTags.splice(idx, 1);
  }
  saveTemplateTags(uiState.scenarioTags);
  renderTemplateGallery();
  window.dispatchEvent(new CustomEvent("cdc:scenario-filter", {
    detail: { query: uiState.scenarioFilter, tags: uiState.scenarioTags },
  }));
}

function openScenarioPreview(template) {
  if (!els.scenarioPreviewModal) return;
  uiState.previewTemplate = template;
  if (els.scenarioPreviewTitle) {
    els.scenarioPreviewTitle.textContent = template.label || template.name || "Scenario preview";
  }
  if (els.scenarioPreviewDescription) {
    els.scenarioPreviewDescription.textContent = template.description || "";
  }
  renderPreviewTags(template.tags || []);
  renderPreviewRows(template.rows || [], template.schema || []);
  const ops = Array.isArray(template.ops) && template.ops.length
    ? template.ops
    : deriveOpsFromEvents(template.events || []);
  renderPreviewOps(ops);
  els.scenarioPreviewModal.hidden = false;
}

function closeScenarioPreview() {
  if (!els.scenarioPreviewModal) return;
  els.scenarioPreviewModal.hidden = true;
  uiState.previewTemplate = null;
}

function renderPreviewTags(tags) {
  if (!els.scenarioPreviewTags) return;
  els.scenarioPreviewTags.innerHTML = "";
  tags.forEach(tag => {
    const chip = document.createElement("span");
    chip.className = "template-chip";
    chip.textContent = `#${tag}`;
    els.scenarioPreviewTags.appendChild(chip);
  });
}

function renderPreviewRows(rows, schema) {
  if (!els.scenarioPreviewRows) return;
  const table = els.scenarioPreviewRows;
  table.innerHTML = "";
  if (!schema.length || !rows.length) {
    const caption = document.createElement("caption");
    caption.textContent = rows.length ? "Schema unavailable" : "No seed rows";
    table.appendChild(caption);
    return;
  }

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  schema.forEach(col => {
    const th = document.createElement("th");
    th.textContent = `${col.name} (${col.type || "any"})`;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  const tbody = document.createElement("tbody");
  rows.slice(0, 5).forEach(row => {
    const tr = document.createElement("tr");
    schema.forEach(col => {
      const td = document.createElement("td");
      td.textContent = row[col.name];
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
}

function renderPreviewOps(ops) {
  if (!els.scenarioPreviewOps) return;
  const list = els.scenarioPreviewOps;
  list.innerHTML = "";
  if (!ops.length) {
    const li = document.createElement("li");
    li.textContent = "No operations defined.";
    list.appendChild(li);
    return;
  }
  ops.slice(0, 10).forEach(op => {
    const li = document.createElement("li");
    const verb = op.op === "insert" ? "Insert" : op.op === "update" ? "Update" : "Delete";
    li.textContent = `${verb} ${op.table || "table"}#${op.pk?.id ?? "?"}`;
    list.appendChild(li);
  });
}

function deriveOpsFromEvents(events) {
  if (!Array.isArray(events)) return [];
  return events.map((event, index) => {
    const payload = event?.payload ?? event;
    if (!payload) return null;
    const after = payload.after ?? event?.after ?? null;
    const before = payload.before ?? event?.before ?? null;
    const keyData = event?.key ?? {};
    const pkCandidate = keyData.id ?? keyData.order_id ?? keyData.orderId;
    const fallback = (after && Object.values(after)[0]) || (before && Object.values(before)[0]) || index;
    const pk = { id: String(pkCandidate ?? fallback ?? index) };
    const table = payload.table || event?.table || "table";
    const base = {
      t: Number(payload.ts_ms ?? event?.ts_ms ?? index * 200),
      table,
      pk,
    };
    if (payload.op === "c") {
      return after ? { ...base, op: "insert", after } : null;
    }
    if (payload.op === "u") {
      return after ? { ...base, op: "update", after } : null;
    }
    if (payload.op === "d") {
      return { ...base, op: "delete" };
    }
    return null;
  }).filter(Boolean);
}

function hideOnboarding(markSeen = false) {
  ensureOnboardingElements();
  document.body.classList.remove("is-onboarding");
  if (!els.onboardingOverlay) return;
  els.onboardingOverlay.hidden = true;
  if (markSeen) storage.set(STORAGE_KEYS.onboarding, "seen");
}

function showOnboarding() {
  ensureOnboardingElements();
  if (!els.onboardingOverlay) return;
  els.onboardingOverlay.hidden = false;
  document.body.classList.add("is-onboarding");
  if (els.onboardingEasterEgg) {
    els.onboardingEasterEgg.checked = false;
  }
  const dialog = els.onboardingOverlay.querySelector(".onboarding-dialog");
  if (dialog && typeof dialog.focus === "function") {
    dialog.focus({ preventScroll: true });
  }

  if (els.onboardingClose) {
    const label = els.onboardingClose.getAttribute("aria-label") || "Close onboarding";
    els.onboardingClose.setAttribute(
      "data-tooltip",
      `${label}. Press Esc to dismiss.`
    );
  }
}

function shouldShowOnboarding() {
  ensureOnboardingElements();
  if (!els.onboardingOverlay) return false;
  if (uiState.pendingShareId) return false;

  const seen = storage.get(STORAGE_KEYS.onboarding);
  if (seen) return false;

  const scenarioEligible = state.scenarioId === "default" || !state.schema.length;
  const hasRows = state.rows.length > 0;
  const hasEvents = state.events.length > 0;

  return scenarioEligible && !hasRows && !hasEvents;
}

function maybeShowOnboarding() {
  if (shouldShowOnboarding()) {
    showOnboarding();
  }
}

function applyScenarioTemplate(template, options = {}) {
  if (!template) return;
  resetOfficeShenanigans();
  state.schema = clone(template.schema || []);
  state.schemaVersion = template.schemaVersion ? Number(template.schemaVersion) : 1;
  state.rows = clone(template.rows || []);
  state.events = clone(template.events || []);
  state.scenarioId = template.id;
  state.remoteId = null;

  storage.set(STORAGE_KEYS.lastTemplate, template.id);
  if (options.markSeen !== false) storage.set(STORAGE_KEYS.onboarding, "seen");

  if (state.events.length) {
    uiState.selectedEventIndex = state.events.length - 1;
  } else {
    uiState.selectedEventIndex = null;
  }

  save();
  renderSchema();
  renderEditor();
  renderTable();
  renderJSONLog();
  renderTemplateGallery();
  syncSchemaDemoButtons();

  const focusStep = options.focusStep || (state.rows.length ? "events" : "rows");
  updateLearning(focusStep);
  refreshSchemaStatus(`${template.name} scenario loaded.`, "success");
  trackEvent("workspace.scenario.template_loaded", {
    templateId: template.id,
    rows: state.rows.length,
    ops: state.events.length,
    tags: template.tags || [],
  });
  if (options.closeOnboarding) hideOnboarding(true);
}

function resetWorkspaceState(loadOffice) {
  resetOfficeShenanigans({ resetMegadesk: true });

  if (loadOffice) {
    state.schema = DEFAULT_SCHEMA.map(col => ({ ...col }));
    state.scenarioId = "default";
  } else {
    state.schema = [];
    state.scenarioId = null;
  }

  state.schemaVersion = 1;
  state.rows = [];
  state.events = [];
  state.remoteId = null;
  uiState.selectedEventIndex = null;
  uiState.editorDraft = {};
  uiState.editorTouched = {};
}

function startFromScratch() {
  ensureOnboardingElements();
  const loadOffice = Boolean(els.onboardingEasterEgg?.checked);
  setOfficeSchemaPreference(loadOffice);

  resetWorkspaceState(loadOffice);

  storage.remove(STORAGE_KEYS.lastTemplate);
  if (els.onboardingEasterEgg) els.onboardingEasterEgg.checked = false;

  save();
  renderSchema();
  renderEditor();
  renderTable();
  renderJSONLog();
  renderTemplateGallery();
  syncSchemaDemoButtons();

  refreshSchemaStatus(
    loadOffice ? "Scranton schema unlocked. Dwight is watching." : "Blank workspace ready. Add a column to begin.",
    loadOffice ? "success" : "muted"
  );
  updateLearning("schema");
  trackEvent("workspace.scenario.start_from_scratch", { officeSchema: loadOffice });
  hideOnboarding(true);
}

function resetEventSelection() {
  uiState.selectedEventIndex = null;
}

function selectLastEvent() {
  if (!state.events.length) {
    uiState.selectedEventIndex = null;
  } else {
    uiState.selectedEventIndex = state.events.length - 1;
  }
}

function setShareControlsEnabled(enabled) {
  const disabled = !enabled;
  if (els.saveRemote) els.saveRemote.disabled = disabled;
  if (els.shareLink) els.shareLink.disabled = disabled;
}

function buildShareUrl(id) {
  if (!id) return "";
  const base = (appwrite?.cfg?.shareBaseUrl) || (typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : "");
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}scenario=${encodeURIComponent(id)}`;
}

async function saveScenarioRemote(options = {}) {
  if (!appwrite) {
    refreshSchemaStatus("Connect to Appwrite to save scenarios.", "error");
    return null;
  }
  const { databases, cfg } = appwrite;
  const collectionId = cfg.scenarioCollectionId;
  if (!collectionId) {
    refreshSchemaStatus("Appwrite scenario collection not configured.", "error");
    return null;
  }

  const snapshot = {
    kind: "scenario",
    version: 2,
    saved_at: new Date().toISOString(),
    schema: clone(state.schema),
    rows: clone(state.rows),
    events: clone(state.events),
    scenarioId: state.scenarioId,
    comparator: buildComparatorExport(),
    officeOptIn: officeSchemaOptIn,
  };

  const reuseId = state.remoteId || uiState.lastShareId;
  const targetId = reuseId || (window?.Appwrite ? Appwrite.ID.unique() : `${Date.now()}`);

  const persist = async (id, method) => {
    if (method === "update") {
      return databases.updateDocument(cfg.databaseId, collectionId, id, snapshot);
    }
    return databases.createDocument(cfg.databaseId, collectionId, id, snapshot);
  };

  try {
    const doc = await persist(targetId, reuseId ? "update" : "create");
    state.remoteId = doc.$id;
    uiState.lastShareId = doc.$id;
    save();
    if (!options.silent) flashButton(els.saveRemote, "Saved!");
    return doc.$id;
  } catch (err) {
    console.warn("saveScenarioRemote failed", err?.message || err);
    if (reuseId) {
      try {
        const fallbackId = window?.Appwrite ? Appwrite.ID.unique() : `${Date.now()}-${Math.random()}`;
        const doc = await persist(fallbackId, "create");
        state.remoteId = doc.$id;
        uiState.lastShareId = doc.$id;
        save();
        if (!options.silent) flashButton(els.saveRemote, "Saved!");
        return doc.$id;
      } catch (err2) {
        console.warn("saveScenarioRemote fallback failed", err2?.message || err2);
      }
    }
    if (!options.silent) flashButton(els.saveRemote, "Failed");
    refreshSchemaStatus("Cloud save failed. Check Appwrite configuration.", "error");
    return null;
  }
}

async function copyShareLink() {
  if (!appwrite) {
    refreshSchemaStatus("Connect to Appwrite to share scenarios.", "error");
    return;
  }
  const id = uiState.lastShareId || state.remoteId || await saveScenarioRemote({ silent: true });
  if (!id) {
    flashButton(els.shareLink, "Failed");
    return;
  }

  const url = buildShareUrl(id);
  try {
    await navigator.clipboard.writeText(url);
    flashButton(els.shareLink, "Link copied");
    trackEvent("workspace.share.generated", {
      shareId: id,
      url,
      events: state.events.length,
      rows: state.rows.length,
    });
  } catch (err) {
    try {
      const temp = document.createElement("textarea");
      temp.value = url;
      temp.setAttribute("readonly", "true");
      temp.style.position = "absolute";
      temp.style.left = "-9999px";
      document.body.appendChild(temp);
      temp.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(temp);
      if (ok) {
        flashButton(els.shareLink, "Link copied");
        trackEvent("workspace.share.generated", {
          shareId: id,
          url,
          events: state.events.length,
          rows: state.rows.length,
          fallback: true,
        });
        return;
      }
    } catch {
      // ignore
    }
    flashButton(els.shareLink, "Failed");
    console.warn("copyShareLink failed", err?.message || err);
  }
}

async function maybeHydrateSharedScenario() {
  if (!appwrite) return;
  if (!uiState.pendingShareId) return;
  const shareId = uiState.pendingShareId;
  uiState.pendingShareId = null;

  const { databases, cfg } = appwrite;
  if (!cfg.scenarioCollectionId) return;

  try {
    const doc = await databases.getDocument(cfg.databaseId, cfg.scenarioCollectionId, shareId);
    if (!doc || doc.kind !== "scenario") {
      refreshSchemaStatus("Shared document is not a scenario payload.", "error");
      return;
    }

    const officePref =
      typeof doc.officeOptIn === "boolean"
        ? doc.officeOptIn
        : typeof doc.officeSchemaOptIn === "boolean"
          ? doc.officeSchemaOptIn
          : null;
    if (officePref !== null) {
      setOfficeSchemaPreference(officePref);
    }

    state.schema = doc.schema || [];
    state.schemaVersion = Number(doc.schemaVersion) || 1;
    state.rows = doc.rows || [];
    state.events = doc.events || [];
    state.scenarioId = doc.scenarioId || null;
    state.remoteId = doc.$id;

    if (state.events.length) selectLastEvent(); else resetEventSelection();
    if (state.scenarioId) storage.set(STORAGE_KEYS.lastTemplate, state.scenarioId);
    if (doc.comparator?.preferences) {
      applyComparatorPreferences(doc.comparator.preferences);
    }
    const sharedDetail = buildComparatorSnapshotDetail(doc.comparator, {
      label: doc.scenarioId || "Shared scenario",
      name: doc.scenarioId || "shared",
      isLive: false,
      rowsLength: state.rows.length,
      eventsLength: state.events.length,
    });
    if (sharedDetail) {
      renderComparatorFeedback(sharedDetail);
    }
    uiState.lastShareId = doc.$id;
    save();
    renderSchema();
    renderEditor();
    renderTable();
    renderJSONLog();
    renderTemplateGallery();
    refreshSchemaStatus("Scenario loaded from share link.", "success");
    trackEvent("workspace.scenario.imported", {
      source: "share",
      rows: state.rows.length,
      events: state.events.length,
      scenarioId: state.scenarioId,
    });

    if (typeof window !== "undefined" && window.history?.replaceState) {
      try {
        const params = new URLSearchParams(window.location.search);
        params.delete("scenario");
        const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash || ""}`;
        window.history.replaceState({}, document.title, next);
      } catch {
        // ignore URL errors
      }
    }
  } catch (err) {
    console.warn("Fetch shared scenario failed", err?.message || err);
    refreshSchemaStatus("Unable to load shared scenario. It may have expired.", "error");
  }
}

// ---------- Utilities ----------
const nowTs = () => Date.now();
const clone  = (x) => JSON.parse(JSON.stringify(x));
const comparatorState = {
  summary: null,
  analytics: [],
  diffs: [],
  tags: [],
  preset: null,
  overlay: [],
};
const save   = () => {
  try {
    storage.set(STORAGE_KEYS.state, JSON.stringify(state));
  } catch (err) {
    console.warn("Save to storage failed", err?.message || err);
  }
};

function hasColumn(name) {
  return state.schema.some(col => col.name === name);
}

function trackEvent(event, payload = {}, context = {}) {
  try {
    if (typeof window === "undefined") return;
    const client = window.telemetry;
    if (client && typeof client.track === "function") {
      client.track(event, payload, context);
    }
  } catch (err) {
    console.warn("Telemetry track failed", err?.message || err);
  }
}
const load   = () => {
  try {
    const raw = storage.get(STORAGE_KEYS.state);
    if (!raw) return;
    const s = JSON.parse(raw);
    state.schema = s.schema || [];
    state.rows   = s.rows   || [];
    state.events = s.events || [];
    state.schemaVersion = Number(s.schemaVersion) || 1;
    state.scenarioId = s.scenarioId || null;
    state.remoteId = s.remoteId || null;
    if (!state.scenarioId && state.schema.length && isOfficeSchemaActive()) {
      state.scenarioId = "default";
    }
  } catch { /* ignore */ }
};
const loadTemplateFilter = () => {
  const stored = storage.get(STORAGE_KEYS.scenarioFilter);
  uiState.scenarioFilter = stored || "";
};
const loadOfficeSchemaPreference = () => {
  const raw = storage.get(STORAGE_KEYS.officeOptIn);
  if (raw === null) {
    officeSchemaOptIn = true;
    return;
  }
  officeSchemaOptIn = raw === "true";
};
const setOfficeSchemaPreference = (enabled) => {
  officeSchemaOptIn = Boolean(enabled);
  storage.set(STORAGE_KEYS.officeOptIn, officeSchemaOptIn ? "true" : "false");
};
const flashButton = (btn, msg) => {
  if (!btn) return;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = msg;
  setTimeout(() => {
    btn.textContent = original;
    btn.disabled = false;
  }, 1500);
};

const saveTemplateFilter = (value) => {
  try {
    storage.set(STORAGE_KEYS.scenarioFilter, value);
  } catch (err) {
    console.warn("Save scenario filter failed", err?.message || err);
  }
};

const toNdjson = (events) => events.map(ev => JSON.stringify(ev)).join("\n");

function escapeHtml(str = "") {
  return str.replace(/[&<>"]/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  })[ch] || ch);
}

function highlightJson(json = "") {
  const escaped = escapeHtml(json);
  return escaped.replace(/("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(?::)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
    let cls = "json-number";
    if (match.startsWith("\"")) {
      cls = match.endsWith(":") ? "json-key" : "json-string";
    } else if (match === "true" || match === "false") {
      cls = "json-boolean";
    } else if (match === "null") {
      cls = "json-null";
    }
    return `<span class="${cls}">${match}</span>`;
  });
}

function loadComparatorPreferences() {
  try {
    const raw = storage.get(COMPARATOR_PREFS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn("Comparator prefs parse failed", err);
    return null;
  }
}

function applyComparatorPreferences(prefs) {
  try {
    if (prefs) {
      storage.set(COMPARATOR_PREFS_KEY, JSON.stringify(prefs));
    } else {
      storage.remove(COMPARATOR_PREFS_KEY);
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("cdc:comparator-preferences-set", { detail: prefs || null }));
    }
  } catch (err) {
    console.warn("Comparator prefs apply failed", err);
  }
}

function resetOfficeShenanigans(options = {}) {
  const { resetMegadesk = false } = options;
  officeEasterEgg.toastShown = false;
  officeEasterEgg.schruteToastShown = false;
  officeEasterEgg.seedCount = 0;
  officeEasterEgg.bankruptcyShown = false;

  hideOfficeBankruptcyModal();

  if (resetMegadesk) {
    officeEasterEgg.megadeskActive = false;
    if (typeof document !== "undefined" && document.body) {
      document.body.classList.remove("megadesk-mode");
    }
  }

  if (typeof document !== "undefined") {
    const selectors = [
      ".office-confetti-piece",
      ".office-schrute-buck",
      ".stapler-blob",
    ];
    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(node => node.remove());
    });
  }
}

function showOfficeToastOnce() {
  if (officeEasterEgg.toastShown) return;
  officeEasterEgg.toastShown = true;
  const message = "Bears. Beets. Battle-tested schema.";
  if (hasCrudFixFlag()) {
    pushToast(message, "success", { timeout: 4200 });
  } else {
    refreshSchemaStatus(message, "success");
    setTimeout(() => refreshSchemaStatus(), 4200);
  }
}

function buildComparatorExport() {
  const preferences = loadComparatorPreferences();
  let summary = comparatorState.summary;
  let analytics = comparatorState.analytics;
  let diffs = comparatorState.diffs;
  let tags = comparatorState.tags;
  let preset = comparatorState.preset;
  let overlay = null;
  try {
    if (Array.isArray(comparatorState.overlay)) {
      overlay = comparatorState.overlay.map(entry => ({
        method: entry.method,
        label: entry.label,
        totals: entry.totals,
        issues: entry.issues,
        lag: entry.lag,
      }));
    }
  } catch {
    overlay = null;
  }
  try {
    summary = summary ? JSON.parse(JSON.stringify(summary)) : null;
    analytics = analytics ? JSON.parse(JSON.stringify(analytics)) : [];
    diffs = diffs ? JSON.parse(JSON.stringify(diffs)) : [];
    tags = Array.isArray(tags) ? [...tags] : [];
    preset = preset ? JSON.parse(JSON.stringify(preset)) : null;
  } catch {
    summary = null;
    analytics = [];
    diffs = [];
    tags = [];
    preset = null;
    overlay = null;
  }
  return {
    preferences: preferences || null,
    summary,
    analytics,
    diffs,
    tags,
    preset,
    overlay,
  };
}

function emitSparkleTrail(op = "c") {
  if (isOfficeSchemaActive() && op === "c") {
    emitOfficeStaplerTrail();
    return;
  }

  const source = els.rowEditor;
  const target = els.eventLog;
  if (!source || !target) return;

  const srcRect = source.getBoundingClientRect();
  const dstRect = target.getBoundingClientRect();

  const sparks = 6;
  for (let i = 0; i < sparks; i++) {
    const originX = srcRect.left + srcRect.width * (0.2 + Math.random() * 0.6);
    const originY = srcRect.top + srcRect.height * (0.2 + Math.random() * 0.6);
    const destX = dstRect.left + dstRect.width * (0.15 + Math.random() * 0.7);
    const destY = dstRect.top + dstRect.height * (0.08 + Math.random() * 0.22);

    const sparkle = document.createElement("span");
    sparkle.className = "sparkle";
    sparkle.dataset.op = op;
    sparkle.style.left = `${originX}px`;
    sparkle.style.top = `${originY}px`;
    document.body.appendChild(sparkle);

    const dx = destX - originX;
    const dy = destY - originY;
    const midX = dx * (0.45 + Math.random() * 0.15);
    const midY = dy * (0.45 + Math.random() * 0.2) - 20 * Math.random();
    const duration = 620 + Math.random() * 280;
    const delay = Math.random() * 90;

    const animation = sparkle.animate([
      { transform: "translate(-50%, -50%) scale(0.5)", opacity: 0.95 },
      { transform: `translate(-50%, -50%) translate(${midX}px, ${midY}px) scale(1)`, opacity: 0.8 },
      { transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(0.1)`, opacity: 0 }
    ], { duration, delay, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });

    if (animation.finished) {
      animation.finished.then(() => sparkle.remove()).catch(() => sparkle.remove());
    }
    animation.onfinish = () => sparkle.remove();
    setTimeout(() => sparkle.remove(), duration + delay + 120);
  }
}

function flashAutofillButton(button) {
  if (!button) return;

  const splash = document.createElement("span");
  splash.className = "ops-button__splash";
  if (isOfficeSchemaActive()) {
    splash.dataset.office = "true";
  }
  button.appendChild(splash);

  const cleanup = () => {
    clearTimeout(fallback);
    splash.remove();
  };
  const fallback = setTimeout(cleanup, 720);
  splash.addEventListener("animationend", cleanup, { once: true });
  splash.addEventListener("animationcancel", cleanup, { once: true });

  if (typeof button.focus === "function") {
    requestAnimationFrame(() => {
      try {
        button.focus({ preventScroll: true });
      } catch {
        button.focus();
      }
    });
  }
}

function emitOfficeStaplerTrail() {
  const source = els.rowEditor;
  const target = els.eventLog;
  if (!source || !target) return;

  const srcRect = source.getBoundingClientRect();
  const dstRect = target.getBoundingClientRect();
  const blobs = 5;

  for (let i = 0; i < blobs; i++) {
    const originX = srcRect.left + srcRect.width * (0.25 + Math.random() * 0.5);
    const originY = srcRect.top + srcRect.height * (0.25 + Math.random() * 0.5);
    const destX = dstRect.left + dstRect.width * (0.2 + Math.random() * 0.6);
    const destY = dstRect.top + dstRect.height * (0.12 + Math.random() * 0.26);
    const blob = document.createElement("span");
    blob.className = "stapler-blob";
    blob.style.left = `${originX}px`;
    blob.style.top = `${originY}px`;
    document.body.appendChild(blob);

    const dx = destX - originX;
    const dy = destY - originY;
    const wobbleX = dx * (0.35 + Math.random() * 0.25);
    const wobbleY = dy * (0.35 + Math.random() * 0.25);
    const duration = 720 + Math.random() * 240;
    const delay = Math.random() * 110;

    const animation = blob.animate([
      { transform: "translate(-50%, -50%) scale(0.9)", opacity: 0.94 },
      { transform: `translate(-50%, -50%) translate(${wobbleX}px, ${wobbleY}px) scale(1.05) rotate(${Math.random() * 12 - 6}deg)`, opacity: 0.8 },
      { transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(0.55)`, opacity: 0 }
    ], { duration, delay, easing: "cubic-bezier(0.25, 0.8, 0.25, 1)" });

    const cleanup = () => blob.remove();
    if (animation.finished) {
      animation.finished.then(cleanup).catch(cleanup);
    } else {
      animation.onfinish = cleanup;
      setTimeout(cleanup, duration + delay + 120);
    }
  }
}

function toggleMegadeskMode(force) {
  const desired = typeof force === "boolean" ? force : !officeEasterEgg.megadeskActive;
  officeEasterEgg.megadeskActive = desired;
  const body = typeof document !== "undefined" ? document.body : null;
  if (body) {
    body.classList.toggle("megadesk-mode", desired);
  }
  const officeActive = isOfficeSchemaActive();
  const useToasts = hasCrudFixFlag();
  let rewardDisplayed = false;
  if (desired && officeActive) {
    launchSchruteBucks();
    if (!officeEasterEgg.schruteToastShown) {
      officeEasterEgg.schruteToastShown = true;
      const reward = "Dwight issued Schrute Bucks for proper desk formation.";
      rewardDisplayed = true;
      if (useToasts) {
        pushToast(reward, "success", { timeout: 3200 });
      } else {
        refreshSchemaStatus(reward, "success");
        setTimeout(() => refreshSchemaStatus(), 3200);
      }
    }
  }
  const message = desired ? "Megadesk assembled. Productivity intensifies." : "Megadesk dismantled. Back to one desk.";
  if (useToasts) {
    pushToast(message, "info", { timeout: 2600 });
  } else if (!rewardDisplayed) {
    refreshSchemaStatus(message, "success");
    setTimeout(() => refreshSchemaStatus(), 3200);
  }
}

function launchSchruteBucks() {
  if (typeof document === "undefined") return;
  const host = document.body;
  if (!host) return;

  const originRect = els.rowEditor?.getBoundingClientRect?.();
  const viewportWidth = typeof window !== "undefined"
    ? window.innerWidth
    : document.documentElement?.clientWidth || 0;
  const viewportHeight = typeof window !== "undefined"
    ? window.innerHeight
    : document.documentElement?.clientHeight || 0;
  const originX = originRect ? originRect.left + originRect.width / 2 : viewportWidth / 2;
  const originY = originRect ? originRect.top + originRect.height / 2 : viewportHeight / 2;
  const bills = 3 + Math.floor(Math.random() * 3);

  for (let i = 0; i < bills; i++) {
    const buck = document.createElement("span");
    buck.className = "office-schrute-buck";
    buck.textContent = "Schrute Buck";
    buck.style.left = `${originX}px`;
    buck.style.top = `${originY}px`;
    host.appendChild(buck);

    const driftX = (Math.random() - 0.5) * 220;
    const driftY = -140 - Math.random() * 180;
    const spin = (Math.random() * 30) - 15;
    const duration = 1400 + Math.random() * 500;
    const delay = i * 90;

    const animation = buck.animate([
      { transform: "translate(-50%, -50%) scale(0.85)", opacity: 0 },
      { transform: `translate(-50%, -50%) translate(${driftX / 2}px, ${driftY / 2}px) rotate(${spin}deg) scale(1)`, opacity: 1 },
      { transform: `translate(-50%, -50%) translate(${driftX}px, ${driftY}px) rotate(${spin * 1.5}deg) scale(0.85)`, opacity: 0 }
    ], { duration, delay, easing: "cubic-bezier(0.3, 0.7, 0.3, 1)" });

    const cleanup = () => buck.remove();
    if (animation?.finished) {
      animation.finished.then(cleanup).catch(cleanup);
    } else {
      animation.onfinish = cleanup;
    }
  }
}

function handleMegadeskShortcut(event) {
  if (!event) return;
  const key = typeof event.key === "string" ? event.key.toLowerCase() : "";
  if (!(key === "m" || key === "M")) return;
  const commandPressed = event.metaKey || event.ctrlKey;
  if (!commandPressed || !event.shiftKey) return;
  const target = event.target;
  if (target) {
    const tag = target.tagName;
    if (tag && ["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
    if (target.isContentEditable) return;
  }
  event.preventDefault();
  toggleMegadeskMode();
}

function emitOfficeConfetti() {
  if (typeof document === "undefined") return;
  const host = document.body;
  if (!host) return;
  showOfficeToastOnce();

  const palette = ["#0A5AE8", "#1E88FF", "#7FB3FF", "#F8FAFF", "#FFE173"];
  const originRect = els.rowEditor?.getBoundingClientRect?.();
  const viewportWidth = typeof window !== "undefined"
    ? window.innerWidth
    : document.documentElement?.clientWidth || 0;
  const viewportHeight = typeof window !== "undefined"
    ? window.innerHeight
    : document.documentElement?.clientHeight || 0;
  const originX = originRect ? originRect.left + originRect.width / 2 : viewportWidth / 2 || 0;
  const originY = originRect ? originRect.top + originRect.height / 2 : viewportHeight / 2 || 0;
  const pieces = 16 + Math.floor(Math.random() * 6);

  for (let i = 0; i < pieces; i++) {
    const piece = document.createElement("span");
    piece.className = "office-confetti-piece";
    piece.style.left = `${originX}px`;
    piece.style.top = `${originY}px`;

    const color = palette[Math.floor(Math.random() * palette.length)];
    piece.style.background = `linear-gradient(140deg, ${color} 0%, rgba(255, 255, 255, 0.85) 80%)`;

    const startOffsetX = (Math.random() - 0.5) * 80;
    const startOffsetY = (Math.random() - 0.5) * 32;
    const driftX = startOffsetX + (Math.random() - 0.5) * 240;
    const driftY = startOffsetY + 280 + Math.random() * 180;
    const startRotation = (Math.random() * 120) - 60;
    const endRotation = startRotation + (Math.random() * 720 - 360);
    const duration = 1200 + Math.random() * 600;
    const delay = Math.random() * 90;

    host.appendChild(piece);

    const animation = piece.animate([
      { transform: `translate(${startOffsetX}px, ${startOffsetY}px) rotate(${startRotation}deg)`, opacity: 0.95 },
      { transform: `translate(${driftX}px, ${driftY}px) rotate(${endRotation}deg)`, opacity: 0 }
    ], { duration, delay, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)" });

    const cleanup = () => piece.remove();
    if (animation.finished) {
      animation.finished.then(cleanup).catch(cleanup);
    } else {
      animation.onfinish = cleanup;
      setTimeout(cleanup, duration + delay + 120);
    }
  }
}

function showOfficeBankruptcyModal() {
  if (officeEasterEgg.bankruptcyShown) return;
  officeEasterEgg.bankruptcyShown = true;
  if (typeof document === "undefined") return;
  if (officeBankruptcyOverlay) return;

  const overlay = document.createElement("div");
  overlay.className = "office-bankruptcy-overlay";

  const modal = document.createElement("div");
  modal.className = "office-bankruptcy-modal";

  const emoji = document.createElement("span");
  emoji.className = "office-bankruptcy-emoji";
  emoji.textContent = "🏆";

  const title = document.createElement("h3");
  title.textContent = "Michael declares schema bankruptcy!";

  const copy = document.createElement("p");
  copy.innerHTML = "Three seed runs in a row? That’s a Dundie-worthy effort.<br/>Want to reset the table and start fresh?";

  const actionRow = document.createElement("div");
  actionRow.className = "office-bankruptcy-actions";

  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = "btn-primary";
  confirm.textContent = "I declare schema bankruptcy!";
  confirm.onclick = handleOfficeBankruptcyReset;

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "btn-ghost";
  dismiss.textContent = "Keep hustling";
  dismiss.onclick = hideOfficeBankruptcyModal;

  actionRow.appendChild(confirm);
  actionRow.appendChild(dismiss);

  modal.appendChild(emoji);
  modal.appendChild(title);
  modal.appendChild(copy);
  modal.appendChild(actionRow);
  overlay.appendChild(modal);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) hideOfficeBankruptcyModal();
  });

  document.body.appendChild(overlay);
  officeBankruptcyOverlay = overlay;
}

function hideOfficeBankruptcyModal() {
  if (!officeBankruptcyOverlay) return;
  officeBankruptcyOverlay.remove();
  officeBankruptcyOverlay = null;
}

function handleOfficeBankruptcyReset() {
  state.rows = [];
  state.events = [];
  uiState.selectedEventIndex = null;
  resetOfficeShenanigans();
  save();
  renderTable();
  renderEditor();
  renderJSONLog();
  refreshSchemaStatus("Fresh sheet started. Oscar will handle the paperwork.", "success");
  hideOfficeBankruptcyModal();
  if (hasCrudFixFlag()) {
    pushToast("Fresh table, same Dundies energy.", "info", { timeout: 3500 });
  }
}

function refreshSchemaStatus(message, tone = "muted") {
  const el = els.schemaStatus;
  if (!el) return;
  const columns = state.schema.length;
  const hasPk = state.schema.some(c => c.pk);
  const defaultMsg = columns === 0
    ? "Add a column to begin building your table."
    : hasPk
      ? `${columns} column${columns === 1 ? "" : "s"} defined. Click a pill to remove.`
      : `Define at least one primary key so updates and deletes can locate rows.`;
  const versionSuffix = ` · schema v${Number(state.schemaVersion) || 1}`;
  el.textContent = `${message ?? defaultMsg}${versionSuffix}`;
  el.classList.remove("is-error", "is-success");
  if (tone === "error") el.classList.add("is-error");
  if (tone === "success") el.classList.add("is-success");
}

function hasPrimaryKey() {
  return state.schema.some(col => col.pk);
}

function getPrimaryKeyFields() {
  return state.schema.filter(col => col.pk).map(col => col.name);
}

function ensurePrimaryKeyValues(values) {
  const pks = getPrimaryKeyFields();
  const missing = pks.filter(name => values[name] === null || typeof values[name] === "undefined");
  if (!missing.length) return true;
  pushErrorToast(`Provide values for primary key column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`);
  return false;
}

function demandPrimaryKey(action) {
  if (hasPrimaryKey()) return true;
  const msg = action
    ? `Add a primary key before ${action}.`
    : `Add at least one primary key to continue.`;
  refreshSchemaStatus(msg, "error");
  updateLearning("schema");
  return false;
}

function nextDocumentId() {
  if (!appwrite || !window.Appwrite) return null;
  try {
    return Appwrite.ID.unique();
  } catch {
    return null;
  }
}

function ensureDefaultSchema() {
  let mutated = false;
  if (!state.schema.length) {
    if (officeSchemaOptIn) {
      state.schema = DEFAULT_SCHEMA.map(col => ({ ...col }));
      state.scenarioId = "default";
      state.schemaVersion = 1;
      resetOfficeShenanigans();
      mutated = true;
    } else {
      state.schema = [];
      state.scenarioId = null;
      state.schemaVersion = 1;
      resetOfficeShenanigans({ resetMegadesk: true });
    }
  }
  if (!state.rows.length) {
    state.rows = [];
  }
  return mutated;
}

function isOfficeSchemaActive() {
  if (!state.schema.length) return false;
  if (state.scenarioId && state.scenarioId !== "default") return false;
  if (state.schema.length !== DEFAULT_SCHEMA.length) return false;
  const signature = (col) => `${col.name}::${col.type}::${col.pk ? 1 : 0}`;
  const expected = DEFAULT_SCHEMA.map(signature).slice().sort();
  const actual = state.schema.map(signature).slice().sort();
  for (let i = 0; i < expected.length; i++) {
    if (expected[i] !== actual[i]) return false;
  }
  return true;
}

// Debezium-ish envelope
function buildEvent(op, before, after) {
  const pkFields = state.schema.filter(c => c.pk).map(c => c.name);
  const key = {};
  for (const k of pkFields) key[k] = (after ?? before)?.[k] ?? null;

  if (!els.debzWrap.checked) {
    return { op, before: els.includeBefore.checked ? before ?? null : null, after, ts_ms: nowTs() };
  }

  return {
    payload: {
      before: els.includeBefore.checked ? before ?? null : null,
      after:  after ?? null,
      source: { name: "playground", version: "0.1.0" },
      op,            // c,u,d,r
      ts_ms: nowTs()
    },
    key
  };
}
function getFilterFlags() {
  return {
    c: document.getElementById("filterC")?.checked ?? true,
    u: document.getElementById("filterU")?.checked ?? true,
    d: document.getElementById("filterD")?.checked ?? true,
    r: document.getElementById("filterR")?.checked ?? true,
    s: document.getElementById("filterS")?.checked ?? true,
  };
}

const DEFAULT_EVENT_LOG_FILTERS = Object.freeze({
  methodId: null,
  op: null,
  table: null,
  txnId: null,
});

function normalizeFilterValue(value) {
  if (value == null) return null;
  const stringValue = String(value).trim();
  return stringValue ? stringValue : null;
}

function normalizeFilterOp(value) {
  const normalized = normalizeFilterValue(value);
  return normalized ? normalized.toLowerCase() : null;
}

function getEventLogFiltersState() {
  if (!uiState.eventLogFilters) {
    uiState.eventLogFilters = { ...DEFAULT_EVENT_LOG_FILTERS };
  }
  return uiState.eventLogFilters;
}

function setEventLogFilters(next) {
  const current = getEventLogFiltersState();
  const nextState = {
    methodId: next.methodId ?? null,
    op: next.op ?? null,
    table: next.table ?? null,
    txnId: next.txnId ?? null,
  };
  if (
    current.methodId === nextState.methodId &&
    current.op === nextState.op &&
    current.table === nextState.table &&
    current.txnId === nextState.txnId
  ) {
    return false;
  }
  uiState.eventLogFilters = nextState;
  return true;
}

function normalizeEventLogFiltersInput(input = {}) {
  return {
    methodId: normalizeFilterValue(input.methodId),
    op: normalizeFilterOp(input.op),
    table: normalizeFilterValue(input.table),
    txnId: normalizeFilterValue(input.txnId),
  };
}

function getOp(ev) {
  // supports both plain and Debezium-envelope shapes
  const direct = ev.op ?? ev.payload?.op;
  if (direct) return direct;
  if (typeof ev.kind === "string" && ev.kind.startsWith("SCHEMA_")) return "s";
  return "u";
}

function getEventPayload(event) {
  return event?.payload ?? event ?? {};
}

function getEventBefore(event) {
  const payload = getEventPayload(event);
  return payload?.before ?? event?.before ?? null;
}

function getEventAfter(event) {
  const payload = getEventPayload(event);
  return payload?.after ?? event?.after ?? null;
}

function getEventTimestamp(event) {
  const payload = getEventPayload(event);
  const value = payload?.ts_ms ?? event?.ts_ms ?? null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolvePrimaryKeyColumn() {
  const pkCol = state.schema.find(col => col.pk);
  return pkCol ? pkCol.name : null;
}

function extractPrimaryKeyValue(event, pkColumn, fallback) {
  if (!pkColumn) return fallback;
  if (event?.key && event.key[pkColumn] != null) return event.key[pkColumn];
  const after = getEventAfter(event);
  if (after && after[pkColumn] != null) return after[pkColumn];
  const before = getEventBefore(event);
  if (before && before[pkColumn] != null) return before[pkColumn];
  return fallback;
}

function getSchemaChangeDetail(event) {
  if (!event) return null;
  const directKind = typeof event.kind === "string" && event.kind.startsWith("SCHEMA_") ? event.kind : null;
  const payloadChange = event.payload?.schema?.change ?? null;
  const kind = directKind || (payloadChange?.kind && String(payloadChange.kind).startsWith("SCHEMA_") ? payloadChange.kind : null);
  if (!kind) return null;
  const column = event.column || payloadChange?.column || null;
  const version = event.schemaVersion ?? event.payload?.schema?.version ?? null;
  return { kind, column, schemaVersion: version };
}

const EVENT_LOG_METHOD = {
  id: "playground",
  label: "Playground events",
};

function deriveEventLogMeta(event, index) {
  const op = normalizeFilterOp(getOp(event));
  const schemaChange = getSchemaChangeDetail(event);
  const rawTable =
    op === "s"
      ? "schema"
      : event.table ?? state.scenarioId ?? "workspace";
  const table = rawTable != null ? String(rawTable) : null;
  const txnId =
    normalizeFilterValue(event.txnId) ??
    normalizeFilterValue(event.payload?.txnId) ??
    null;
  const topic = event.topic ?? (op === "s" ? "cdc.schema" : "playground");
  const offset = typeof event.offset === "number" ? event.offset : null;
  const tsMs = getEventTimestamp(event);
  return {
    methodId: EVENT_LOG_METHOD.id,
    op,
    table,
    txnId,
    topic,
    offset,
    tsMs,
    schemaChange,
  };
}

function eventMatchesFilters(meta, filters) {
  if (!filters) return true;
  if (filters.methodId && filters.methodId !== meta.methodId) return false;
  if (filters.op && filters.op !== meta.op) return false;
  if (filters.table && filters.table !== meta.table) return false;
  if (filters.txnId && filters.txnId !== meta.txnId) return false;
  return true;
}

function buildEventLogItems(events = state.events, options = {}) {
  const { applyEventLogFilters = true } = options;
  const allowed = getFilterFlags();
  const filters = applyEventLogFilters ? getEventLogFiltersState() : null;
  const items = [];
  events.forEach((event, index) => {
    const meta = deriveEventLogMeta(event, index);
    const opKey = meta.op ?? "";
    if (!(allowed[opKey] ?? true)) return;
    if (applyEventLogFilters && !eventMatchesFilters(meta, filters)) return;
    items.push({ event, index, meta });
  });
  return items;
}

function deriveEventLogFilterOptions(items) {
  const tables = new Set();
  const txns = new Set();
  const ops = new Set();
  items.forEach(({ meta }) => {
    if (meta.table) tables.add(meta.table);
    if (meta.txnId) txns.add(meta.txnId);
    if (meta.op) ops.add(meta.op);
  });
  const prioritized = ["c", "u", "d", "s"].filter(op => ops.has(op));
  const extras = Array.from(ops).filter(op => !prioritized.includes(op));
  extras.sort();
  return {
    methods: items.length ? [EVENT_LOG_METHOD] : [],
    ops: [...prioritized, ...extras],
    tables: Array.from(tables).sort(),
    txns: Array.from(txns).sort(),
  };
}

function sanitizeEventLogFilters(filterOptions) {
  const current = getEventLogFiltersState();
  const next = {
    methodId: current.methodId,
    op: current.op,
    table: current.table,
    txnId: current.txnId,
  };
  if (next.methodId && !filterOptions.methods.some(method => method.id === next.methodId)) {
    next.methodId = null;
  }
  if (next.op && !filterOptions.ops.includes(next.op)) {
    next.op = null;
  }
  if (next.table && !filterOptions.tables.includes(next.table)) {
    next.table = null;
  }
  if (next.txnId && !filterOptions.txns.includes(next.txnId)) {
    next.txnId = null;
  }
  setEventLogFilters(next);
  return getEventLogFiltersState();
}

function filterEvents(evts) {
  if (!Array.isArray(evts) || evts.length === 0) return [];
  const items = buildEventLogItems(evts, { applyEventLogFilters: true });
  return items.map(item => item.event);
}

function getRenderableEvents() {
  return buildEventLogItems(state.events);
}

function renderJSONLog() {
  const baseItems = buildEventLogItems(state.events, { applyEventLogFilters: false });
  const filterOptions = deriveEventLogFilterOptions(baseItems);
  sanitizeEventLogFilters(filterOptions);
  const filteredItems = buildEventLogItems(state.events, { applyEventLogFilters: true });
  renderReactEventLog(filteredItems, baseItems, filterOptions);
  renderEventInspector(filteredItems);
  renderEventStats();
  updateLearning();
  broadcastComparatorState();
}

function renderEventStats() {
  if (!els.eventStatsPanel) return;
  const events = Array.isArray(state.events) ? state.events : [];
  const counts = { c: 0, u: 0, d: 0, r: 0, s: 0 };
  events.forEach(event => {
    const op = getOp(event);
    if (Object.prototype.hasOwnProperty.call(counts, op)) {
      counts[op] += 1;
    }
  });

  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const hasEvents = total > 0;
  els.eventStatsPanel.classList.toggle("is-empty", !hasEvents);
  if (els.eventStatsEmpty) {
    els.eventStatsEmpty.hidden = hasEvents;
  }
  if (els.eventStatsGrid) {
    els.eventStatsGrid.setAttribute("aria-hidden", hasEvents ? "false" : "true");
  }
  if (els.eventStatsTotal) {
    els.eventStatsTotal.textContent = formatCount(total);
  }
  if (els.eventStatsCounts) {
    Object.entries(els.eventStatsCounts).forEach(([op, node]) => {
      if (node) node.textContent = formatCount(counts[op] || 0);
    });
  }

  const lastEvent = events[events.length - 1] || null;
  if (els.eventStatsLastOp) {
    if (lastEvent) {
      const op = getOp(lastEvent);
      const opMeta = OP_METADATA[op] || { label: "Event" };
      els.eventStatsLastOp.textContent = `${opMeta.label} event`;
    } else {
      els.eventStatsLastOp.textContent = "Waiting for activity";
    }
  }
  if (els.eventStatsLastTs) {
    if (lastEvent) {
      const ts = getEventTimestamp(lastEvent);
      els.eventStatsLastTs.textContent = ts != null ? formatTimestamp(ts) : "Just now";
    } else {
      els.eventStatsLastTs.textContent = "—";
    }
  }
  if (els.eventStatsPulse) {
    els.eventStatsPulse.textContent = hasEvents ? "Live" : "Idle";
  }
  if (els.jumpInspector) {
    els.jumpInspector.disabled = !hasEvents;
  }
}

function renderLegacyEventLog(items) {
  if (!els.eventLog) return;
  if (!items.length) {
    els.eventLog.textContent = "// no events yet (check filters)";
    return;
  }
  const payload = items.map(({ event }) => JSON.stringify(event, null, 2)).join("\n");
  els.eventLog.innerHTML = highlightJson(payload);
}

function buildEventLogRows(items) {
  const pkColumn = resolvePrimaryKeyColumn();
  return items.map(({ event, index, meta }) => {
    const opValue = typeof event.op === "string" ? event.op : meta.op ?? "";
    const ts = meta.tsMs;
    const schemaChange = meta.schemaChange;
    const pk =
      meta.op === "s"
        ? schemaChange?.column?.name ?? `schema-${index}`
        : extractPrimaryKeyValue(event, pkColumn, `${index}`);
    const idParts = [
      meta.methodId,
      meta.offset != null ? `offset-${meta.offset}` : null,
      typeof event.seq === "number" ? `seq-${event.seq}` : null,
      ts != null ? `ts-${ts}` : null,
      index,
    ].filter(Boolean);
    const id = idParts.length ? idParts.join("|") : `${meta.methodId}-${index}`;
    let metaDescription;
    if (schemaChange) {
      const action = schemaChange.kind === "SCHEMA_DROP_COL" ? "Dropped" : "Added";
      const columnName = schemaChange.column?.name ?? "column";
      const columnType = schemaChange.column?.type ? ` (${schemaChange.column.type})` : "";
      const version = schemaChange.schemaVersion ?? state.schemaVersion;
      metaDescription = `${action} ${columnName}${columnType} · v${version}`;
    }
    return {
      id,
      methodId: meta.methodId,
      methodLabel: EVENT_LOG_METHOD.label,
      op: opValue,
      offset: meta.offset,
      topic: meta.topic,
      table: meta.table ?? "—",
      tsMs: ts,
      pk: pk != null ? String(pk) : null,
      txnId: meta.txnId,
      before: getEventBefore(event) ?? null,
      after: getEventAfter(event) ?? null,
      meta: metaDescription,
    };
  });
}

function handleEventLogFiltersChange(nextFilters) {
  const normalized = normalizeEventLogFiltersInput(nextFilters);
  if (setEventLogFilters(normalized)) {
    renderJSONLog();
  }
}

function buildEventLogProps({ rows, totalCount, filterOptions, filters }) {
  return {
    className: "cdc-event-log",
    events: rows,
    stats: {
      produced: state.events.length,
      consumed: state.events.length,
      backlog: 0,
    },
    totalCount,
    filters: {
      methodId: filters.methodId ?? undefined,
      op: filters.op ?? undefined,
      table: filters.table ?? undefined,
      txnId: filters.txnId ?? undefined,
    },
    filterOptions,
    onFiltersChange: handleEventLogFiltersChange,
    onDownload: rows.length ? downloadNdjson : undefined,
    onClear: state.events.length ? clearEventLog : undefined,
    onCopyEvent: handleEventLogCopy,
    emptyMessage: "// no events yet (check filters)",
    noMatchMessage: "No events match the current filters.",
    maxVisibleEvents: 2000,
  };
}

function handleEventLogCopy(row) {
  const original = eventLogRowEventMap.get(row.id);
  if (!original) return;
  try {
    const payload = JSON.stringify(original, null, 2);
    navigator.clipboard.writeText(payload).catch(() => {});
  } catch {
    /* ignore clipboard errors */
  }
}

function clearEventLog() {
  state.events = [];
  resetEventSelection();
  save();
  renderJSONLog();
}

function renderReactEventLog(filteredItems, baseItems, filterOptions) {
  if (!els.eventLog) return;
  if (!window.__LetstalkCdcEventLogWidget?.load) {
    renderLegacyEventLog(filteredItems);
    return;
  }

  const rows = buildEventLogRows(filteredItems);
  eventLogRowEventMap.clear();
  rows.forEach((row, index) => {
    const source = filteredItems[index]?.event;
    if (row && source) eventLogRowEventMap.set(row.id, source);
  });
  const props = buildEventLogProps({
    rows,
    totalCount: baseItems.length,
    filterOptions,
    filters: getEventLogFiltersState(),
  });

  if (!eventLogWidgetLoad) {
    eventLogWidgetLoad = window.__LetstalkCdcEventLogWidget
      .load()
      .catch(error => {
        console.warn("Event log widget unavailable", error);
        eventLogWidgetLoad = null;
        return null;
      });
  }

  if (!eventLogWidgetHandle) {
    els.eventLog.textContent = "// loading event log…";
  }

  eventLogWidgetLoad
    ?.then(module => {
      if (!module) {
        renderLegacyEventLog(filteredItems);
        return;
      }
      if (!eventLogWidgetHandle) {
        eventLogWidgetHandle = module.createEventLogWidget(els.eventLog, props);
      } else {
        eventLogWidgetHandle.render(props);
      }
    })
    .catch(() => {
      renderLegacyEventLog(filteredItems);
    });
}

function buildWorkspaceOps() {
  const pkColumn = resolvePrimaryKeyColumn();
  const events = state.events ?? [];
  const baseTs = events.reduce((min, event) => {
    const op = getOp(event);
    const ts = getEventTimestamp(event);
    if (op === "r" || op === "s" || ts == null) return min;
    return Math.min(min, ts);
  }, Number.POSITIVE_INFINITY);
  const hasBase = Number.isFinite(baseTs);

  const ops = [];
  events.forEach((event, index) => {
    const op = getOp(event);
    if (op === "r" || op === "s") return; // schema/snapshot events don't become source ops

    const ts = getEventTimestamp(event);
    const normalizedTs = hasBase && ts != null ? Math.max(0, ts - baseTs) : index * 150;

    const fallbackPk = `${index}`;
    const pkValue = extractPrimaryKeyValue(event, pkColumn, fallbackPk);
    const pk = { id: pkValue != null ? String(pkValue) : fallbackPk };

    const after = getEventAfter(event);
    if (op === "c") {
      if (!after) return;
      ops.push({ t: normalizedTs, op: "insert", table: "workspace", pk, after: clone(after) });
      return;
    }
    if (op === "u") {
      if (!after) return;
      ops.push({ t: normalizedTs, op: "update", table: "workspace", pk, after: clone(after) });
      return;
    }
    if (op === "d") {
      ops.push({ t: normalizedTs, op: "delete", table: "workspace", pk });
    }
  });

  return ops;
}

function buildComparatorDetail() {
  const ops = buildWorkspaceOps();
  return {
    schemaVersion: state.schemaVersion,
    schema: clone(state.schema),
    rows: clone(state.rows),
    events: clone(state.events),
    scenario: {
      name: "workspace-live",
      label: "Workspace (live)",
      description: `${state.rows.length} rows · ${ops.length} operations`,
      seed: 1,
      ops,
      schemaVersion: state.schemaVersion,
    },
  };
}

function broadcastComparatorState() {
  if (typeof window === "undefined") return;
  try {
    const detail = buildComparatorDetail();
    window.dispatchEvent(new CustomEvent("cdc:workspace-update", { detail }));
  } catch (err) {
    console.warn("Comparator broadcast failed", err);
  }
}

function waitForElement(selector, timeout = TOUR_DEFAULT_TIMEOUT) {
  return new Promise(resolve => {
    const existing = document.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    let done = false;
    const observer = new MutationObserver(() => {
      const candidate = document.querySelector(selector);
      if (candidate) {
        done = true;
        observer.disconnect();
        window.clearTimeout(timerId);
        resolve(candidate);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    const timerId = window.setTimeout(() => {
      if (!done) {
        observer.disconnect();
        resolve(null);
      }
    }, timeout);
  });
}

function createTourUi() {
  const scrim = document.createElement("div");
  scrim.className = "tour-scrim";
  scrim.setAttribute("aria-hidden", "true");

  const panel = document.createElement("div");
  panel.className = "tour-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("tabindex", "-1");
  panel.setAttribute("aria-live", "polite");
  panel.innerHTML = `
    <div class="tour-panel__header">
      <span class="tour-panel__step" aria-live="polite"></span>
      <button type="button" class="tour-panel__close" aria-label="Exit walkthrough">×</button>
    </div>
    <h3 class="tour-panel__title"></h3>
    <p class="tour-panel__body"></p>
    <div class="tour-panel__controls">
      <button type="button" class="tour-panel__prev btn-ghost">Back</button>
      <button type="button" class="tour-panel__next btn-primary">Next</button>
    </div>
  `;

  return {
    scrim,
    panel,
    stepLabel: panel.querySelector(".tour-panel__step"),
    title: panel.querySelector(".tour-panel__title"),
    body: panel.querySelector(".tour-panel__body"),
    nextBtn: panel.querySelector(".tour-panel__next"),
    prevBtn: panel.querySelector(".tour-panel__prev"),
    closeBtn: panel.querySelector(".tour-panel__close"),
  };
}

function clearTourHighlight() {
  if (activeTour?.highlightEl) {
    activeTour.highlightEl.classList.remove("tour-highlight");
    activeTour.highlightEl.removeAttribute("data-tour-active");
    activeTour.highlightEl = null;
  }
}

function updateTourUi(stepIndex, step, placeholderDescription = "") {
  if (!activeTour?.ui) return;
  const { ui, steps } = activeTour;
  if (!ui.stepLabel || !ui.title || !ui.body) return;
  ui.stepLabel.textContent = `Step ${stepIndex + 1} of ${steps.length}`;
  ui.title.textContent = step?.title ?? "";
  if (typeof step?.description === "string") {
    ui.body.textContent = step.description;
  } else {
    ui.body.textContent = placeholderDescription;
  }
  if (ui.prevBtn) ui.prevBtn.disabled = stepIndex === 0;
  if (ui.nextBtn) ui.nextBtn.textContent = stepIndex === steps.length - 1 ? "Finish" : "Next";
}

function showTourStep(stepIndex) {
  if (!activeTour) return;
  const step = activeTour.steps[stepIndex];
  if (!step) {
    stopGuidedTour("missing-step");
    return;
  }

  updateTourUi(stepIndex, step);

  const timeout = typeof step.timeout === "number" ? step.timeout : TOUR_DEFAULT_TIMEOUT;
  const token = Symbol("tour-step");
  activeTour.pendingToken = token;
  waitForElement(step.selector, timeout)
    .then(element => {
      if (!activeTour || activeTour.pendingToken !== token) return;

      if (!element) {
        handleTourNext();
        return;
      }

      clearTourHighlight();
      element.classList.add("tour-highlight");
      element.setAttribute("data-tour-active", "true");
      activeTour.highlightEl = element;

      try {
        element.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      } catch {
        /* ignore */
      }

      const description = typeof step.getDescription === "function"
        ? step.getDescription(element)
        : step.description || "";

      if (activeTour?.ui?.body) {
        activeTour.ui.body.textContent = description;
      }
      if (activeTour?.ui?.panel) {
        activeTour.ui.panel.focus({ preventScroll: true });
      }
    })
    .catch(() => {
      if (!activeTour) return;
      handleTourNext();
    });
}

function handleTourNext() {
  if (!activeTour) return;
  const nextIndex = activeTour.index + 1;
  if (nextIndex >= activeTour.steps.length) {
    finishTour(true, "completed");
    return;
  }
  activeTour.index = nextIndex;
  showTourStep(nextIndex);
}

function handleTourPrev() {
  if (!activeTour) return;
  const prevIndex = Math.max(0, activeTour.index - 1);
  activeTour.index = prevIndex;
  showTourStep(prevIndex);
}

function handleTourClose() {
  stopGuidedTour("close");
}

function handleTourKeydown(event) {
  if (!activeTour) return;
  if (event.key === "Escape") {
    event.preventDefault();
    stopGuidedTour("escape");
    return;
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    handleTourNext();
    return;
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    handleTourPrev();
  }
}

function finishTour(completed, reason) {
  if (!activeTour) return;
  clearTourHighlight();
  const { ui, startedAt, steps, index, keydownHandler } = activeTour;

  if (ui) {
    if (ui.nextBtn) ui.nextBtn.removeEventListener("click", handleTourNext);
    if (ui.prevBtn) ui.prevBtn.removeEventListener("click", handleTourPrev);
    if (ui.closeBtn) ui.closeBtn.removeEventListener("click", handleTourClose);
    ui.panel?.remove();
    ui.scrim?.remove();
  }

  document.removeEventListener("keydown", keydownHandler);
  document.body.classList.remove("tour-active");

  const durationMs = Date.now() - startedAt;
  if (completed) {
    trackEvent("tour.completed", { totalSteps: steps.length, durationMs });
  } else {
    trackEvent("tour.dismissed", {
      totalSteps: steps.length,
      durationMs,
      step: Math.min(index + 1, steps.length),
      reason,
    });
  }

  activeTour = null;
}

function stopGuidedTour(reason = "manual") {
  finishTour(false, reason);
}

function startGuidedTour() {
  if (activeTour) return;
  const ui = createTourUi();
  document.body.appendChild(ui.scrim);
  document.body.appendChild(ui.panel);
  document.body.classList.add("tour-active");

  const keydownHandler = event => handleTourKeydown(event);

  if (ui.nextBtn) ui.nextBtn.addEventListener("click", handleTourNext);
  if (ui.prevBtn) ui.prevBtn.addEventListener("click", handleTourPrev);
  if (ui.closeBtn) ui.closeBtn.addEventListener("click", handleTourClose);

  document.addEventListener("keydown", keydownHandler);

  activeTour = {
    steps: GUIDED_TOUR_STEPS,
    index: 0,
    startedAt: Date.now(),
    highlightEl: null,
    ui,
    pendingToken: null,
    keydownHandler,
  };

  trackEvent("tour.started", {
    totalSteps: GUIDED_TOUR_STEPS.length,
    source: "workspace+comparator",
  });

  if (ui.panel) ui.panel.focus({ preventScroll: true });
  showTourStep(0);
}

if (typeof window !== "undefined") {
  window.addEventListener("cdc:workspace-request", () => {
    broadcastComparatorState();
  });
  window.addEventListener("cdc:comparator-summary", event => {
    renderComparatorFeedback(event?.detail);
  });
  window.addEventListener("cdc:consumer-paused", event => {
    if (!(event instanceof CustomEvent)) return;
    const detail = event.detail || {};
    updateApplyPausedBanner(Boolean(detail.paused), Number(detail.backlog ?? 0));
  });
  window.addEventListener("cdc:apply-scenario-template", (event) => {
    const templateId = event?.detail?.id;
    if (!templateId) return;
    const template = getTemplateById(templateId);
    if (template) {
      applyScenarioTemplate(template, { focusStep: "events" });
    }
  });
  window.addEventListener("cdc:workspace-replay-event", event => {
    if (!(event instanceof CustomEvent)) return;
    const detail = event.detail;
    if (!detail) return;
    try {
      replayEventToTable(detail);
    } catch (err) {
      console.warn("Replay to workspace failed", err);
    }
  });
  window.addEventListener("cdc:scenario-filter-request", () => {
    window.dispatchEvent(new CustomEvent("cdc:scenario-filter", { detail: { query: uiState.scenarioFilter, tags: uiState.scenarioTags } }));
  });
  window.addEventListener("cdc:preview-scenario", (event) => {
    const detail = event?.detail;
    const template = detail?.id ? getTemplateById(detail.id) : detail;
    if (template) openScenarioPreview(template);
  });
  window.addEventListener("cdc:start-guided-tour", () => startGuidedTour());

  if (!window.cdcComparatorClock) {
    window.cdcComparatorClock = {
      play: () => window.dispatchEvent(new CustomEvent("cdc:comparator-clock", { detail: { type: "play" } })),
      pause: () => window.dispatchEvent(new CustomEvent("cdc:comparator-clock", { detail: { type: "pause" } })),
      step: deltaMs => window.dispatchEvent(new CustomEvent("cdc:comparator-clock", { detail: { type: "step", deltaMs } })),
      seek: (timeMs, stepMs) => window.dispatchEvent(new CustomEvent("cdc:comparator-clock", { detail: { type: "seek", timeMs, stepMs } })),
      reset: () => window.dispatchEvent(new CustomEvent("cdc:comparator-clock", { detail: { type: "reset" } })),
    };
  }

  if (typeof window.startGuidedTour !== "function") {
    window.startGuidedTour = startGuidedTour;
  }
}

function renderComparatorFeedback(detail) {
  const panel = els.comparatorFeedback;
  if (!panel) return;

  if (!detail || !detail.summary || detail.totalEvents <= 0) {
    panel.hidden = true;
    panel.innerHTML = "";
    panel.removeAttribute("data-live");
    comparatorState.summary = null;
    comparatorState.analytics = [];
    comparatorState.diffs = [];
    comparatorState.tags = [];
    comparatorState.preset = null;
    comparatorState.overlay = [];
    return;
  }

  const { summary, scenarioLabel, scenarioName, isLive } = detail;
  const preset = detail.preset || null;

  try {
    comparatorState.summary = summary ? JSON.parse(JSON.stringify(summary)) : null;
    comparatorState.analytics = detail.analytics ? JSON.parse(JSON.stringify(detail.analytics)) : [];
    comparatorState.diffs = detail.diffs ? JSON.parse(JSON.stringify(detail.diffs)) : [];
    comparatorState.tags = Array.isArray(detail.tags) ? [...detail.tags] : [];
    comparatorState.preset = preset ? JSON.parse(JSON.stringify(preset)) : null;
    comparatorState.overlay = Array.isArray(detail.overlay)
      ? detail.overlay.map(entry => ({
          method: entry.method,
          label: entry.label || entry.method,
          totals: { ...entry.totals },
          lag: {
            max: entry.lag?.max ?? 0,
            samples: Array.isArray(entry.lag?.samples) ? entry.lag.samples.slice(0, 10) : [],
          },
          issues: Array.isArray(entry.issues) ? entry.issues.slice(0, 10) : [],
        }))
      : [];
  } catch {
    comparatorState.summary = null;
    comparatorState.analytics = [];
    comparatorState.diffs = [];
    comparatorState.tags = [];
    comparatorState.preset = null;
    comparatorState.overlay = [];
  }

  const bestLag = summary.bestLag;
  const worstLag = summary.worstLag;
  const lowestDeletes = summary.lowestDeletes;
  const highestDeletes = summary.highestDeletes;
  const orderingIssues = Array.isArray(summary.orderingIssues) ? summary.orderingIssues : [];
  const lagTooltipAttr = tooltipCopy?.lagPercentile
    ? ` data-tooltip="${escapeHtml(tooltipCopy.lagPercentile)}"`
    : "";
  const deleteTooltipAttr = tooltipCopy?.deleteCapture
    ? ` data-tooltip="${escapeHtml(tooltipCopy.deleteCapture)}"`
    : "";
  const triggerTooltipAttr = tooltipCopy?.triggerWriteAmplification
    ? ` data-tooltip="${escapeHtml(tooltipCopy.triggerWriteAmplification)}"`
    : "";

  const lagText = bestLag && worstLag
    ? `${escapeHtml(bestLag.label)} leads at ${Math.round(bestLag.metrics.lagMs)}ms` +
      (summary.lagSpread > 0
        ? `; ${escapeHtml(worstLag.label)} trails by ${Math.round(summary.lagSpread)}ms`
        : "")
    : "Lag data pending";

  const deleteText = lowestDeletes && highestDeletes
    ? lowestDeletes.metrics.deletesPct >= 99.5
      ? `${escapeHtml(highestDeletes.label)} captures all deletes.`
      : `${escapeHtml(lowestDeletes.label)} captures ${Math.round(lowestDeletes.metrics.deletesPct)}% deletes (best: ${escapeHtml(highestDeletes.label)}).`
    : "Delete coverage pending.";

  const orderingText = orderingIssues.length
    ? `Ordering drift in ${orderingIssues.map(item => escapeHtml(item.label)).join(", ")}.`
    : "Ordering preserved across methods.";

  const title = scenarioLabel || scenarioName || "Comparator insights";

  const sourceCopy = preset?.source || {};
  const logCopy = preset?.log || {};
  const busCopy = preset?.bus || {};
  const sinkCopy = preset?.destination || {};
  const presetMethods = Array.isArray(preset?.methods) ? preset.methods : [];
  const topicCopy = typeof busCopy.exampleTopic === "string" && busCopy.exampleTopic
    ? `
        <p class="comparator-feedback__preset-topic">
          Topic example: <code>${escapeHtml(busCopy.exampleTopic)}</code>
        </p>
      `
    : "";

  const presetSection = preset
    ? `
      <div class="comparator-feedback__preset">
        <span class="comparator-feedback__pill" data-tooltip="${escapeHtml(sourceCopy.tooltip || "")}">
          Source · ${escapeHtml(sourceCopy.label || "")}
        </span>
        <span class="comparator-feedback__arrow">→</span>
        <span class="comparator-feedback__pill" data-tooltip="${escapeHtml(logCopy.tooltip || "")}">
          Capture · ${escapeHtml(logCopy.label || "")}
        </span>
        <span class="comparator-feedback__arrow">→</span>
        <span class="comparator-feedback__pill" data-tooltip="${escapeHtml(busCopy.tooltip || "")}">
          Transport · ${escapeHtml(busCopy.label || "")}
        </span>
        <span class="comparator-feedback__arrow">→</span>
        <span class="comparator-feedback__pill" data-tooltip="${escapeHtml(sinkCopy.tooltip || "")}">
          Sink · ${escapeHtml(sinkCopy.label || "")}
        </span>
      </div>
      <p class="comparator-feedback__preset-meta">
        ${escapeHtml(preset.label || "")}
        ${preset.docsHint ? ` · <a href="${escapeHtml(preset.docsHint)}" target="_blank" rel="noopener noreferrer">Reference</a>` : ""}
      </p>
      ${topicCopy}
      ${presetMethods.length
        ? `<p class="comparator-feedback__preset-methods">${presetMethods
            .map(entry => escapeHtml(entry.label))
            .join(" · ")}</p>`
        : ""}
    `
    : "";

  const overlayRows = Array.isArray(comparatorState.overlay)
    ? comparatorState.overlay
        .map(entry => {
          const label = escapeHtml(entry.label || entry.method || "Lane");
          const chips = [];
          const missing = entry.totals?.missing ?? 0;
          const extra = entry.totals?.extra ?? 0;
          const ordering = entry.totals?.ordering ?? 0;
          const lagMax = entry.lag?.max ?? 0;
          if (missing > 0) {
            chips.push(`<span class="comparator-feedback__overlay-chip comparator-feedback__overlay-chip--missing">${missing} missing</span>`);
          }
          if (extra > 0) {
            chips.push(`<span class="comparator-feedback__overlay-chip comparator-feedback__overlay-chip--extra">${extra} extra</span>`);
          }
          if (ordering > 0) {
            chips.push(`<span class="comparator-feedback__overlay-chip comparator-feedback__overlay-chip--ordering">${ordering} ordering</span>`);
          }
          if (lagMax > 0) {
            chips.push(`<span class="comparator-feedback__overlay-chip comparator-feedback__overlay-chip--lag">${Math.round(lagMax)}ms lag</span>`);
          }
          if (!chips.length) return "";
          return `<div class="comparator-feedback__overlay-row"><strong>${label}</strong><span class="comparator-feedback__overlay-chips">${chips.join("")}</span></div>`;
        })
        .filter(Boolean)
    : [];

  const overlaySection = overlayRows.length
    ? `<div class="comparator-feedback__overlay"><p class="comparator-feedback__overlay-heading">Lane checks</p>${overlayRows.join("")}</div>`
    : "";

  const triggerLine = summary.triggerWriteAmplification
    ? `<li><strong${triggerTooltipAttr}>Trigger overhead:</strong> ${escapeHtml(summary.triggerWriteAmplification.label)} at ${(summary.triggerWriteAmplification.value ?? 0).toFixed(1)}x</li>`
    : "";

  trackEvent("comparator.summary.received", {
    scenario: scenarioName,
    label: scenarioLabel,
    totalEvents: detail.totalEvents,
    isLive,
  });

  panel.dataset.live = isLive ? "true" : "false";
  panel.innerHTML = `
    <p class="comparator-feedback__title">${escapeHtml(title)}</p>
    <p class="comparator-feedback__meta">${isLive ? "Live workspace" : "Scenario preview"}</p>
    ${presetSection}
    ${overlaySection}
    <ul>
      <li><strong${lagTooltipAttr}>Lag:</strong> ${lagText}</li>
      <li><strong${deleteTooltipAttr}>Deletes:</strong> ${deleteText}</li>
      ${triggerLine}
      <li><strong>Ordering:</strong> ${orderingText}</li>
    </ul>
  `;
  panel.hidden = false;
}

function buildComparatorSnapshotDetail(snapshot, context) {
  if (!snapshot || !snapshot.summary) return null;

  const analytics = Array.isArray(snapshot.analytics) ? snapshot.analytics : [];
  const totalFromAnalytics = analytics.reduce((sum, lane) => sum + (lane.total || 0), 0);
  const totalEvents = context.totalEvents ?? (totalFromAnalytics || context.eventsLength || 0);
  const description = context.description || `${context.rowsLength ?? 0} rows · ${totalEvents} events`;

  return {
    summary: snapshot.summary,
    analytics,
    diffs: Array.isArray(snapshot.diffs) ? snapshot.diffs : [],
    tags: Array.isArray(snapshot.tags) ? snapshot.tags : [],
    totalEvents,
    scenarioLabel: context.label,
    scenarioName: context.name,
    scenarioDescription: description,
    isLive: Boolean(context.isLive),
  };
}

const OP_METADATA = {
  c: { label: "Insert", tone: "op-insert" },
  u: { label: "Update", tone: "op-update" },
  d: { label: "Delete", tone: "op-delete" },
  r: { label: "Snapshot", tone: "op-snapshot" },
  s: { label: "Schema", tone: "op-schema" },
};

const numberFormatter = typeof Intl !== "undefined" ? new Intl.NumberFormat() : null;

function normalizeEvent(event) {
  if (!event) return { before: null, after: null, ts: null, op: "u", key: null, raw: event };
  const op = getOp(event);
  const payload = event.payload ?? event;
  const before = payload.before ?? event.before ?? null;
  const after = payload.after ?? event.after ?? null;
  const ts = payload.ts_ms ?? event.ts_ms ?? null;
  const key = event.key ?? null;
  return { before, after, ts, op, key, raw: event };
}

function formatTimestamp(ts) {
  if (typeof ts !== "number") return "—";
  try {
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return String(ts);
    return date.toISOString().replace("T", " ").replace(".000Z", "Z");
  } catch {
    return String(ts);
  }
}

function formatCount(value = 0) {
  if (!numberFormatter) return String(value);
  try {
    return numberFormatter.format(value);
  } catch {
    return String(value);
  }
}

function describePrimaryKeyValue(normalized) {
  if (normalized.op === "s") {
    const detail = getSchemaChangeDetail(normalized.raw);
    const action = detail?.kind === "SCHEMA_DROP_COL" ? "Drop" : "Add";
    const columnName = detail?.column?.name ?? "column";
    const version = detail?.schemaVersion ?? state.schemaVersion;
    return `${action} ${columnName} · schema v${version}`;
  }
  const pkFields = getPrimaryKeyFields();
  if (!pkFields.length) {
    if (normalized.key && typeof normalized.key === "object") {
      return Object.values(normalized.key).filter(Boolean).join(" · ") || "Key unavailable";
    }
    return "No primary key set";
  }
  const source = normalized.after ?? normalized.before ?? {};
  const parts = pkFields.map(name => `${name}: ${source[name] ?? "∅"}`);
  return parts.join(" · ");
}

function computeDiffRows(before = {}, after = {}) {
  const keys = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ]);
  const rows = [];
  keys.forEach(key => {
    const prev = before ? before[key] : undefined;
    const next = after ? after[key] : undefined;
    let status = "unchanged";
    const prevDefined = typeof prev !== "undefined";
    const nextDefined = typeof next !== "undefined";
    if (!prevDefined && nextDefined) status = "added";
    else if (prevDefined && !nextDefined) status = "removed";
    else if (JSON.stringify(prev) !== JSON.stringify(next)) status = "changed";
    rows.push({ key, before: prev, after: next, status });
  });
  rows.sort((a, b) => a.key.localeCompare(b.key));
  return rows;
}

function createValueCell(value) {
  const span = document.createElement("span");
  span.className = "diff-value";
  if (typeof value === "undefined") {
    span.classList.add("is-empty");
    span.textContent = "—";
  } else if (value === null) {
    span.classList.add("is-null");
    span.textContent = "null";
  } else if (typeof value === "object") {
    span.classList.add("is-json");
    span.textContent = JSON.stringify(value);
  } else if (typeof value === "boolean") {
    span.classList.add("is-boolean");
    span.textContent = value ? "true" : "false";
  } else {
    span.textContent = String(value);
  }
  return span;
}

function renderEventInspector(precomputed) {
  if (!els.inspectorList || !els.inspectorDetail) return;

  const items = precomputed || getRenderableEvents();
  const listEl = els.inspectorList;
  const detailEl = els.inspectorDetail;
  listEl.innerHTML = "";
  detailEl.innerHTML = "";

  if (!items.length) {
    const emptyMsg = document.createElement("p");
    emptyMsg.className = "inspector-empty";
    emptyMsg.textContent = "No events match the current filters.";
    detailEl.appendChild(emptyMsg);
    if (els.inspectorPrev) els.inspectorPrev.disabled = true;
    if (els.inspectorNext) els.inspectorNext.disabled = true;
    if (els.inspectorReplay) els.inspectorReplay.disabled = true;
    return;
  }

  let activeIdx = items.findIndex(item => item.index === uiState.selectedEventIndex);
  if (activeIdx === -1) {
    activeIdx = items.length - 1;
    uiState.selectedEventIndex = items[activeIdx].index;
  }

  items.forEach((item, idx) => {
    const { event } = item;
    const normalized = normalizeEvent(event);
    const opMeta = OP_METADATA[normalized.op] || { label: normalized.op.toUpperCase(), tone: "op-generic" };

    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "inspector-item";
    if (idx === activeIdx) button.classList.add("is-active");

    const badge = document.createElement("span");
    badge.className = `inspector-item-op ${opMeta.tone}`;
    badge.textContent = opMeta.label;

    const keySpan = document.createElement("span");
    keySpan.className = "inspector-item-key";
    keySpan.textContent = describePrimaryKeyValue(normalized);

    const tsSpan = document.createElement("span");
    tsSpan.className = "inspector-item-ts";
    tsSpan.textContent = formatTimestamp(normalized.ts);

    button.appendChild(badge);
    button.appendChild(keySpan);
    button.appendChild(tsSpan);
    button.onclick = () => {
      uiState.selectedEventIndex = item.index;
      renderEventInspector();
    };

    li.appendChild(button);
    listEl.appendChild(li);
  });

  const activeItem = items[activeIdx];
  const normalized = normalizeEvent(activeItem.event);
  const opMeta = OP_METADATA[normalized.op] || { label: normalized.op.toUpperCase(), tone: "op-generic" };
  const schemaChange = normalized.op === "s" ? getSchemaChangeDetail(normalized.raw) : null;

  const header = document.createElement("div");
  header.className = "inspector-detail-header";

  const opBadge = document.createElement("span");
  opBadge.className = `inspector-detail-op ${opMeta.tone}`;
  opBadge.textContent = opMeta.label;

  const pkText = document.createElement("p");
  pkText.className = "inspector-detail-pk";
  pkText.textContent = describePrimaryKeyValue(normalized);

  const tsText = document.createElement("span");
  tsText.className = "inspector-detail-ts";
  tsText.textContent = formatTimestamp(normalized.ts);

  header.appendChild(opBadge);
  header.appendChild(pkText);
  header.appendChild(tsText);
  detailEl.appendChild(header);

  if (schemaChange) {
    const schemaNote = document.createElement("p");
    schemaNote.className = "inspector-schema-change";
    const action = schemaChange.kind === "SCHEMA_DROP_COL" ? "Dropping" : "Adding";
    const columnName = schemaChange.column?.name ?? "column";
    const columnType = schemaChange.column?.type ? ` (${schemaChange.column.type})` : "";
    const version = schemaChange.schemaVersion ?? state.schemaVersion;
    schemaNote.textContent = `${action} ${columnName}${columnType}. Schema version ${version}.`;
    detailEl.appendChild(schemaNote);
  }

  if (schemaChange) {
    const empty = document.createElement("p");
    empty.className = "inspector-empty";
    empty.textContent = "Schema events do not include before/after row data.";
    detailEl.appendChild(empty);
  } else {
    const diffRows = computeDiffRows(normalized.before || {}, normalized.after || {});

    const diffWrap = document.createElement("div");
    diffWrap.className = "inspector-diff";

    const diffHead = document.createElement("div");
    diffHead.className = "inspector-diff-row diff-head";
    const headKey = document.createElement("span"); headKey.textContent = "Field"; diffHead.appendChild(headKey);
    const headBefore = document.createElement("span"); headBefore.textContent = "Before"; diffHead.appendChild(headBefore);
    const headAfter = document.createElement("span"); headAfter.textContent = "After"; diffHead.appendChild(headAfter);
    diffWrap.appendChild(diffHead);

    const pkFields = new Set(getPrimaryKeyFields());
    diffRows.forEach(row => {
      const diffRow = document.createElement("div");
      diffRow.className = `inspector-diff-row diff-${row.status}`;
      if (pkFields.has(row.key)) diffRow.classList.add("is-pk");

      const keyCell = document.createElement("div");
      keyCell.className = "diff-key";
      keyCell.textContent = row.key;
      if (pkFields.has(row.key)) {
        const pkBadge = document.createElement("span");
        pkBadge.className = "diff-tag";
        pkBadge.textContent = "PK";
        keyCell.appendChild(pkBadge);
      }

      const beforeCell = document.createElement("div");
      beforeCell.className = "diff-before";
      beforeCell.appendChild(createValueCell(row.before));

      const afterCell = document.createElement("div");
      afterCell.className = "diff-after";
      afterCell.appendChild(createValueCell(row.after));

      diffRow.appendChild(keyCell);
      diffRow.appendChild(beforeCell);
      diffRow.appendChild(afterCell);
      diffWrap.appendChild(diffRow);
    });

    if (!diffRows.length) {
      const empty = document.createElement("p");
      empty.className = "inspector-empty";
      empty.textContent = "No field-level changes.";
      diffWrap.appendChild(empty);
    }

    detailEl.appendChild(diffWrap);
  }

  if (els.inspectorPrev) els.inspectorPrev.disabled = activeIdx <= 0;
  if (els.inspectorNext) els.inspectorNext.disabled = activeIdx >= items.length - 1;
  if (els.inspectorReplay) els.inspectorReplay.disabled = !items.length || normalized.op === "s";

  const activeButton = listEl.querySelector(".inspector-item.is-active");

  // Only auto-scroll when the inspector is already on screen to avoid jumping the page
  let shouldAutoScroll = true;
  if (typeof window !== "undefined") {
    const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
    if (viewportHeight) {
      const intersectsViewport = (rect) => rect.top < viewportHeight && rect.bottom > 0;
      const listRect = listEl.getBoundingClientRect();
      const detailRect = detailEl.getBoundingClientRect();
      shouldAutoScroll = intersectsViewport(listRect) || intersectsViewport(detailRect);
    }
  }

  if (shouldAutoScroll && activeButton) activeButton.scrollIntoView({ block: "nearest" });
}

function stepSelectedEvent(delta) {
  const items = getRenderableEvents();
  if (!items.length) return;
  let activeIdx = items.findIndex(item => item.index === uiState.selectedEventIndex);
  if (activeIdx === -1) activeIdx = items.length - 1;
  let targetIdx = activeIdx + delta;
  targetIdx = Math.max(0, Math.min(items.length - 1, targetIdx));
  if (targetIdx === activeIdx) return;
  uiState.selectedEventIndex = items[targetIdx].index;
  renderEventInspector(items);
}

function replaySelectedEvent() {
  const items = getRenderableEvents();
  if (!items.length) return;
  const active = items.find(item => item.index === uiState.selectedEventIndex) || items[items.length - 1];
  replayEventToTable(active.event);
  renderEventInspector(items);
}

function replayEventToTable(event) {
  const normalized = normalizeEvent(event);
  const op = normalized.op;
  const before = normalized.before;
  const after = normalized.after;
  const reference = after ?? before ?? {};

  if (!getPrimaryKeyFields().length) {
    refreshSchemaStatus("Assign a primary key before replaying events to the table.", "error");
    return;
  }

  const idx = findByPK(reference);

  switch (op) {
    case "c":
    case "r": {
      if (!after) {
        refreshSchemaStatus("Event is missing an after payload to hydrate.", "error");
        return;
      }
      if (idx === -1) {
        state.rows.push(clone(after));
      } else {
        state.rows[idx] = clone(after);
      }
      break;
    }
    case "u": {
      if (!after) {
        refreshSchemaStatus("Update event missing after payload.", "error");
        return;
      }
      if (idx === -1) {
        state.rows.push(clone(after));
      } else {
        state.rows[idx] = clone(after);
      }
      break;
    }
    case "d": {
      if (idx === -1) {
        refreshSchemaStatus("Row already absent from table.", "muted");
        break;
      }
      state.rows.splice(idx, 1);
      break;
    }
    default:
      refreshSchemaStatus(`Unsupported operation "${op}" for replay.`, "error");
      return;
  }

  save();
  renderTable();
  refreshSchemaStatus("Event applied back to the table.", "success");
}

function updateLearning(activeId) {
  const completion = learningConfig.reduce((acc, step) => {
    acc[step.id] = step.isComplete();
    return acc;
  }, {});

  const firstIncomplete = learningConfig.find(step => !completion[step.id])?.id;
  const activeIdResolved = activeId || firstIncomplete || learningConfig[learningConfig.length - 1]?.id;

  if (els.stepCards?.length) {
    els.stepCards.forEach(card => {
      card.classList.toggle("is-active", card.dataset.step === activeIdResolved);
    });
  }

  updateQuickstart(activeIdResolved);
}

function updateQuickstart(activeId) {
  const cards = els.quickstartCards || {};
  const completion = learningConfig.reduce((acc, step) => {
    acc[step.id] = step.isComplete();
    return acc;
  }, {});

  const resolvedActive = activeId || learningConfig.find(step => !completion[step.id])?.id || "events";

  ["schema", "rows", "events"].forEach(step => {
    const card = cards[step];
    if (!card) return;
    const statusEl = card.querySelector(".quickstart-status");
    card.classList.remove("is-active", "is-complete");

    if (completion[step]) {
      card.classList.add("is-complete");
      if (statusEl) statusEl.textContent = "Done";
    } else if (step === resolvedActive) {
      card.classList.add("is-active");
      if (statusEl) statusEl.textContent = "In progress";
    } else if (statusEl) {
      statusEl.textContent = "Pending";
    }

    const button = card.querySelector("button");
    if (!button) return;
    let enabled = true;
    if (step === "rows" && !completion.schema) enabled = false;
    if (step === "events" && !completion.rows) enabled = false;
    button.disabled = !enabled;
  });
}

async function copyNdjson() {
  const filtered = filterEvents(state.events);
  if (!filtered.length) {
    flashButton(els.copyNdjson, "No events");
    return;
  }

  const ndjson = toNdjson(filtered);
  try {
    await navigator.clipboard.writeText(ndjson);
    flashButton(els.copyNdjson, "Copied!");
  } catch (err) {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = ndjson;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (ok) {
        flashButton(els.copyNdjson, "Copied!");
        return;
      }
    } catch {
      // fall through to failure notification
    }
    flashButton(els.copyNdjson, "Failed");
    console.warn("Copy to clipboard failed", err);
    pushErrorToast("Copy failed. You can still select the log text manually.");
  }
}

function downloadNdjson() {
  const filtered = filterEvents(state.events);
  if (!filtered.length) {
    flashButton(els.downloadNdjson, "No events");
    return;
  }

  const ndjson = toNdjson(filtered) + "\n";
  const blob = new Blob([ndjson], { type: "application/x-ndjson" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  a.href = url;
  a.download = `change-events-${stamp}.ndjson`;
  a.click();
  URL.revokeObjectURL(url);
  flashButton(els.downloadNdjson, "Saved!");
}


// ---------- Appwrite Realtime wiring ----------
let appwrite = null;

async function initAppwrite() {
  const cfg = window.APPWRITE_CFG;
  if (!cfg || !window.Appwrite) return; // run offline if not configured

  const client    = new Appwrite.Client().setEndpoint(cfg.endpoint).setProject(cfg.projectId);
  const account   = new Appwrite.Account(client);
  const databases = new Appwrite.Databases(client);
  const realtime  = new Appwrite.Realtime(client);

  // Try to ensure a session (optional; public perms will still work without it)
  try { await account.get(); }
  catch { try { await account.createAnonymousSession(); } catch (e) { console.warn("Anonymous session unavailable", e.message); } }

  const channel = cfg.channel(cfg.databaseId, cfg.collectionId);
  realtime.subscribe(channel, (msg) => {
    const ev = (msg.events && msg.events[0]) || "";
    // Only react to document create events
    if (!ev.includes(".documents.*.create")) return;

    // Normalize payload (supports either JSON or string columns)
    const doc = msg.payload;
    if (doc?.kind === "scenario") return;
    const norm = {
      ts_ms: doc.ts_ms ?? doc.ts ?? Date.now(),
      op:    doc.op    ?? "u",
      before: typeof doc.before === "string" ? safeParse(doc.before) : (doc.before ?? null),
      after:  typeof doc.after  === "string" ? safeParse(doc.after)  : (doc.after  ?? null),
      _docId: doc.$id
    };

    // De-dup (ignore if we already appended this doc id)
    if (!state.events.some(e => e._docId === norm._docId)) {
      state.events.push(norm);
      selectLastEvent();
      renderJSONLog();
      save();
    }
  });

  appwrite = { client, account, databases, realtime, cfg };
}

function safeParse(s) { try { return JSON.parse(s); } catch { return s; } }

// Attempt to write JSON; if it fails (e.g., column is string), retry stringified.
async function publishEvent(op, before, after, docId) {
  if (!appwrite) return; // offline mode: skip
  const { databases, cfg } = appwrite;

  const docBodyJSON = {
    ts_ms: nowTs(),
    op,
    before: els.includeBefore.checked ? (before ?? null) : null,
    after:  after ?? null
  };

  const documentId = docId || Appwrite.ID.unique();

  try {
    // First try as JSON
    await databases.createDocument(cfg.databaseId, cfg.collectionId, documentId, docBodyJSON);
  } catch (e) {
    // Fallback to string columns
    const docBodyStr = {
      ts_ms: docBodyJSON.ts_ms,
      op:    docBodyJSON.op,
      before: docBodyJSON.before == null ? null : JSON.stringify(docBodyJSON.before),
      after:  docBodyJSON.after  == null ? null : JSON.stringify(docBodyJSON.after)
    };
    try {
      await databases.createDocument(cfg.databaseId, cfg.collectionId, documentId, docBodyStr);
    } catch (e2) {
      console.warn("publishEvent failed (JSON and string modes)", e2);
      pushErrorToast("Failed to persist event to Appwrite. Event kept local.");
    }
  }
}

// ---------- Schema ----------
function addColumn({ name, type, pk }) {
  const input = document.getElementById("colName");
  const raw = (name ?? "").trim();
  if (!raw) {
    refreshSchemaStatus("Column name cannot be empty.", "error");
    input?.focus();
    return;
  }

  const normalized = raw.replace(/\s+/g, "_");
  if (state.schema.some(c => c.name === normalized)) {
    refreshSchemaStatus(`Column "${normalized}" already exists.`, "error");
    input?.focus();
    return;
  }

  state.schema.push({ name: normalized, type, pk: !!pk });
  for (const r of state.rows) if (!(normalized in r)) r[normalized] = null;
  recordSchemaChange("SCHEMA_ADD_COL", { name: normalized, type, pk: !!pk });
  save();
  renderSchema();
  renderEditor();
  renderTable();
  const newInput = els.rowEditor.querySelector(`input[data-col="${normalized}"]`);
  if (newInput) newInput.focus();
  refreshSchemaStatus(`Added column "${normalized}".`, "success");
  syncSchemaDemoButtons();
}

function removeColumn(name) {
  const idx = state.schema.findIndex(c => c.name === name);
  if (idx === -1) return;
  const removed = state.schema[idx];
  state.schema.splice(idx, 1);
  for (const r of state.rows) delete r[name];
  recordSchemaChange("SCHEMA_DROP_COL", { name, type: removed?.type ?? "string" });
  save();
  renderSchema();
  renderEditor();
  renderTable();
  refreshSchemaStatus(`Removed column "${name}".`, state.schema.length ? "muted" : "success");
  syncSchemaDemoButtons();
}

function recordSchemaChange(kind, column) {
  state.schemaVersion = Number.isFinite(state.schemaVersion)
    ? Math.max(1, Number(state.schemaVersion)) + 1
    : 1;
  const version = state.schemaVersion;
  const ts = nowTs();
  const topic = state.scenarioId ? `cdc.${state.scenarioId}.schema` : "cdc.workspace.schema";
  const event = {
    id: `schema-${version}-${Math.random().toString(16).slice(2)}`,
    kind,
    op: "s",
    table: "schema",
    schemaVersion: version,
    commitTs: ts,
    column: column ? { ...column } : null,
    topic,
    partition: 0,
  };

  if (els.debzWrap?.checked) {
    event.payload = {
      schema: {
        version,
        change: {
          kind,
          column,
        },
      },
      source: { name: "playground", version: "0.1.0" },
      op: "s",
      ts_ms: ts,
    };
  } else {
    event.ts_ms = ts;
  }

  state.events.push(event);
  renderJSONLog();
  selectLastEvent();
  broadcastComparatorState();
  refreshSchemaStatus();
}

function syncSchemaDemoButtons() {
  const hasPriority = hasColumn(SCHEMA_DEMO_COLUMN.name);
  const addBtn = document.getElementById("btnSchemaAdd");
  const dropBtn = document.getElementById("btnSchemaDrop");
  const disableAdd = hasPriority || comparatorPaused;
  const disableDrop = !hasPriority || comparatorPaused;
  if (addBtn) {
    addBtn.disabled = disableAdd;
    if (disableAdd) {
      addBtn.title = comparatorPaused ? "Resume apply to change schema." : "Column already present.";
    } else {
      addBtn.removeAttribute("title");
    }
  }
  if (dropBtn) {
    dropBtn.disabled = disableDrop;
    if (disableDrop) {
      dropBtn.title = comparatorPaused ? "Resume apply to change schema." : "Column not present.";
    } else {
      dropBtn.removeAttribute("title");
    }
  }
}

function addSchemaDemoColumn() {
  if (hasColumn(SCHEMA_DEMO_COLUMN.name)) {
    refreshSchemaStatus(`Column "${SCHEMA_DEMO_COLUMN.name}" already present.`, "muted");
    return;
  }
  addColumn({ ...SCHEMA_DEMO_COLUMN, pk: false });
  if (state.scenarioId !== "schema-evolution") {
    state.scenarioId = "schema-evolution";
    save();
    renderTemplateGallery();
  }
  syncSchemaDemoButtons();
}

function dropSchemaDemoColumn() {
  if (!hasColumn(SCHEMA_DEMO_COLUMN.name)) {
    refreshSchemaStatus(`Column "${SCHEMA_DEMO_COLUMN.name}" not found.`, "muted");
    return;
  }
  removeColumn(SCHEMA_DEMO_COLUMN.name);
  syncSchemaDemoButtons();
}

function renderSchema() {
  els.schemaPills.innerHTML = "";
  for (const c of state.schema) {
    const pill = document.createElement("div");
    pill.className = "pill";
    pill.innerHTML = `${c.name} <span class="muted">(${c.type})</span>${c.pk ? '<span class="pk">PK</span>' : ""}`;
    pill.title = "Click to remove column";
    pill.onclick = () => removeColumn(c.name);
    els.schemaPills.appendChild(pill);
  }
  updateLearning();
  refreshSchemaStatus();
  syncSchemaDemoButtons();
}

// ---------- Editor (row inputs) ----------
function syncEditorDraftWithSchema() {
  const columns = state.schema.map(col => col.name);
  for (const name of columns) {
    if (!(name in uiState.editorDraft)) uiState.editorDraft[name] = "";
    if (!(name in uiState.editorTouched)) uiState.editorTouched[name] = false;
  }
  Object.keys(uiState.editorDraft).forEach(name => {
    if (!columns.includes(name)) {
      delete uiState.editorDraft[name];
      delete uiState.editorTouched[name];
    }
  });
}

function renderEditor() {
  syncEditorDraftWithSchema();
  els.rowEditor.innerHTML = "";
  for (const c of state.schema) {
    const wrap = document.createElement("div");
    const inp  = document.createElement("input");
    inp.placeholder = `${c.name}`;
    inp.dataset.col = c.name;
    inp.value = uiState.editorDraft[c.name] ?? "";
    inp.addEventListener("input", (event) => {
      uiState.editorDraft[c.name] = event.target.value;
      uiState.editorTouched[c.name] = true;
    });
    wrap.appendChild(inp);
    els.rowEditor.appendChild(wrap);
  }
}

function parseDraftValue(raw, type) {
  if (raw == null || raw === "") return null;
  if (type === "number") {
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
  }
  if (type === "boolean" || type === "bool") {
    const normalized = String(raw).trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
    return null;
  }
  return raw;
}

function readEditorValues() {
  const values = {};
  const touched = {};
  state.schema.forEach(col => {
    const raw = uiState.editorDraft[col.name] ?? "";
    values[col.name] = parseDraftValue(raw, col.type || "string");
    touched[col.name] = !!uiState.editorTouched[col.name];
  });
  Object.defineProperty(values, "__touched", { value: touched, enumerable: false });
  return values;
}

function clearEditor() {
  Object.keys(uiState.editorDraft).forEach(key => {
    uiState.editorDraft[key] = "";
    uiState.editorTouched[key] = false;
  });
  renderEditor();
}

// ---------- Table ----------
function renderTable() {
  const thead = els.tbl.tHead || els.tbl.createTHead();
  const tbody = els.tbl.tBodies[0] || els.tbl.createTBody();
  thead.innerHTML = ""; tbody.innerHTML = "";

  const trh = thead.insertRow();
  state.schema.forEach(c => {
    const th = document.createElement("th");
    th.textContent = c.name + (c.pk ? " *" : "");
    trh.appendChild(th);
  });

  for (const r of state.rows) {
    const tr = tbody.insertRow();
    state.schema.forEach(c => {
      const td = tr.insertCell();
      td.textContent = r[c.name];
      if (isOfficeSchemaActive()) {
        const tips = r.__officeTips;
        if (Array.isArray(tips)) {
          const tip = tips.find(entry => entry.field === c.name);
          if (tip) {
            td.title = tip.message;
            td.dataset.officeTip = "true";
          }
        }
      }
    });
  }
  updateLearning();
}

function findByPK(values) {
  const pks = state.schema.filter(c => c.pk).map(c => c.name);
  if (pks.length === 0) return -1;
  return state.rows.findIndex(row => pks.every(k => row[k] === values[k]));
}

// ---------- Operations (now publish to Appwrite too) ----------
function setCrudButtonsDisabled(disabled) {
  const effective = disabled || comparatorPaused;
  ["opInsert", "opUpdate", "opDelete", "btnAutofillRow", "btnSchemaAdd", "btnSchemaDrop"].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = effective;
    if (comparatorPaused) {
      btn.dataset.consumerPaused = "true";
      if (!btn.title) btn.title = "Resume apply to run operations.";
    } else {
      btn.removeAttribute("data-consumer-paused");
      if (!disabled) btn.removeAttribute("title");
    }
  });
}

function ensureApplyPausedBanner() {
  if (applyPausedBanner || !els.eventLog || !els.eventLog.parentElement) return;
  applyPausedBanner = document.createElement("div");
  applyPausedBanner.id = "applyPausedBanner";
  applyPausedBanner.className = "apply-paused-banner";
  applyPausedBanner.setAttribute("role", "status");
  applyPausedBanner.setAttribute("aria-live", "polite");
  els.eventLog.parentElement.insertBefore(applyPausedBanner, els.eventLog);
}

function updateApplyPausedBanner(paused, backlog) {
  comparatorPaused = Boolean(paused);
  const container = els.eventLog?.parentElement;
  if (container) {
    container.classList.toggle("is-comparator-paused", comparatorPaused);
  }

  if (!comparatorPaused) {
    if (applyPausedBanner) {
      applyPausedBanner.remove();
      applyPausedBanner = null;
    }
    if (!uiState.pendingOperation) setCrudButtonsDisabled(false);
    syncSchemaDemoButtons();
    return;
  }

  ensureApplyPausedBanner();
  if (!applyPausedBanner) return;
  const count = Number.isFinite(backlog) ? Number(backlog) : 0;
  const suffix = count === 1 ? " event" : " events";
  applyPausedBanner.textContent = count > 0
    ? `Comparator apply paused – ${count}${suffix} queued. Resume to drain the bus.`
    : "Comparator apply paused. Resume to drain the event bus.";
  setCrudButtonsDisabled(true);
  syncSchemaDemoButtons();
}

async function runOperation(name, fn) {
  if (!hasCrudFixFlag()) {
    try {
      return await fn();
    } catch (err) {
      console.error(`Operation ${name} failed`, err);
      pushErrorToast(`Unable to ${name}. Check console for details.`);
      return false;
    }
  }
  if (uiState.pendingOperation) {
    pushToast("Another operation is in flight. Please wait.", "warning", { timeout: 2000 });
    return false;
  }
  uiState.pendingOperation = name;
  setCrudButtonsDisabled(true);
  try {
    return await fn();
  } catch (err) {
    console.error(`Operation ${name} failed`, err);
    const message = err && err.message ? err.message : `Unable to ${name}. Check console for details.`;
    pushErrorToast(message);
    return false;
  } finally {
    uiState.pendingOperation = null;
    setCrudButtonsDisabled(false);
  }
}

async function insertRow(values) {
  if (!demandPrimaryKey("inserting rows")) return false;
  if (!ensurePrimaryKeyValues(values)) return false;
  const after = clone(values);
  state.rows.push(after);
  const docId = nextDocumentId();
  const evt = buildEvent("c", null, after);
  if (docId) evt._docId = docId;
  state.events.push(evt);
  selectLastEvent();
  await publishEvent("c", null, after, docId);
  save(); renderTable(); renderJSONLog();
  emitSparkleTrail("c");
  pushToast("Row inserted and event emitted.", "success", { timeout: 2500 });
  return true;
}

async function updateRow(values) {
  if (!demandPrimaryKey("updating rows")) return false;
  if (!ensurePrimaryKeyValues(values)) return false;
  const touched = values.__touched || {};
  const idx = findByPK(values);
  if (idx === -1) {
    pushErrorToast("Row with matching primary key not found.");
    return false;
  }
  const before = clone(state.rows[idx]);
  const after  = clone(before);
  let mutated = false;
  state.schema.forEach(col => {
    const key = col.name;
    if (!touched[key]) return;
    after[key] = values[key];
    mutated = true;
  });
  if (!mutated) {
    pushErrorToast("No fields were changed before update.");
    return false;
  }
  state.rows[idx] = after;

  const docId = nextDocumentId();
  const evt = buildEvent("u", before, after);
  if (docId) evt._docId = docId;
  state.events.push(evt);
  selectLastEvent();
  await publishEvent("u", before, after, docId);
  save(); renderTable(); renderJSONLog();
  emitSparkleTrail("u");
  pushToast("Row updated and event emitted.", "success", { timeout: 2500 });
  return true;
}

async function deleteRow(values) {
  if (!demandPrimaryKey("deleting rows")) return false;
  if (!ensurePrimaryKeyValues(values)) return false;
  const idx = findByPK(values);
  if (idx === -1) {
    pushErrorToast("Row with matching primary key not found.");
    return false;
  }
  const before = clone(state.rows[idx]);
  state.rows.splice(idx, 1);

  const docId = nextDocumentId();
  const evt = buildEvent("d", before, null);
  if (docId) evt._docId = docId;
  state.events.push(evt);
  selectLastEvent();
  await publishEvent("d", before, null, docId);
  save(); renderTable(); renderJSONLog();
  emitSparkleTrail("d");
  pushToast("Row deleted and tombstone emitted.", "success", { timeout: 2500 });
  return true;
}

function emitSnapshot() {
  for (const row of state.rows) {
    const docId = nextDocumentId();
    const evt = buildEvent("r", null, clone(row));
    if (docId) evt._docId = docId;
    state.events.push(evt);
    publishEvent("r", null, row, docId);
  }
  selectLastEvent();
  save(); renderJSONLog();
  emitSparkleTrail("r");
}

// ---------- Seeds / export ----------
function seedRows() {
  const seeded = ensureDefaultSchema();
  if (seeded) {
    renderSchema();
    renderEditor();
  }

  if (!demandPrimaryKey("seeding sample rows")) return;

  const officeActive = isOfficeSchemaActive();

  if (state.rows.length === 0) {
    const samples = [];
    const pkFields = getPrimaryKeyFields();
    const seen = new Set();
    const desired = 3;

    while (samples.length < desired) {
      const candidate = generateSampleRow();
      if (pkFields.length) {
        const key = pkFields.map(pk => candidate[pk]).join("::");
        if (seen.has(key)) continue;
        seen.add(key);
      }
      samples.push(candidate);
    }
    state.rows = samples;
    refreshSchemaStatus("Seeded sample rows based on your schema.", "success");
    if (officeActive) {
      officeEasterEgg.seedCount += 1;
      if (officeEasterEgg.seedCount >= 3 && !officeEasterEgg.bankruptcyShown) {
        showOfficeBankruptcyModal();
      }
      emitOfficeConfetti();
    } else {
      officeEasterEgg.seedCount = 0;
    }
  } else {
    refreshSchemaStatus("Rows already exist. Clear rows to regenerate fresh samples.", "muted");
    if (!officeActive) {
      officeEasterEgg.seedCount = 0;
    }
  }

  save();
  renderTable();
}

function exportScenario() {
  const payload = {
    version: 2,
    exported_at: new Date().toISOString(),
    schema: clone(state.schema),
    rows: clone(state.rows),
    events: clone(state.events),
    scenarioId: state.scenarioId || null,
    remoteId: state.remoteId || null,
    comparator: buildComparatorExport(),
    officeOptIn: officeSchemaOptIn,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "cdc_scenario.json";
  a.click();
  URL.revokeObjectURL(a.href);
  trackEvent("workspace.scenario.exported", {
    rows: payload.rows.length,
    events: payload.events.length,
    hasComparator: Boolean(payload.comparator?.summary),
  });
}

function downloadScenarioTemplate(template) {
  const payload = {
    id: template.id,
    name: template.name,
    label: template.label,
    description: template.description,
    highlight: template.highlight,
    tags: Array.isArray(template.tags) ? [...template.tags] : [],
    table: template.table,
    schemaVersion: template.schemaVersion,
    seed: template.seed,
    schema: template.schema,
    rows: template.rows,
    events: template.events,
    ops: template.ops,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${template.id || template.name || "scenario"}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importScenario(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(reader.result);
      const scenarioPayload = payload && payload.schema ? payload : { schema: [], rows: [], events: [] };

      const officePref =
        typeof scenarioPayload.officeOptIn === "boolean"
          ? scenarioPayload.officeOptIn
          : typeof scenarioPayload.officeSchemaOptIn === "boolean"
            ? scenarioPayload.officeSchemaOptIn
            : null;
      if (officePref !== null) {
        setOfficeSchemaPreference(officePref);
      }

      state.schema = scenarioPayload.schema || [];
      state.schemaVersion = Number(scenarioPayload.schemaVersion) || 1;
      state.rows   = scenarioPayload.rows   || [];
      state.events = scenarioPayload.events || [];
      state.scenarioId = scenarioPayload.scenarioId || null;
      state.remoteId = scenarioPayload.remoteId || null;
      if (state.scenarioId) {
        storage.set(STORAGE_KEYS.lastTemplate, state.scenarioId);
      }
      if (state.events.length) selectLastEvent(); else resetEventSelection();
      if (scenarioPayload.comparator?.preferences) {
        applyComparatorPreferences(scenarioPayload.comparator.preferences);
      }
      const snapshotDetail = buildComparatorSnapshotDetail(scenarioPayload.comparator, {
        label: scenarioPayload.name || scenarioPayload.label || state.scenarioId || "Imported scenario",
        name: scenarioPayload.scenarioId || state.scenarioId || "imported",
        isLive: false,
        rowsLength: state.rows.length,
        eventsLength: state.events.length,
      });
      if (snapshotDetail) {
        renderComparatorFeedback(snapshotDetail);
      }
      save(); renderSchema(); renderEditor(); renderTable(); renderJSONLog();
      renderTemplateGallery();
      trackEvent("workspace.scenario.imported", {
        rows: state.rows.length,
        events: state.events.length,
        scenarioId: state.scenarioId,
      });
    } catch {
      pushErrorToast("Invalid scenario JSON");
    }
  };
  reader.readAsText(file);
}

function quickstartFocusSchema() {
  const schemaSection = document.getElementById("schema");
  if (schemaSection) schemaSection.scrollIntoView({ behavior: "smooth", block: "start" });
  const input = document.getElementById("colName");
  if (input) {
    requestAnimationFrame(() => {
      input.focus({ preventScroll: true });
      input.select();
    });
  }
  updateLearning("schema");
}

function quickstartSeedRows() {
  if (!hasPrimaryKey()) {
    refreshSchemaStatus("Add a primary key before seeding sample rows.", "error");
    quickstartFocusSchema();
    return;
  }
  const beforeCount = state.rows.length;
  seedRows();
  const seededSomething = state.rows.length > beforeCount;
  if (seededSomething) {
    const tableSection = document.getElementById("table-state");
    tableSection?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  updateLearning("rows");
}

function quickstartEmitEvent() {
  if (!hasPrimaryKey()) {
    refreshSchemaStatus("Add a primary key and rows before emitting events.", "error");
    quickstartFocusSchema();
    return;
  }

  if (!state.rows.length) {
    autofillRowAndInsert();
  } else {
    emitSnapshot();
  }

  const eventsSection = document.getElementById("change-feed");
  eventsSection?.scrollIntoView({ behavior: "smooth", block: "start" });
  updateLearning("events");
}

function bindUiHandlers() {
  ensureOnboardingElements();
  if (typeof document !== "undefined") {
    document.addEventListener("keydown", handleMegadeskShortcut);
  }

  if (els.onboardingClose) {
    els.onboardingClose.onclick = () => hideOnboarding(true);
  }
  if (els.onboardingDismiss) {
    els.onboardingDismiss.onclick = () => startFromScratch();
  }
  if (els.onboardingStart) {
    els.onboardingStart.onclick = () => {
      const template = getTemplateById("orders");
      applyScenarioTemplate(template, { focusStep: "rows", closeOnboarding: true });
    };
  }
  if (els.onboardingOverlay) {
    els.onboardingOverlay.addEventListener("click", (event) => {
      if (event.target === els.onboardingOverlay) hideOnboarding(true);
    });
  }

  if (els.saveRemote) {
    els.saveRemote.onclick = () => { saveScenarioRemote(); };
  }
  if (els.shareLink) {
    els.shareLink.onclick = () => { copyShareLink(); };
  }

  if (els.quickstartButtons) {
    if (els.quickstartButtons.schema) {
      els.quickstartButtons.schema.onclick = quickstartFocusSchema;
    }
    if (els.quickstartButtons.rows) {
      els.quickstartButtons.rows.onclick = quickstartSeedRows;
    }
    if (els.quickstartButtons.events) {
      els.quickstartButtons.events.onclick = quickstartEmitEvent;
    }
  }

  if (els.inspectorPrev) {
    els.inspectorPrev.onclick = () => stepSelectedEvent(-1);
  }
  if (els.inspectorNext) {
    els.inspectorNext.onclick = () => stepSelectedEvent(1);
  }
  if (els.inspectorReplay) {
    els.inspectorReplay.onclick = replaySelectedEvent;
  }
  if (els.jumpInspector) {
    els.jumpInspector.onclick = () => {
      const inspector = document.getElementById("eventInspector");
      if (!inspector) return;
      inspector.scrollIntoView({ behavior: "smooth", block: "start" });
      inspector.classList.add("is-highlighted");
      setTimeout(() => inspector.classList.remove("is-highlighted"), 1600);
    };
  }

  const addColBtn = document.getElementById("addCol");
  if (addColBtn) {
    addColBtn.onclick = () => {
      const name = document.getElementById("colName").value.trim();
      const type = document.getElementById("colType").value;
      const pk   = document.getElementById("colPK").checked;
      addColumn({ name, type, pk });
      document.getElementById("colName").value = "";
      document.getElementById("colPK").checked = false;
    };
  }

  const insertBtn = document.getElementById("opInsert");
  if (insertBtn) insertBtn.onclick = async () => {
    const values = readEditorValues();
    const inserted = await runOperation("insert row", () => insertRow(values));
    if (inserted) clearEditor();
  };

  const updateBtn = document.getElementById("opUpdate");
  if (updateBtn) updateBtn.onclick = async () => {
    const values = readEditorValues();
    await runOperation("update row", () => updateRow(values));
  };

  const deleteBtn = document.getElementById("opDelete");
  if (deleteBtn) deleteBtn.onclick = async () => {
    const values = readEditorValues();
    await runOperation("delete row", () => deleteRow(values));
  };

  if (els.autofillRow) {
    els.autofillRow.onclick = () => { autofillRowAndInsert(); };
  }

  if (els.scenarioFilter) {
    els.scenarioFilter.value = uiState.scenarioFilter;
    els.scenarioFilter.addEventListener("input", (event) => {
      const value = event.target.value || "";
      uiState.scenarioFilter = value;
      saveTemplateFilter(value);
      renderTemplateGallery();
      window.dispatchEvent(new CustomEvent("cdc:scenario-filter", { detail: { query: value } }));
    });
  }

  if (els.scenarioPreviewClose) {
    els.scenarioPreviewClose.onclick = () => closeScenarioPreview();
  }
  if (els.scenarioPreviewModal) {
    els.scenarioPreviewModal.addEventListener("click", (event) => {
      if (event.target === els.scenarioPreviewModal) closeScenarioPreview();
    });
  }
  if (els.scenarioPreviewLoad) {
    els.scenarioPreviewLoad.onclick = () => {
      if (uiState.previewTemplate) applyScenarioTemplate(uiState.previewTemplate, { focusStep: "events" });
      closeScenarioPreview();
    };
  }
  if (els.scenarioPreviewDownload) {
    els.scenarioPreviewDownload.onclick = () => {
      if (uiState.previewTemplate) downloadScenarioTemplate(uiState.previewTemplate);
    };
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (els.scenarioPreviewModal && !els.scenarioPreviewModal.hidden) {
      closeScenarioPreview();
      event.stopPropagation();
      return;
    }
    if (els.onboardingOverlay && !els.onboardingOverlay.hidden) {
      hideOnboarding(true);
      event.stopPropagation();
    }
  });

  const emitSnapshotBtn = document.getElementById("emitSnapshot");
  if (emitSnapshotBtn) emitSnapshotBtn.onclick = emitSnapshot;

  const clearEventsBtn = document.getElementById("clearEvents");
  if (clearEventsBtn) clearEventsBtn.onclick = clearEventLog;

  const seedRowsBtn = document.getElementById("seedRows");
  if (seedRowsBtn) seedRowsBtn.onclick = seedRows;

  const clearRowsBtn = document.getElementById("clearRows");
  if (clearRowsBtn) clearRowsBtn.onclick = () => { state.rows = []; save(); renderTable(); };

  if (els.schemaAdd) els.schemaAdd.onclick = addSchemaDemoColumn;
  if (els.schemaDrop) els.schemaDrop.onclick = dropSchemaDemoColumn;

  const copyNdjsonBtn = document.getElementById("btnCopyNdjson");
  if (copyNdjsonBtn) copyNdjsonBtn.onclick = copyNdjson;

  const downloadNdjsonBtn = document.getElementById("btnDownloadNdjson");
  if (downloadNdjsonBtn) downloadNdjsonBtn.onclick = downloadNdjson;

  ["filterC", "filterU", "filterD", "filterR", "filterS"].forEach(id => {
    const cb = document.getElementById(id);
    if (cb) cb.onchange = renderJSONLog;
  });

  const exportBtn = document.getElementById("btnExport");
  if (exportBtn) exportBtn.onclick = exportScenario;

  const importInput = document.getElementById("importFile");
  if (importInput) importInput.onchange = (e) => e.target.files[0] && importScenario(e.target.files[0]);



  syncSchemaDemoButtons();
}

// ---------- Wire up UI ----------
async function main() {
  ensureToastHost();
  load();
  loadTemplateFilter();
  loadOfficeSchemaPreference();
  if (state.events.length) selectLastEvent();
  let hydratedFromTemplate = false;
  if (!state.schema.length) {
    const rememberedId = storage.get(STORAGE_KEYS.lastTemplate);
    const remembered = getTemplateById(rememberedId);
    if (remembered) {
      applyScenarioTemplate(remembered, { focusStep: "events", markSeen: false });
      hydratedFromTemplate = true;
    }
  }

  const seeded = ensureDefaultSchema();
  if (!hydratedFromTemplate) {
    if (seeded) save();
    renderSchema();
    renderEditor();
    renderTable();
    renderJSONLog();
  }

  renderTemplateGallery();
  bindUiHandlers();
  renderComparatorFlagState(isComparatorFlagEnabled());
  renderMethodGuidance();

  const showedOnboardingEarly = shouldShowOnboarding();
  if (showedOnboardingEarly) {
    showOnboarding();
  }
  if (typeof window !== "undefined") {
    window.addEventListener("cdc:feature-flags", event => {
      const detail = Array.isArray(event.detail) ? event.detail : [];
      renderComparatorFlagState(detail.includes("comparator_v2"));
      if (detail.includes("comparator_v2")) {
        renderMethodGuidance();
      }
    });
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("cdc:scenario-filter", { detail: { query: uiState.scenarioFilter } }));
  }
  broadcastComparatorState();
  setShareControlsEnabled(false);

  const shouldShowOnboardingNow = !storage.get(STORAGE_KEYS.onboarding)
    && (state.scenarioId === "default" || !state.schema.length)
    && state.rows.length === 0
    && state.events.length === 0;
  const sharePending = Boolean(uiState.pendingShareId);

  if (shouldShowOnboardingNow && !sharePending) {
    maybeShowOnboarding();
  }

  try {
    await initAppwrite();
    if (appwrite?.cfg?.scenarioCollectionId) setShareControlsEnabled(true);
    await maybeHydrateSharedScenario();
  } catch (err) {
    console.warn("Appwrite init skipped", err?.message || err);
  }

  if (!showedOnboardingEarly) {
    maybeShowOnboarding();
  }
}
main();

function pickRandom(list) {
  if (!Array.isArray(list) || !list.length) return null;
  const index = Math.floor(Math.random() * list.length);
  return list[index];
}

function randomRecentIso(maxHoursBack) {
  const horizon = typeof maxHoursBack === "number" && maxHoursBack > 0 ? maxHoursBack : 24;
  const now = Date.now();
  const range = horizon * 60 * 60 * 1000;
  const offset = randomInt(0, range);
  return new Date(now - offset).toISOString();
}

function generateScenarioOrdersRow() {
  const status = pickRandom(["pending", "processing", "packed", "shipped", "cancelled", "delivered"]) || "processing";
  const methods = ["Expedited", "Standard", "Same Day", "Store Pickup", "Locker Pickup"];
  return {
    order_id: `ORD-${randomInt(1000, 10000)}`,
    customer_id: `C-${randomInt(100, 1000)}`,
    status,
    subtotal: Number((randomInt(0, 35000) / 100 + 35).toFixed(2)),
    shipping_method: pickRandom(methods) || "Standard",
    updated_at: randomRecentIso(72),
  };
}

function generateScenarioPaymentsRow() {
  const status = pickRandom(["authorized", "captured", "pending_review", "declined"]) || "authorized";
  const authorizedAt = randomRecentIso(96);
  let capturedAt = null;
  if (status === "captured") {
    const base = Date.parse(authorizedAt);
    const deltaMinutes = randomInt(2, 22);
    capturedAt = new Date(base + deltaMinutes * 60000).toISOString();
  }
  return {
    transaction_id: `PAY-${randomInt(10000, 100000)}`,
    account_id: `ACC-${randomInt(1000, 10000)}`,
    payment_method: pickRandom(["card", "wallet", "bank_transfer", "ach", "apple_pay"]) || "card",
    amount: Number((randomInt(0, 47500) / 100 + 10).toFixed(2)),
    status,
    authorized_at: authorizedAt,
    captured_at: capturedAt,
  };
}

function generateScenarioTelemetryRow() {
  const status = pickRandom(["nominal", "warning", "alert"]) || "nominal";
  const deviceSuffix = String(randomInt(1, 19)).padStart(2, "0");
  const baseTemp = Number((randomInt(0, 50) / 10 + 18).toFixed(1));
  let temperature = baseTemp;
  if (status === "warning") {
    temperature = Number((baseTemp + (randomInt(0, 15) / 10) + 0.5).toFixed(1));
  } else if (status === "alert") {
    temperature = Number((baseTemp + (randomInt(0, 25) / 10) + 1.5).toFixed(1));
  }
  const pressure = status === "alert"
    ? Number((randomInt(0, 20) / 10 + 98).toFixed(1))
    : Number((randomInt(0, 15) / 10 + 99).toFixed(1));
  return {
    reading_id: `READ-${randomInt(100, 1000)}`,
    device_id: `THERM-${deviceSuffix}`,
    temperature_c: temperature,
    pressure_kpa: pressure,
    status,
    recorded_at: randomRecentIso(24),
  };
}

function generateScenarioSchemaEvolutionRow() {
  const base = {
    order_id: `ORD-${Math.floor(Math.random() * 9000 + 2000)}`,
    status: pickRandom(["created", "processing", "fulfilled", "cancelled"]) || "created",
    amount: Number((Math.random() * 120 + 20).toFixed(2)),
  };

  if (Math.random() > 0.4) {
    base.priority_flag = Math.random() > 0.5;
  }

  return base;
}

function generateScenarioSampleRow() {
  if (!state.scenarioId || state.scenarioId === "default") return null;
  const schema = Array.isArray(state.schema) ? state.schema : [];
  if (!schema.length) return null;

  let scenarioRow = null;
  switch (state.scenarioId) {
    case "orders":
      scenarioRow = generateScenarioOrdersRow();
      break;
    case "payments":
      scenarioRow = generateScenarioPaymentsRow();
      break;
    case "iot":
      scenarioRow = generateScenarioTelemetryRow();
      break;
    case "schema-evolution":
      scenarioRow = generateScenarioSchemaEvolutionRow();
      break;
    default:
      return null;
  }
  if (!scenarioRow) return null;

  const row = {};
  for (const col of schema) {
    if (Object.prototype.hasOwnProperty.call(scenarioRow, col.name)) {
      row[col.name] = scenarioRow[col.name];
    } else {
      row[col.name] = randomSampleForColumn(col);
    }
  }

  if (state.scenarioId === "payments" && row.status !== "captured") {
    row.captured_at = null;
  }

  return row;
}

function randomSampleForColumn(col) {
  switch (col.name) {
    case "id":
      return Math.floor(1000 + Math.random() * 9000);
    case "customer_name": {
      const names = ["Pam Beesly", "Jim Halpert", "Dwight Schrute", "Stanley Hudson", "Phyllis Vance", "Michael Scott", "Angela Martin", "Kevin Malone", "Oscar Martinez", "Creed Bratton", "Kelly Kapoor"]; return names[Math.floor(Math.random() * names.length)];
    }
    case "customer_email":
      return `customer${Math.floor(Math.random() * 9000 + 1000)}@dundermifflin.com`;
    case "customer_since": {
      const year = Math.floor(Math.random() * 10) + 2014;
      const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, "0");
      const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
    case "paper_grade": {
      const grades = ["Premium", "Standard", "Recycled", "Cardstock", "Gloss"];
      return grades[Math.floor(Math.random() * grades.length)];
    }
    case "paper_size": {
      const sizes = ["Letter", "Legal", "A4", "Tabloid", "Custom"];
      return sizes[Math.floor(Math.random() * sizes.length)];
    }
    case "sheet_count":
      return [250, 500, 750, 1000][Math.floor(Math.random() * 4)];
    case "price_per_unit":
      return Number((Math.random() * 20 + 5).toFixed(2));
    case "order_total":
      return Number((Math.random() * 1000 + 200).toFixed(2));
    case "sales_rep": {
      const reps = ["Andy Bernard", "Phyllis Vance", "Stanley Hudson", "Jim Halpert", "Dwight Schrute", "Karen Filippelli"];
      return reps[Math.floor(Math.random() * reps.length)];
    }
    case "region": {
      const regions = ["Scranton", "Stamford", "Nashua", "Utica", "Akron"];
      return regions[Math.floor(Math.random() * regions.length)];
    }
    default:
      if (col.type === "number") return Math.floor(Math.random() * 1000);
      if (col.type === "boolean") return Math.random() > 0.5;
      return `${col.name}_${Math.floor(Math.random() * 9999)}`;
  }
}

function generateSampleRow() {
  const scenarioRow = generateScenarioSampleRow();
  if (scenarioRow) return scenarioRow;

  const row = {};
  for (const col of state.schema) {
    row[col.name] = randomSampleForColumn(col);
  }
  if (typeof row.price_per_unit === "number" && typeof row.order_total === "number") {
    const quantity = Math.floor(Math.random() * 40) + 5;
    row.order_total = Number((row.price_per_unit * quantity).toFixed(2));
  }
  if (isOfficeSchemaActive()) applyOfficeLore(row);
  return row;
}

function applyOfficeLore(row) {
  const profiles = [
    { customer: "Dunmore High School", rep: "Dwight Schrute", region: "Schrute Farms", tooltipField: "region", tooltip: "Account overlap?" },
    { customer: "Athlead Inc.", rep: "Jim Halpert", region: "Stamford (Remote)", tooltipField: null, tooltip: null },
    { customer: "Vance Refrigeration", rep: "Phyllis Vance", region: "Scranton", tooltipField: "customer_name", tooltip: "Bob already called dibs." },
    { customer: "Serenity by Jan", rep: "Michael Scott", region: "Corporate Liaison", tooltipField: null, tooltip: null },
    { customer: "Wuphf.com", rep: "Ryan Howard", region: "SoHo", tooltipField: "sales_rep", tooltip: "Is this still a thing?" },
  ];
  const profile = profiles[Math.floor(Math.random() * profiles.length)];

  if (row.hasOwnProperty("customer_name") && profile.customer) row.customer_name = profile.customer;
  if (row.hasOwnProperty("sales_rep") && profile.rep) row.sales_rep = profile.rep;
  if (row.hasOwnProperty("region") && profile.region) row.region = profile.region;

  if (row.hasOwnProperty("price_per_unit") && typeof row.price_per_unit === "number") {
    const chaos = (Math.random() - 0.5) * 1.2;
    row.price_per_unit = Number(Math.max(4, row.price_per_unit + chaos).toFixed(2));
  }
  if (row.hasOwnProperty("order_total") && typeof row.order_total === "number") {
    const surcharge = profile.rep === "Dwight Schrute" ? 9.84 : Math.random() * 4;
    row.order_total = Number((row.order_total + surcharge).toFixed(2));
  }

  const tips = [];
  if (profile.tooltip && profile.tooltipField) {
    tips.push({ field: profile.tooltipField, message: profile.tooltip });
  }
  Object.defineProperty(row, "__officeTips", {
    value: tips,
    enumerable: false,
    configurable: true,
    writable: true,
  });
}

function autofillRowAndInsert() {
  if (!state.schema.length) {
    refreshSchemaStatus("Add columns before autofilling rows.", "error");
    return;
  }

  const triggerButton = els.autofillRow;
  const sample = generateSampleRow();

  // reflect values in the editor for transparency
  Object.keys(sample).forEach(colName => {
    uiState.editorDraft[colName] = sample[colName] == null ? "" : String(sample[colName]);
    uiState.editorTouched[colName] = true;
  });
  renderEditor();

  // mutate table state + log event
  const after = clone(sample);
  const tips = sample.__officeTips;
  if (tips) {
    Object.defineProperty(after, "__officeTips", {
      value: tips,
      enumerable: false,
      configurable: true,
      writable: true,
    });
  }
  state.rows.push(after);
  const docId = nextDocumentId();
  const evt = buildEvent("c", null, after);
  if (docId) evt._docId = docId;
  state.events.push(evt);
  selectLastEvent();
  publishEvent("c", null, after, docId);

  save();
  renderTable();
  renderJSONLog();

  refreshSchemaStatus("Sample row inserted into the table.", "success");
  updateLearning("rows");
  emitSparkleTrail("c");
  if (isOfficeSchemaActive()) emitOfficeConfetti();
  flashAutofillButton(triggerButton);
}

updateApplyPausedBanner(false, 0);
setCrudButtonsDisabled(false);
syncSchemaDemoButtons();
