import type { Table } from "../domain/types";
import type { ModeAdapter, EmitFn, ModeRuntime } from "./types";

/**
 * Placeholder adapter for query-based CDC. Polling cadence and lossy behaviour will be
 * layered on in subsequent iterations; for now it exposes the lifecycle contract.
 */
export function createQueryBasedAdapter(): ModeAdapter {
  let runtime: ModeRuntime | null = null;

  return {
    id: "QUERY_BASED",
    initialise(nextRuntime) {
      runtime = nextRuntime;
    },
    startSnapshot(tables: Table[], emit: EmitFn) {
      void tables;
      void emit;
      void runtime;
      // TODO: perform initial data scan and emit synthetic snapshot events.
    },
    startTailing(emit: EmitFn) {
      void emit;
      void runtime;
      // TODO: schedule polling diffs and emit best-effort change events.
    },
    stop() {
      runtime = null;
    },
  };
}
