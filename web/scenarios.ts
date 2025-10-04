import sharedScenarios from "../assets/shared-scenarios.js";
import type { Scenario } from "../sim";

export interface ShellScenario extends Scenario {
  label: string;
  description: string;
}

function normalizeScenario(raw: any): ShellScenario | null {
  if (!raw || !Array.isArray(raw.ops)) return null;
  return {
    name: raw.id || raw.name || "scenario",
    label: raw.label || raw.name || "Scenario",
    description: raw.description || "",
    seed: typeof raw.seed === "number" ? raw.seed : 1,
    ops: raw.ops,
  };
}

const mapped = Array.isArray(sharedScenarios)
  ? sharedScenarios
      .map(normalizeScenario)
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
