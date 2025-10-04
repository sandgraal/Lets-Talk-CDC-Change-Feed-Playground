import { ScenarioRunner as ScenarioRunnerInterface, Scenario } from "../core/interfaces";
import { MethodEngine } from "../core/interfaces";

export class ScenarioRunner implements ScenarioRunnerInterface {
  private scenario: Scenario | null = null;
  private engines: MethodEngine[] = [];
  private idx = 0;
  private now = 0;
  private playing = false;
  private onTickCb?: (nowMs: number) => void;

  attach(engines: MethodEngine[]) {
    this.engines = engines;
  }

  load(scenario: Scenario) {
    this.scenario = scenario;
    this.idx = 0;
    this.now = 0;
    this.playing = false;
  }

  reset(seed: number) {
    this.engines.forEach(engine => engine.reset(seed));
    this.idx = 0;
    this.now = 0;
  }

  onTick(cb: (nowMs: number) => void) {
    this.onTickCb = cb;
  }

  start() {
    this.playing = true;
  }

  pause() {
    this.playing = false;
  }

  tick(deltaMs: number) {
    if (!this.playing || !this.scenario) return;

    this.now += deltaMs;
    const { ops } = this.scenario;

    while (this.idx < ops.length && ops[this.idx].t <= this.now) {
      const op = ops[this.idx++];
      this.engines.forEach(engine => engine.applySourceOp(op));
    }

    this.engines.forEach(engine => engine.tick(this.now));
    this.onTickCb?.(this.now);
  }
}
