import type { SourceOp } from "../domain/types";
import sharedScenarios from "../../assets/shared-scenarios.js";

export type SharedScenario = {
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
};

export default sharedScenarios as SharedScenario[];
