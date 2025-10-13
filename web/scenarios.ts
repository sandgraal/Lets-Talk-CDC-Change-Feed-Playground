import sharedScenarios from "../assets/shared-scenarios.js";
import type { Scenario, SourceOp } from "../sim";

export interface ShellScenario extends Scenario {
  label: string;
  description: string;
  highlight?: string;
  stats?: {
    rows: number;
    ops: number;
  };
  table?: string;
  tags?: string[];
}

function deriveOpsFromEvents(raw: any): Scenario["ops"] {
  if (!raw || !Array.isArray(raw.events)) return [];
  const pkField = raw.schema?.find((col: any) => col?.pk)?.name || "id";
  const table = raw.table || raw.id || "table";

  const ops = raw.events
    .map((event: any, index: number) => {
      const payload = event?.payload ?? event;
      if (!payload) return null;
      const opCode = payload.op ?? event?.op;
      const ts = Number(payload.ts_ms ?? event?.ts_ms);
      const after = payload.after ?? event?.after ?? null;
      const before = payload.before ?? event?.before ?? null;
      const keyData = event?.key ?? null;

      const pkValue =
        (keyData && Object.values(keyData)[0]) ??
        (after && after[pkField]) ??
        (before && before[pkField]);

      const pk = { id: pkValue != null ? String(pkValue) : String(index) };

      const base = {
        t: Number.isFinite(ts) ? ts : index * 200,
        table,
        pk,
      } as SourceOp;

      if (opCode === "c") {
        if (!after) return null;
        return { ...base, op: "insert", after };
      }
      if (opCode === "u") {
        if (!after) return null;
        return { ...base, op: "update", after };
      }
      if (opCode === "d") {
        return { ...base, op: "delete" };
      }
      return null;
    })
    .filter((op: SourceOp | null): op is SourceOp => Boolean(op));

  return ops;
}

function normalizeScenario(raw: any): ShellScenario | null {
  if (!raw || !Array.isArray(raw.ops)) return null;
  return {
    name: raw.id || raw.name || "scenario",
    label: raw.label || raw.name || "Scenario",
    description: raw.description || "",
    highlight: raw.highlight,
    stats: {
      rows: Array.isArray(raw.rows) ? raw.rows.length : 0,
      ops: Array.isArray(raw.ops) ? raw.ops.length : 0,
    },
    table: raw.table,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    seed: typeof raw.seed === "number" ? raw.seed : 1,
    ops: raw.ops,
  };
}

const mapped = Array.isArray(sharedScenarios)
  ? sharedScenarios
      .map((scenario: any) => {
        const base = { ...scenario };
        if (!Array.isArray(base.ops) || base.ops.length === 0) {
          base.ops = deriveOpsFromEvents(base);
        }
        return normalizeScenario(base);
      })
      .filter((scenario): scenario is ShellScenario => Boolean(scenario))
  : [];

export const SCENARIOS: ShellScenario[] = mapped.length
  ? mapped
  : [
      {
        name: "crud-basic",
        label: "CRUD Basic",
        description: "Insert, update, and delete a single customer to highlight delete visibility.",
        highlight: "Polling misses deletes; triggers and logs keep targets in sync.",
        stats: { rows: 1, ops: 3 },
        tags: ["crud", "polling", "basics"],
        seed: 42,
        ops: [
          { t: 100, op: "insert", table: "customers", pk: { id: "1" }, after: { name: "A", email: "a@example.com" } },
          { t: 400, op: "update", table: "customers", pk: { id: "1" }, after: { name: "A1" } },
          { t: 700, op: "delete", table: "customers", pk: { id: "1" } },
        ],
      },
      {
        name: "burst-updates",
        label: "Burst Updates",
        description: "Five quick updates to expose lost intermediate writes for polling.",
        highlight: "Rapid updates test lag and ordering resilience across engines.",
        stats: { rows: 3, ops: 6 },
        tags: ["throughput", "polling", "lag"],
        seed: 7,
        ops: [
          { t: 100, op: "insert", table: "customers", pk: { id: "200" }, after: { name: "Burst", email: "burst@example.com" } },
          { t: 150, op: "update", table: "customers", pk: { id: "200" }, after: { name: "Burst-1" } },
          { t: 180, op: "update", table: "customers", pk: { id: "200" }, after: { name: "Burst-2" } },
          { t: 210, op: "update", table: "customers", pk: { id: "200" }, after: { name: "Burst-3" } },
          { t: 240, op: "update", table: "customers", pk: { id: "200" }, after: { name: "Burst-4" } },
          { t: 600, op: "update", table: "customers", pk: { id: "200" }, after: { name: "Burst-Final" } },
        ],
      },
      {
        name: "schema-evolution",
        label: "Schema Evolution",
        description: "Add a new column mid-stream and compare capture behaviours.",
        highlight: "Log/trigger propagate schema immediately; polling lags until refreshed rows appear.",
        stats: { rows: 2, ops: 5 },
        tags: ["schema", "evolution"],
        seed: 21,
        ops: [
          { t: 120, op: "insert", table: "orders", pk: { id: "ORD-2001" }, after: { status: "created", amount: 84.1 } },
          { t: 260, op: "update", table: "orders", pk: { id: "ORD-2001" }, after: { status: "processing" } },
          { t: 340, op: "update", table: "orders", pk: { id: "ORD-2001" }, after: { priority_flag: true } },
          { t: 420, op: "insert", table: "orders", pk: { id: "ORD-2002" }, after: { status: "created", amount: 46.0, priority_flag: false } },
          { t: 540, op: "update", table: "orders", pk: { id: "ORD-2002" }, after: { status: "fulfilled" } },
        ],
      },
      {
        name: "orders-transactions",
        label: "Orders + Items Transactions",
        description: "Synchronise orders and order_items updates within the same transaction.",
        highlight: "Turn on apply-on-commit to keep downstream tables aligned while events stream.",
        stats: { rows: 3, ops: 6 },
        tags: ["transactions", "consistency"],
        seed: 99,
        ops: [
          { t: 120, op: "insert", table: "orders", pk: { id: "ORD-5001" }, after: { status: "pending", total: 128.5 }, txn: { id: "txn-5001", index: 0, total: 2 } },
          { t: 120, op: "insert", table: "order_items", pk: { id: "ORD-5001-1" }, after: { order_id: "ORD-5001", sku: "SKU-1", qty: 1 }, txn: { id: "txn-5001", index: 1, total: 2, last: true } },
          { t: 360, op: "update", table: "orders", pk: { id: "ORD-5001" }, after: { status: "fulfilled" }, txn: { id: "txn-5002", index: 0, total: 2 } },
          { t: 360, op: "insert", table: "order_items", pk: { id: "ORD-5001-2" }, after: { order_id: "ORD-5001", sku: "SKU-99", qty: 1 }, txn: { id: "txn-5002", index: 1, total: 2, last: true } },
          { t: 520, op: "delete", table: "order_items", pk: { id: "ORD-5001-1" }, txn: { id: "txn-5003", index: 0, total: 2 } },
          { t: 520, op: "update", table: "orders", pk: { id: "ORD-5001" }, after: { status: "partially_refunded" }, txn: { id: "txn-5003", index: 1, total: 2, last: true } },
        ],
      },
    ];
