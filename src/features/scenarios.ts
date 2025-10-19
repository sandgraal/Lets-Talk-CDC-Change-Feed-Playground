import sharedScenarios from "../../assets/shared-scenarios.js";
import {
  normaliseSharedScenario,
  type ScenarioNormaliseOptions,
  type ScenarioTemplate,
} from "./shared-scenario-normaliser";

const DEFAULT_OPTIONS: Pick<ScenarioNormaliseOptions, "fallbackTimestamp" | "includeTxn" | "allowEventsAsOps" | "fallbackTable"> = {
  allowEventsAsOps: true,
};

export const SCENARIO_TEMPLATES: ScenarioTemplate[] = sharedScenarios
  .map((scenario, index) =>
    normaliseSharedScenario(scenario, {
      scenarioIndex: index,
      ...DEFAULT_OPTIONS,
    }),
  )
  .filter((template): template is ScenarioTemplate => Boolean(template));

