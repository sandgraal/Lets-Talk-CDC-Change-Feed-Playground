export { EventBus } from "./core/EventBus";
export type { CdcEvent, SourceOp, AuditRow, WalRecord, Row } from "./core/types";
export type { MethodEngine, Scenario, ScenarioRunner as ScenarioRunnerApi } from "./core/interfaces";
export { PollingEngine } from "./engines/PollingEngine";
export { TriggerEngine } from "./engines/TriggerEngine";
export { LogEngine } from "./engines/LogEngine";
export { ScenarioRunner } from "./scenario/ScenarioRunner";
export { diffLane, diffAllLanes } from "./analysis/diff";
export type { LaneDiffResult, LaneDiffIssue, LaneDiffIssueType, LaneLagSample } from "./analysis/diff";
