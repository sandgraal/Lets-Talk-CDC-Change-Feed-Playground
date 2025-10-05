import type { Event, SourceOp, Table } from "../domain/types";
import type { ModeAdapter, ModeRuntime, EmitFn } from "./types";

type StoredRow = {
  id: string;
  data: Record<string, unknown>;
  version: number;
  updatedAt: number;
  deleted: boolean;
};

let eventSeq = 0;
const nextEventId = () => `evt-${Date.now()}-${++eventSeq}`;

function cloneRowPayload(payload: Record<string, unknown> | null | undefined) {
  if (!payload) return null;
  return JSON.parse(JSON.stringify(payload));
}

function toRow(id: string, payload: Record<string, unknown> | null | undefined, updatedAt: number): Event["after"] {
  if (!payload) return null;
  return { id, ...payload, __ts: updatedAt };
}

export function createLogBasedAdapter(): ModeAdapter {
  let runtime: ModeRuntime | null = null;
  let emitFn: EmitFn | null = null;
  let fetchIntervalMs = 100;
  let lastFetch = 0;
  const table = new Map<string, StoredRow>();
  const wal: Event[] = [];
  let lastEmittedIndex = 0;

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

  return {
    id: "LOG_BASED",
    initialise(nextRuntime) {
      runtime = nextRuntime;
    },
    configure(config) {
      const interval = Number(config.fetch_interval_ms ?? config.fetchIntervalMs);
      if (Number.isFinite(interval) && interval > 0) {
        fetchIntervalMs = interval;
      }
    },
    startSnapshot(tables: Table[] = [], emit) {
      emitFn = emit;
      if (!tables.length) return;
      tables.forEach(tableDef => {
        tableDef.rows.forEach(row => {
          table.set(row.id, {
            id: row.id,
            data: { ...row },
            version: 1,
            updatedAt: row.__ts ?? 0,
            deleted: false,
          });
        });
      });
      if (!table.size) return;
      const events: Event[] = [];
      table.forEach(row => {
        events.push({
          id: nextEventId(),
          kind: "INSERT",
          table: tables[0]?.name ?? "",
          before: undefined,
          after: { id: row.id, ...row.data, __ts: row.updatedAt },
          txnId: `snapshot-${row.updatedAt}`,
          commitTs: row.updatedAt,
          schemaVersion: 1,
          topic: runtime?.topic ?? `cdc.${tables[0]?.name ?? ""}`,
          partition: 0,
        });
      });
      emitFn(events);
      lastEmittedIndex = wal.length;
    },
    startTailing(emit) {
      emitFn = emit;
    },
    applySource(op) {
      if (!runtime) return;
      const commitTs = op.t;
      if (op.op === "insert") {
        table.set(op.pk.id, {
          id: op.pk.id,
          data: { ...op.after },
          version: 1,
          updatedAt: commitTs,
          deleted: false,
        });
        wal.push(
          buildEvent(op, "INSERT", null, cloneRowPayload(op.after), commitTs),
        );
      } else if (op.op === "update") {
        const current = table.get(op.pk.id);
        const before = current ? cloneRowPayload(current.data) : null;
        const merged = current ? { ...current.data, ...op.after } : { ...op.after };
        table.set(op.pk.id, {
          id: op.pk.id,
          data: merged,
          version: (current?.version ?? 0) + 1,
          updatedAt: commitTs,
          deleted: false,
        });
        wal.push(
          buildEvent(op, "UPDATE", before, cloneRowPayload(merged), commitTs),
        );
      } else if (op.op === "delete") {
        const current = table.get(op.pk.id);
        table.set(op.pk.id, {
          id: op.pk.id,
          data: current ? { ...current.data } : {},
          version: (current?.version ?? 0) + 1,
          updatedAt: commitTs,
          deleted: true,
        });
        wal.push(
          buildEvent(op, "DELETE", current ? cloneRowPayload(current.data) : null, null, commitTs),
        );
      }
    },
    tick(nowMs) {
      if (!emitFn) return;
      if (nowMs - lastFetch < fetchIntervalMs) return;
      const batch = wal.slice(lastEmittedIndex);
      if (batch.length) {
        emitFn(batch);
        lastEmittedIndex = wal.length;
      }
      lastFetch = nowMs;
    },
    pause() {
      // no-op for now – included for symmetry with CDCController state.
    },
    resume() {
      // no-op for now – included for symmetry with CDCController state.
    },
    stop() {
      table.clear();
      wal.length = 0;
      lastEmittedIndex = 0;
      emitFn = null;
      runtime = null;
    },
  };
}
