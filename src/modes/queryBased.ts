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

let eventSeq = 0;
const nextEventId = () => `evt-${Date.now()}-${++eventSeq}`;

const clonePayload = (payload: Record<string, unknown> | null | undefined) =>
  payload ? JSON.parse(JSON.stringify(payload)) : null;

export function createQueryBasedAdapter(): ModeAdapter {
  let runtime: ModeRuntime | null = null;
  let emitFn: EmitFn | null = null;
  let pollIntervalMs = 1000;
  let includeSoftDeletes = false;
  let lastPoll = 0;

  const rows = new Map<string, StoredRow>();
  const lastEmittedVersion = new Map<string, number>();

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
    id: "QUERY_BASED",
    initialise(nextRuntime) {
      runtime = nextRuntime;
    },
    configure(config) {
      const interval = Number(config.poll_interval_ms ?? config.pollIntervalMs);
      if (Number.isFinite(interval) && interval > 0) pollIntervalMs = interval;
      if (config.include_soft_deletes != null) includeSoftDeletes = Boolean(config.include_soft_deletes);
      if (config.includeSoftDeletes != null) includeSoftDeletes = Boolean(config.includeSoftDeletes);
    },
    startSnapshot(tables: Table[] = [], emit) {
      emitFn = emit;
      const snapshotEvents: Event[] = [];
      tables.forEach(tableDef => {
        tableDef.rows.forEach(row => {
          const key = `${tableDef.name}::${row.id}`;
          rows.set(key, {
            id: row.id,
            table: tableDef.name,
            data: { ...row },
            version: 1,
            updatedAt: row.__ts ?? 0,
            deleted: false,
          });
          lastEmittedVersion.set(key, 1);
          snapshotEvents.push({
            id: nextEventId(),
            kind: "INSERT",
            table: tableDef.name,
            before: undefined,
            after: { id: row.id, ...row, __ts: row.__ts ?? 0 },
            txnId: `snapshot-${row.__ts ?? 0}`,
            commitTs: row.__ts ?? 0,
            schemaVersion: 1,
            topic: runtime?.topic ?? `cdc.${tableDef.name}`,
            partition: 0,
          });
        });
      });
      emitBatch(snapshotEvents);
    },
    startTailing(emit) {
      emitFn = emit;
    },
    applySource(op) {
      const key = `${op.table}::${op.pk.id}`;
      const commitTs = op.t;
      if (op.op === "insert") {
        rows.set(key, {
          id: op.pk.id,
          table: op.table,
          data: { ...op.after },
          version: 1,
          updatedAt: commitTs,
          deleted: false,
        });
      } else if (op.op === "update") {
        const current = rows.get(key);
        const nextData = current ? { ...current.data, ...op.after } : { ...op.after };
        rows.set(key, {
          id: op.pk.id,
          table: op.table,
          data: nextData,
          version: (current?.version ?? 0) + 1,
          updatedAt: commitTs,
          deleted: false,
        });
      } else if (op.op === "delete") {
        const current = rows.get(key);
        rows.set(key, {
          id: op.pk.id,
          table: op.table,
          data: current ? { ...current.data } : {},
          version: (current?.version ?? 0) + 1,
          updatedAt: commitTs,
          deleted: true,
        });
      }
    },
    tick(nowMs) {
      if (!emitFn) return;
      if (nowMs - lastPoll < pollIntervalMs) return;

      const events: Event[] = [];

      rows.forEach((row, key) => {
        if (row.updatedAt <= lastPoll) return;
        const previousVersion = lastEmittedVersion.get(key) ?? 0;
        const opBase: SourceOp = {
          t: row.updatedAt,
          table: row.table,
          pk: { id: row.id },
          // we'll override op/after per branch
          op: row.deleted ? "delete" : row.version === 1 ? "insert" : "update",
          after: row.deleted ? undefined : row.data,
        } as SourceOp;
        if (row.deleted) {
          if (includeSoftDeletes) {
            events.push(
              buildEvent(opBase, "DELETE", clonePayload(row.data), null, row.updatedAt),
            );
            lastEmittedVersion.set(key, row.version);
          } else {
            runtime?.metrics.recordMissedDelete();
            lastEmittedVersion.set(key, row.version);
          }
          return;
        }
        if (row.version <= previousVersion) return;
       const kind = previousVersion === 0 ? "INSERT" : "UPDATE";
       events.push(
         buildEvent(
           opBase,
           kind,
            null,
            clonePayload(row.data),
            row.updatedAt,
          ),
       );
        lastEmittedVersion.set(key, row.version);
      });

      emitBatch(events);
      lastPoll = nowMs;
    },
    stop() {
      rows.clear();
      lastEmittedVersion.clear();
      emitFn = null;
      runtime = null;
      lastPoll = 0;
    },
  };
}
