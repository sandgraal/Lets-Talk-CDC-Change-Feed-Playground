import {
  EventBus,
  PollingEngine,
  TriggerEngine,
  LogEngine,
  ScenarioRunner,
} from "./index";
import { diffLane, diffAllLanes } from "./analysis/diff";
import type { LaneDiffResult, LaneDiffIssue, LaneDiffIssueType, LaneLagSample } from "./analysis/diff";
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
  diffLane,
  diffAllLanes,
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
  LaneDiffResult,
  LaneDiffIssue,
  LaneDiffIssueType,
  LaneLagSample,
};

export {
  EventBus,
  PollingEngine,
  TriggerEngine,
  LogEngine,
  ScenarioRunner,
  diffLane,
  diffAllLanes,
};

export default exportsObject;
