import {
  EventBus,
  PollingEngine,
  TriggerEngine,
  LogEngine,
  ScenarioRunner,
} from "./index";
import type {
  CdcEvent,
  SourceOp,
  AuditRow,
  WalRecord,
  Row,
} from "./core/types";
import type {
  MethodEngine,
  Scenario,
  ScenarioRunner as ScenarioRunnerApi,
} from "./core/interfaces";

const exportsObject = {
  EventBus,
  PollingEngine,
  TriggerEngine,
  LogEngine,
  ScenarioRunner,
};

// Attach for non-module consumers once the bundle loads.
if (typeof window !== "undefined") {
  (window as any).__LetstalkCdcSimulatorBundle = exportsObject;
}

export type {
  CdcEvent,
  SourceOp,
  AuditRow,
  WalRecord,
  Row,
  MethodEngine,
  Scenario,
  ScenarioRunnerApi,
};

export { EventBus, PollingEngine, TriggerEngine, LogEngine, ScenarioRunner };

export default exportsObject;
