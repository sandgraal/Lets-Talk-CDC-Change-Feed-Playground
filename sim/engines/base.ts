import { MethodEngine } from "../core/interfaces";
import { CdcEvent, SourceOp } from "../core/types";
import { EventBus } from "../core/EventBus";

export abstract class BaseEngine implements MethodEngine {
  abstract name: "polling" | "trigger" | "log";

  protected bus = new EventBus<CdcEvent>();
  protected seq = 0;
  protected randomSeed = 42;

  configure(_opts: Record<string, any>) {}

  reset(seed: number) {
    this.seq = 0;
    this.randomSeed = seed;
  }

  onEvent(cb: (e: CdcEvent) => void) {
    return this.bus.on(cb);
  }

  abstract applySourceOp(op: SourceOp): void;
  abstract tick(nowMs: number): void;
}
