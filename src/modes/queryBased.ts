import type {
  Event,
  SourceOp,
  Table,
  SchemaChangeAction,
  SchemaColumn,
} from "../domain/types";
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

const makeRowKey = (tableName: string, id: string) => `${tableName}::${id}`;

const columnToRow = (column: SchemaColumn, commitTs: number) => ({
  id: column.name,
  type: column.type,
  nullable: column.nullable ?? false,
  __ts: commitTs,
});

export function createQueryBasedAdapter(): ModeAdapter {
  let runtime: ModeRuntime | null = null;
  let emitFn: EmitFn | null = null;
  let pollIntervalMs = 1000;
  let includeSoftDeletes = false;
  let lastPoll = 0;

  const rows = new Map<string, StoredRow>();
  const lastEmittedVersion = new Map<string, number>();
  const schemaVersions = new Map<string, number>();
  const pendingSchemaEvents: Event[] = [];

  const ensureSchemaVersion = (tableName: string): number => {
    const existing = schemaVersions.get(tableName);
    if (typeof existing === "number" && existing >= 1) return existing;
    schemaVersions.set(tableName, 1);
    return 1;
  };

  const bumpSchemaVersion = (tableName: string): { previous: number; next: number } => {
    const previous = ensureSchemaVersion(tableName);
    const next = previous + 1;
    schemaVersions.set(tableName, next);
    return { previous, next };
  };

  const buildEvent = (
    tableName: string,
    pkId: string,
    kind: Event["kind"],
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
    commitTs: number,
    txnId: string,
  ): Event => ({
    id: nextEventId(),
    kind,
    table: tableName,
    before: before ? { id: pkId, ...before, __ts: commitTs } : undefined,
    after: after ? { id: pkId, ...after, __ts: commitTs } : undefined,
    txnId,
    commitTs,
    schemaVersion: ensureSchemaVersion(tableName),
    topic: runtime?.topic ?? `cdc.${tableName}`,
    partition: 0,
  });

  const queueSchemaEvent = (
    tableName: string,
    action: SchemaChangeAction,
    column: SchemaColumn,
    commitTs: number,
  ) => {
    const { previous, next } = bumpSchemaVersion(tableName);
    pendingSchemaEvents.push({
      id: nextEventId(),
      kind: action === "ADD_COLUMN" ? "SCHEMA_ADD_COL" : "SCHEMA_DROP_COL",
      table: tableName,
      before: action === "DROP_COLUMN" ? columnToRow(column, commitTs) : undefined,
      after: action === "ADD_COLUMN" ? columnToRow(column, commitTs) : undefined,
      txnId: `schema-${commitTs}`,
      commitTs,
      schemaVersion: next,
      topic: runtime?.topic ?? `cdc.${tableName}`,
      partition: 0,
      schemaChange: {
        action,
        column,
        previousVersion: previous,
        nextVersion: next,
      },
    });
  };

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
        const version = tableDef.schema?.version ?? 1;
        schemaVersions.set(tableDef.name, version);
        tableDef.rows.forEach(row => {
          const key = makeRowKey(tableDef.name, row.id);
          rows.set(key, {
            id: row.id,
            table: tableDef.name,
            data: { ...row },
            version: 1,
            updatedAt: row.__ts ?? 0,
            deleted: false,
          });
          lastEmittedVersion.set(key, 1);
          const { id, __ts, ...rest } = row as { id: string; __ts?: number; [key: string]: unknown };
          snapshotEvents.push({
            id: nextEventId(),
            kind: "INSERT",
            table: tableDef.name,
            before: undefined,
            after: { id, ...rest, __ts: __ts ?? 0 },
            txnId: `snapshot-${row.__ts ?? 0}`,
            commitTs: row.__ts ?? 0,
            schemaVersion: ensureSchemaVersion(tableDef.name),
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
      const key = makeRowKey(op.table, op.pk.id);
      const commitTs = op.t;
      ensureSchemaVersion(op.table);
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
    applySchemaChange(tableName, action, column, commitTs) {
      ensureSchemaVersion(tableName);
      if (action === "DROP_COLUMN") {
        rows.forEach((row, key) => {
          if (row.table !== tableName) return;
          if (column.name in row.data) {
            const nextData = { ...row.data };
            delete nextData[column.name];
            rows.set(key, { ...row, data: nextData });
          }
        });
      }
      queueSchemaEvent(tableName, action, column, commitTs);
    },
    tick(nowMs) {
      if (!emitFn) return;
      if (nowMs - lastPoll < pollIntervalMs) return;

      const events: Event[] = [];
      if (pendingSchemaEvents.length) {
        events.push(...pendingSchemaEvents.splice(0, pendingSchemaEvents.length));
      }

      rows.forEach((row, key) => {
        if (row.updatedAt <= lastPoll) return;
        const previousVersion = lastEmittedVersion.get(key) ?? 0;
        if (row.deleted) {
          if (includeSoftDeletes) {
            events.push(
              buildEvent(
                row.table,
                row.id,
                "DELETE",
                clonePayload(row.data),
                null,
                row.updatedAt,
                `tx-${row.updatedAt}`,
              ),
            );
            lastEmittedVersion.set(key, row.version);
          } else {
            runtime?.metrics.recordMissedDelete();
            lastEmittedVersion.set(key, row.version);
          }
          return;
        }
        if (row.version <= previousVersion) return;
        const kind: Event["kind"] = previousVersion === 0 ? "INSERT" : "UPDATE";
        events.push(
          buildEvent(
            row.table,
            row.id,
            kind,
            null,
            clonePayload(row.data),
            row.updatedAt,
            `tx-${row.updatedAt}`,
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
      schemaVersions.clear();
      pendingSchemaEvents.length = 0;
      emitFn = null;
      runtime = null;
      lastPoll = 0;
    },
  };
}
