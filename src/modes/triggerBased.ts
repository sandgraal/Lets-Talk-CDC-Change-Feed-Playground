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

type AuditEntry = {
  event: Event;
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

export function createTriggerBasedAdapter(): ModeAdapter {
  let runtime: ModeRuntime | null = null;
  let emitFn: EmitFn | null = null;
  let extractIntervalMs = 250;
  let triggerOverheadMs = 8;
  let lastExtract = 0;
  let extractOffset = 0;

  const table = new Map<string, StoredRow>();
  const auditLog: AuditEntry[] = [];
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

  const buildEvent = (
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

  const recordSchemaChange = (
    tableName: string,
    action: SchemaChangeAction,
    column: SchemaColumn,
    commitTs: number,
  ) => {
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
      topic: runtime?.topic ?? `cdc.${tableName}`,
      partition: 0,
      schemaChange: {
        action,
        column,
        previousVersion: previous,
        nextVersion: next,
      },
    };
    auditLog.push({ event });
  };

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
      runtime?.metrics.recordSnapshotRows(0);
    },
    startTailing(emit) {
      emitFn = emit;
    },
    applySource(op) {
      if (!runtime) return;
      const key = makeRowKey(op.table, op.pk.id);
      const baseCommitTs = op.t + triggerOverheadMs;
      let before: Record<string, unknown> | null = null;
      let after: Record<string, unknown> | null = null;
      let kind: Event["kind"];

      ensureSchemaVersion(op.table);

      if (op.op === "insert") {
        kind = "INSERT";
        after = clonePayload(op.after);
        table.set(key, {
          id: op.pk.id,
          table: op.table,
          data: { ...op.after },
          version: 1,
          updatedAt: baseCommitTs,
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
          updatedAt: baseCommitTs,
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
          updatedAt: baseCommitTs,
          deleted: true,
        });
      } else {
        return;
      }

      auditLog.push({ event: buildEvent(op, kind, before, after, baseCommitTs) });
      runtime.metrics.recordWriteAmplification(1);
    },
    applySchemaChange(tableName, action, column, commitTs) {
      if (!runtime) return;
      const effectiveCommitTs = commitTs + triggerOverheadMs;
      ensureSchemaVersion(tableName);
      if (action === "ADD_COLUMN") {
        table.forEach((row, key) => {
          if (row.table !== tableName) return;
          if (!(column.name in row.data)) {
            const nextData = { ...row.data, [column.name]: null };
            table.set(key, {
              ...row,
              data: nextData,
              version: row.version + 1,
              updatedAt: effectiveCommitTs,
            });
          }
        });
      } else if (action === "DROP_COLUMN") {
        table.forEach((row, key) => {
          if (row.table !== tableName) return;
          if (column.name in row.data) {
            const nextData = { ...row.data };
            delete nextData[column.name];
            table.set(key, {
              ...row,
              data: nextData,
              version: row.version + 1,
              updatedAt: effectiveCommitTs,
            });
          }
        });
      }
      recordSchemaChange(tableName, action, column, effectiveCommitTs);
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
      schemaVersions.clear();
    },
  };
}
