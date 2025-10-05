import type { SourceOp } from "../domain/types";

type ScenarioDefinition = {
  id: string;
  name: string;
  description: string;
  highlight?: string;
  tags?: string[];
  seed: number;
  ops: SourceOp[];
};

export const SCENARIO_TEMPLATES: ScenarioDefinition[] = [
  {
    id: "crud-basic",
    name: "CRUD Basic",
    description: "Insert, update, delete the same row to demonstrate change capture fundamentals.",
    highlight: "Polling deliberately misses intermediate deletes to tell the lossiness story.",
    tags: ["crud", "basics"],
    seed: 42,
    ops: [
      { t: 100, op: "insert", table: "customers", pk: { id: "1" }, after: { name: "Alice", email: "alice@example.com" } },
      { t: 350, op: "update", table: "customers", pk: { id: "1" }, after: { email: "alice@contoso.io" } },
      { t: 700, op: "delete", table: "customers", pk: { id: "1" } },
    ],
  },
  {
    id: "burst-updates",
    name: "Burst Updates",
    description: "Five updates within a second to highlight coalescing behaviour for polling modes.",
    tags: ["lag", "polling"],
    seed: 7,
    ops: [
      { t: 100, op: "insert", table: "widgets", pk: { id: "W-1" }, after: { status: "new" } },
      { t: 150, op: "update", table: "widgets", pk: { id: "W-1" }, after: { status: "processing" } },
      { t: 200, op: "update", table: "widgets", pk: { id: "W-1" }, after: { status: "picking" } },
      { t: 260, op: "update", table: "widgets", pk: { id: "W-1" }, after: { status: "packing" } },
      { t: 320, op: "update", table: "widgets", pk: { id: "W-1" }, after: { status: "ready" } },
    ],
  },
];
