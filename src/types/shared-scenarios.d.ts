import type { SourceOp } from "../domain/types";

export type SharedScenarioModule = {
  id: string;
  name: string;
  label?: string;
  description: string;
  highlight?: string;
  tags?: string[];
  seed?: number;
  schema?: unknown;
  rows?: unknown[];
  events?: unknown[];
  ops?: SourceOp[];
}[];

declare module "../../assets/shared-scenarios.js" {
  const scenarios: SharedScenarioModule;
  export default scenarios;
}
