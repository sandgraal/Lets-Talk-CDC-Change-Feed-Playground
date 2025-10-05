import type { Event, SourceOp, Table } from "../domain/types";
import type { ModeAdapter, ModeRuntime, EmitFn } from "./types";

type StoredRow = {
  id: string;
  table: string;
  data: Record<string, unknown>;
  version: number;
  updatedAt: number;
  deleted: boolean;
};

type AuditEntry = {
  event: Event;
};

let eventSeq = 0;
const nextEventId = () => `evt-${Date.now()}-${++eventSeq}`;

const clonePayload = (payload: Record<string, unknown> | null | undefined) =>
  payload ? JSON.parse(JSON.stringify(payload)) : null;

export function createTriggerBasedAdapter(): ModeAdapter {
  let runtime: ModeRuntime | null = null;
  let emitFn: EmitFn | null = null;
  let extractIntervalMs = 250;
  let triggerOverheadMs = 8;
  let lastExtract = 0;
  let extractOffset = 0;

  const table = new Map<string, StoredRow>();
  const auditLog: AuditEntry[] = [];

  const buildEvent = (
    op: SourceOp,
    kind: Event["kind"],
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
    commitTs: number,
  ): Event => ({
    id: nextEventId(),
    kind,
    table: op.table,
    before: before ? { id: op.pk.id, ...before, __ts: commitTs } : undefined,
    after: after ? { id: op.pk.id, ...after, __ts: commitTs } : undefined,
    txnId: `tx-${commitTs}`,
    commitTs,
    schemaVersion: 1,
    topic: runtime?.topic ?? `cdc.${op.table}`,
    partition: 0,
  });

  const emitBatch = (events: Event[]) => {
    if (!events.length || !emitFn) return;
    emitFn(events);
  };

  return {
    id: "TRIGGER_BASED",
    initialise(nextRuntime) {
      runtime = nextRuntime;
    },
    configure(config) {
      const interval = Number(config.extract_interval_ms ?? config.extractIntervalMs);
      if (Number.isFinite(interval) && interval > 0) extractIntervalMs = interval;
      const overhead = Number(config.trigger_overhead_ms ?? config.triggerOverheadMs);
      if (Number.isFinite(overhead) && overhead >= 0) triggerOverheadMs = overhead;
    },
    startSnapshot(_tables: Table[] = [], emit) {
      emitFn = emit;
    },
    startTailing(emit) {
      emitFn = emit;
    },
    applySource(op) {
      if (!runtime) return;
      const key = `${op.table}::${op.pk.id}`;
      const commitTs = op.t + triggerOverheadMs;
      let before: Record<string, unknown> | null = null;
      let after: Record<string, unknown> | null = null;
      let kind: Event["kind"];

      if (op.op === "insert") {
        kind = "INSERT";
        after = clonePayload(op.after);
        table.set(key, {
          id: op.pk.id,
          table: op.table,
          data: { ...op.after },
          version: 1,
          updatedAt: commitTs,
          deleted: false,
        });
      } else if (op.op === "update") {
        const current = table.get(key);
        before = current ? clonePayload(current.data) : null;
        const merged = current ? { ...current.data, ...op.after } : { ...op.after };
        after = clonePayload(merged);
        kind = "UPDATE";
        table.set(key, {
          id: op.pk.id,
          table: op.table,
          data: merged,
          version: (current?.version ?? 0) + 1,
          updatedAt: commitTs,
          deleted: false,
        });
      } else if (op.op === "delete") {
        const current = table.get(key);
        before = current ? clonePayload(current.data) : null;
        after = null;
        kind = "DELETE";
        table.set(key, {
          id: op.pk.id,
          table: op.table,
          data: current ? { ...current.data } : {},
          version: (current?.version ?? 0) + 1,
          updatedAt: commitTs,
          deleted: true,
        });
      } else {
        return;
      }

      auditLog.push({ event: buildEvent(op, kind, before, after, commitTs) });
      runtime.metrics.recordWriteAmplification(1);
    },
    tick(nowMs) {
      if (!emitFn) return;
      if (nowMs - lastExtract < extractIntervalMs) return;
      const batch = auditLog.slice(extractOffset).map(entry => entry.event);
      emitBatch(batch);
      extractOffset = auditLog.length;
      lastExtract = nowMs;
    },
    stop() {
      auditLog.length = 0;
      table.clear();
      emitFn = null;
      runtime = null;
      extractOffset = 0;
      lastExtract = 0;
    },
  };
}
