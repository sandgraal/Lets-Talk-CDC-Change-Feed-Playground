import type { Table } from "../domain/types";
import type { ModeAdapter, EmitFn, ModeRuntime } from "./types";

/**
 * Placeholder adapter for trigger-based CDC. The concrete implementation will simulate
 * per-write change tables and capture overhead in future iterations.
 */
export function createTriggerBasedAdapter(): ModeAdapter {
  let runtime: ModeRuntime | null = null;

  return {
    id: "TRIGGER_BASED",
    initialise(nextRuntime) {
      runtime = nextRuntime;
    },
    startSnapshot(tables: Table[], emit: EmitFn) {
      void tables;
      void emit;
      void runtime;
      // TODO: deliver initial state using the simulated trigger change table.
    },
    startTailing(emit: EmitFn) {
      void emit;
      void runtime;
      // TODO: stream change table writes immediately to the consumer.
    },
    stop() {
      runtime = null;
    },
  };
}
