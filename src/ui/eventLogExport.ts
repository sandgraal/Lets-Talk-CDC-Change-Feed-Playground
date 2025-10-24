import type { EventLogRow } from "./components/EventLog";

export type EventLogExportEvent = {
  offset?: unknown;
  seq?: unknown;
  ts_ms?: unknown;
  tsMs?: unknown;
  ts?: unknown;
  op?: unknown;
  table?: unknown;
  pk?: unknown;
  before?: unknown;
  after?: unknown;
  topic?: unknown;
  tx?: {
    id?: unknown;
    index?: unknown;
    total?: unknown;
    last?: unknown;
  } | null;
  txnId?: unknown;
  txnIndex?: unknown;
  txnTotal?: unknown;
  txnLast?: unknown;
  schemaChange?: unknown;
};

export type EventLogExportItem = {
  method?: unknown;
  event?: EventLogExportEvent | null;
};

export type EventLogExportRecord = {
  method: string | null;
  offset: number | null;
  seq: number | null;
  ts_ms: number | null;
  op: string | null;
  table: string | null;
  pk: { id: string } | null;
  before: unknown;
  after: unknown;
  topic: string | null;
  txn_id: string | null;
  txn_index: number | null;
  txn_total: number | null;
  txn_last: boolean | null;
  schema_change: unknown;
};

const cloneValue = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map(item => cloneValue(item)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const clone: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
      clone[key] = cloneValue(val);
    });
    return clone as T;
  }
  return value;
};

const coerceNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const coerceBoolean = (value: unknown): boolean | null => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (lowered === "true") return true;
    if (lowered === "false") return false;
  }
  return null;
};

const coerceString = (value: unknown): string | null => {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return null;
};

const normalisePk = (value: unknown): { id: string } | null => {
  if (!value) return null;
  if (typeof value === "object") {
    const candidate = value as { id?: unknown };
    if (candidate && Object.prototype.hasOwnProperty.call(candidate, "id")) {
      const id = coerceString(candidate.id);
      return id ? { id } : null;
    }
  }
  const fallback = coerceString(value);
  return fallback ? { id: fallback } : null;
};

const normaliseEvent = (item: EventLogExportItem): EventLogExportRecord => {
  const event = item.event ?? {};
  const method = coerceString(item.method);
  const offset = coerceNumber(event.offset);
  const seq = coerceNumber(event.seq);
  const tsMs =
    coerceNumber(event.ts_ms) ??
    coerceNumber(event.tsMs) ??
    coerceNumber(event.ts);
  const op = coerceString(event.op);
  const table = coerceString(event.table);
  const pk = normalisePk(event.pk);
  const before = event.before == null ? null : cloneValue(event.before);
  const after = event.after == null ? null : cloneValue(event.after);
  const topic = coerceString(event.topic);

  const txnSource = event.tx ?? null;
  const txnId = coerceString(txnSource?.id ?? event.txnId);
  const txnIndex = coerceNumber(txnSource?.index ?? event.txnIndex);
  const txnTotal = coerceNumber(txnSource?.total ?? event.txnTotal);
  const txnLast = coerceBoolean(txnSource?.last ?? event.txnLast);
  const schemaChange = event.schemaChange == null ? null : cloneValue(event.schemaChange);

  return {
    method: method ?? null,
    offset,
    seq,
    ts_ms: tsMs,
    op,
    table,
    pk,
    before,
    after,
    topic,
    txn_id: txnId,
    txn_index: txnIndex,
    txn_total: txnTotal,
    txn_last: txnLast,
    schema_change: schemaChange,
  };
};

export const eventLogRowToExportItem = (row: EventLogRow): EventLogExportItem => ({
  method: row.methodId ?? row.methodLabel ?? null,
  event: {
    offset: row.offset,
    seq: (row as { seq?: unknown }).seq,
    ts_ms: row.tsMs,
    op: row.op,
    table: row.table,
    pk: row.pk,
    before: row.before,
    after: row.after,
    topic: row.topic,
    txnId: row.txnId,
  },
});

export const serializeEventLogNdjson = (
  items: Iterable<EventLogExportItem>,
  options: { newline?: string } = {},
): string => {
  const newline = options.newline ?? "\n";
  const lines: string[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const record = normaliseEvent(item);
    lines.push(JSON.stringify(record));
  }
  return lines.join(newline);
};

export const mapEventsToExportRecords = (
  items: Iterable<EventLogExportItem>,
): EventLogExportRecord[] => {
  const records: EventLogExportRecord[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    records.push(normaliseEvent(item));
  }
  return records;
};

