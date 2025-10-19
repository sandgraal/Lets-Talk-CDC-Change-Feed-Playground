import type { SourceOp } from "../domain/types";
import sharedScenarios, {
  type SharedScenario,
  type SharedScenarioColumn,
  type SharedScenarioEvent,
  type SharedScenarioRow,
} from "./shared-scenarios";

type ScenarioDefinition = {
  id: string;
  name: string;
  label: string;
  description: string;
  highlight?: string;
  tags: string[];
  seed: number;
  schemaVersion?: number;
  table?: string;
  schema: SharedScenarioColumn[];
  rows: SharedScenarioRow[];
  events: SharedScenarioEvent[];
  ops: SourceOp[];
};

const FALLBACK_SEED_BASE = 1000;

function normaliseOps(ops: SharedScenario["ops"]): SourceOp[] {
  if (!Array.isArray(ops)) return [];
  return ops
    .filter(op => Boolean(op))
    .map(op => {
      const clone = { ...op } as SourceOp;
      if (op?.pk) {
        clone.pk = { ...op.pk };
      }
      if ("after" in clone && op && "after" in op && op.after) {
        clone.after = { ...op.after } as SourceOp["after"];
      }
      return clone;
    });
}

function normaliseRows(rows: SharedScenario["rows"]): SharedScenarioRow[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(row => row && typeof row === "object")
    .map(row => ({ ...(row as SharedScenarioRow) }));
}

function normaliseSchema(schema: SharedScenario["schema"]): SharedScenarioColumn[] {
  if (!Array.isArray(schema)) return [];
  return schema
    .filter(column => column && typeof column.name === "string")
    .map(column => ({ ...(column as SharedScenarioColumn) }));
}

function normaliseEvents(events: SharedScenario["events"]): SharedScenarioEvent[] {
  if (!Array.isArray(events)) return [];
  return events
    .filter(event => event && typeof event === "object")
    .map(event => ({ ...(event as SharedScenarioEvent) }));
}

function deriveSeed(seed: SharedScenario["seed"], index: number): number {
  return typeof seed === "number" ? seed : FALLBACK_SEED_BASE + index;
}

export const SCENARIO_TEMPLATES: ScenarioDefinition[] = sharedScenarios
  .map((scenario, index) => ({
    id: scenario.id,
    name: scenario.name,
    label: scenario.label ?? scenario.name,
    description: scenario.description,
    highlight: scenario.highlight,
    tags: Array.isArray(scenario.tags) ? [...scenario.tags] : [],
    seed: deriveSeed(scenario.seed, index),
    schemaVersion: typeof scenario.schemaVersion === "number" ? scenario.schemaVersion : undefined,
    table: scenario.table,
    schema: normaliseSchema(scenario.schema),
    rows: normaliseRows(scenario.rows),
    events: normaliseEvents(scenario.events),
    ops: normaliseOps(scenario.ops),
  }))
  .filter(template => template.id && template.ops.length > 0);
