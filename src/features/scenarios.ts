import type { SourceOp } from "../domain/types";
import sharedScenarios, { type SharedScenario } from "./shared-scenarios";

type ScenarioDefinition = {
  id: string;
  name: string;
  description: string;
  highlight?: string;
  tags?: string[];
  seed: number;
  schemaVersion?: number;
  ops: SourceOp[];
};

const FALLBACK_SEED_BASE = 1000;

function normaliseOps(ops: SharedScenario["ops"]): SourceOp[] {
  if (!Array.isArray(ops)) return [];
  return ops.filter(op => Boolean(op)).map(op => ({ ...op } as SourceOp));
}

function deriveSeed(seed: SharedScenario["seed"], index: number): number {
  return typeof seed === "number" ? seed : FALLBACK_SEED_BASE + index;
}

export const SCENARIO_TEMPLATES: ScenarioDefinition[] = sharedScenarios
  .map((scenario, index) => ({
    id: scenario.id,
    name: scenario.name,
    description: scenario.description,
    highlight: scenario.highlight,
    tags: scenario.tags,
    seed: deriveSeed(scenario.seed, index),
    schemaVersion: typeof scenario.schemaVersion === "number" ? scenario.schemaVersion : undefined,
    ops: normaliseOps(scenario.ops),
  }))
  .filter(template => template.id && template.ops.length > 0);
