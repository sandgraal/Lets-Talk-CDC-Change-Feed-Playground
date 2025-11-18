import type { SourceOp } from "../domain/types";

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

export type SharedScenarioTableDefinition = {
  name: string;
  schema: SharedScenarioColumn[];
};

export type SharedScenarioRow = Record<string, unknown>;

export type SharedScenarioEvent = Record<string, unknown>;

export type SharedScenarioModule = {
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
  tables?: SharedScenarioTableDefinition[];
  rows?: SharedScenarioRow[];
  events?: SharedScenarioEvent[];
  ops?: SourceOp[];
  comparator?: SharedScenarioComparator;
}[];

declare module "../../assets/shared-scenarios.js" {
  const scenarios: SharedScenarioModule;
  export default scenarios;
}
