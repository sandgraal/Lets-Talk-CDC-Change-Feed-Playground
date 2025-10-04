import type { Scenario } from "../sim";

export interface ShellScenario extends Scenario {
  label: string;
  description: string;
}

export const SCENARIOS: ShellScenario[] = [
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
