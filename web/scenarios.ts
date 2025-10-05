import sharedScenarios from "../assets/shared-scenarios.js";
import type { Scenario, SourceOp } from "../sim";

export interface ShellScenario extends Scenario {
  label: string;
  description: string;
  highlight?: string;
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
    ];
