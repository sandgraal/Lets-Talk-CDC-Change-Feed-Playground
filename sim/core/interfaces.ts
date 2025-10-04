import { CdcEvent, SourceOp } from "./types";

export interface MethodEngine {
  name: "polling" | "trigger" | "log";
  configure(opts: Record<string, any>): void;
  reset(seed: number): void;
  applySourceOp(op: SourceOp): void;
  tick(nowMs: number): void;
  onEvent(cb: (e: CdcEvent) => void): () => void;
}

export interface Scenario {
  name: string;
  seed: number;
  ops: SourceOp[];
}

export interface ScenarioRunner {
  load(s: Scenario): void;
  start(): void;
  pause(): void;
  reset(seed: number): void;
  onTick(cb: (nowMs: number) => void): void;
}
