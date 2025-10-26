import type { SourceOp } from "../domain/types";
import sharedScenarios from "../../assets/shared-scenarios.js";

export type SharedScenarioComparatorLane = {
  method?: unknown;
  eventCount?: unknown;
  metrics?: unknown;
};

export type SharedScenarioComparator = {
  preferences?: unknown;
  summary?: unknown;
  analytics?: unknown;
  diffs?: unknown;
  tags?: unknown;
  preset?: unknown;
  overlay?: unknown;
  lanes?: unknown;
} | null;

export type SharedScenarioColumnType = "string" | "number" | "bool" | "json";

export type SharedScenarioColumn = {
  name: string;
  type: SharedScenarioColumnType;
  pk: boolean;
};

export type SharedScenarioRow = Record<string, unknown>;

export type SharedScenarioEvent = Record<string, unknown>;

export type SharedScenario = {
  id: string;
  name: string;
  label?: string;
  description: string;
  highlight?: string;
  tags?: string[];
  seed?: number;
  schemaVersion?: number;
  table?: string;
  schema?: SharedScenarioColumn[];
  rows?: SharedScenarioRow[];
  events?: SharedScenarioEvent[];
  ops?: SourceOp[];
  comparator?: SharedScenarioComparator;
};

export default sharedScenarios as SharedScenario[];
