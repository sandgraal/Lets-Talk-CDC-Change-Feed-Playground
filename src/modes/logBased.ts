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

const cloneRowPayload = (payload: Record<string, unknown> | null | undefined) =>
  payload ? JSON.parse(JSON.stringify(payload)) : null;

const makeRowKey = (tableName: string, id: string) => `${tableName}::${id}`;

const columnToRow = (column: SchemaColumn, commitTs: number) => ({
  id: column.name,
  type: column.type,
  nullable: column.nullable ?? false,
  __ts: commitTs,
});

const deriveTxnContext = (
  txnMeta: SourceOp["txn"] | undefined,
  commitTs: number,
  fallbackId = `tx-${commitTs}`,
) => {
  const id = txnMeta?.id ?? fallbackId;
  const hasIndex = typeof txnMeta?.index === "number";
  const index = hasIndex ? txnMeta!.index : undefined;
  const total = typeof txnMeta?.total === "number" ? txnMeta.total : undefined;
  let last: boolean;
  if (typeof txnMeta?.last === "boolean") {
    last = txnMeta.last;
  } else if (hasIndex && typeof total === "number") {
    last = index! >= total - 1;
  } else {
    last = txnMeta ? false : true;
  }
  return { id, index, total, last };
};

export function createLogBasedAdapter(): ModeAdapter {
  let runtime: ModeRuntime | null = null;
  let emitFn: EmitFn | null = null;
  let fetchIntervalMs = 100;
  let lastFetch = 0;
  const rows = new Map<string, StoredRow>();
  const wal: Event[] = [];
  let lastEmittedIndex = 0;
  const schemaVersions = new Map<string, number>();

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

  const buildRowEvent = (
    op: SourceOp,
    kind: Event["kind"],
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
    commitTs: number,
  ): Event => {
    const txn = deriveTxnContext(op.txn, commitTs);
    return {
      id: nextEventId(),
      kind,
      table: op.table,
      before: before ? { id: op.pk.id, ...before, __ts: commitTs } : undefined,
      after: after ? { id: op.pk.id, ...after, __ts: commitTs } : undefined,
      txnId: txn.id,
      txnIndex: txn.index,
      txnTotal: txn.total,
      txnLast: txn.last,
      commitTs,
      schemaVersion: ensureSchemaVersion(op.table),
      topic: runtime?.topic ?? `cdc.${op.table}`,
      partition: 0,
    };
  };

  const emitSchemaEvent = (
    tableName: string,
    action: SchemaChangeAction,
    column: SchemaColumn,
    commitTs: number,
  ) => {
    if (!emitFn || !runtime) return;
    const { previous, next } = bumpSchemaVersion(tableName);
    const txn = deriveTxnContext(undefined, commitTs, `schema-${commitTs}`);
    const event: Event = {
      id: nextEventId(),
      kind: action === "ADD_COLUMN" ? "SCHEMA_ADD_COL" : "SCHEMA_DROP_COL",
      table: tableName,
      before: action === "DROP_COLUMN" ? columnToRow(column, commitTs) : undefined,
      after: action === "ADD_COLUMN" ? columnToRow(column, commitTs) : undefined,
      txnId: txn.id,
      txnIndex: txn.index,
      txnTotal: txn.total,
      txnLast: txn.last,
      commitTs,
      schemaVersion: next,
      topic: runtime.topic ?? `cdc.${tableName}`,
      partition: 0,
      schemaChange: {
        action,
        column,
        previousVersion: previous,
        nextVersion: next,
      },
    };
    emitFn([event]);
  };

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
        const baseVersion = tableDef.schema?.version ?? 1;
        schemaVersions.set(tableDef.name, baseVersion);
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
        });
      });
      if (!rows.size) return;
      const events: Event[] = [];
      rows.forEach(stored => {
        events.push({
          id: nextEventId(),
          kind: "INSERT",
          table: stored.table,
          before: undefined,
          after: { id: stored.id, ...stored.data, __ts: stored.updatedAt },
          txnId: `snapshot-${stored.updatedAt}`,
          txnIndex: 0,
          txnTotal: 1,
          txnLast: true,
          commitTs: stored.updatedAt,
          schemaVersion: ensureSchemaVersion(stored.table),
          topic: runtime?.topic ?? `cdc.${stored.table}`,
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
      const key = makeRowKey(op.table, op.pk.id);
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
        wal.push(
          buildRowEvent(op, "INSERT", null, cloneRowPayload(op.after), commitTs),
        );
      } else if (op.op === "update") {
        const current = rows.get(key);
        const before = current ? cloneRowPayload(current.data) : null;
        const merged = current ? { ...current.data, ...op.after } : { ...op.after };
        rows.set(key, {
          id: op.pk.id,
          table: op.table,
          data: merged,
          version: (current?.version ?? 0) + 1,
          updatedAt: commitTs,
          deleted: false,
        });
        wal.push(
          buildRowEvent(op, "UPDATE", before, cloneRowPayload(merged), commitTs),
        );
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
        wal.push(
          buildRowEvent(op, "DELETE", current ? cloneRowPayload(current.data) : null, null, commitTs),
        );
      }
    },
    applySchemaChange(tableName, action, column, commitTs) {
      if (!runtime) return;
      ensureSchemaVersion(tableName);
      if (action === "ADD_COLUMN") {
        rows.forEach((stored, key) => {
          if (stored.table !== tableName) return;
          if (!(column.name in stored.data)) {
            stored.data[column.name] = null;
            rows.set(key, { ...stored, data: { ...stored.data } });
          }
        });
      } else if (action === "DROP_COLUMN") {
        rows.forEach((stored, key) => {
          if (stored.table !== tableName) return;
          if (column.name in stored.data) {
            const nextData = { ...stored.data };
            delete nextData[column.name];
            rows.set(key, { ...stored, data: nextData });
          }
        });
      }
      emitSchemaEvent(tableName, action, column, commitTs);
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
      rows.clear();
      wal.length = 0;
      lastEmittedIndex = 0;
      emitFn = null;
      runtime = null;
      schemaVersions.clear();
      lastFetch = 0;
    },
  };
}
