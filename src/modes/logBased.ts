import type { Table } from "../domain/types";
import type { ModeAdapter, EmitFn, ModeRuntime } from "./types";

/**
 * Placeholder implementation for log-based CDC. The adapter only wires the lifecycle hooks
 * so downstream code can be composed while the real emission logic is built out.
 */
export function createLogBasedAdapter(): ModeAdapter {
  let runtime: ModeRuntime | null = null;

  return {
    id: "LOG_BASED",
    initialise(nextRuntime) {
      runtime = nextRuntime;
    },
    startSnapshot(tables: Table[], emit: EmitFn) {
      void tables;
      void emit;
      void runtime;
      // TODO: enqueue snapshot rows and publish through runtime.bus once implemented.
    },
    startTailing(emit: EmitFn) {
      void emit;
      void runtime;
      // TODO: subscribe to simulated WAL stream and forward events.
    },
    pause() {
      // TODO: integrate with runtime scheduler once pause behaviour is defined.
    },
    resume() {
      // TODO: reinstate scheduled tasks or tailing cursors.
    },
    stop() {
      runtime = null;
    },
  };
}
