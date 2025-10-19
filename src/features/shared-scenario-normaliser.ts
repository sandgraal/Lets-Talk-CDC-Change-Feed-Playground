import type { SourceOp } from "../domain/types";
import type {
  SharedScenario,
  SharedScenarioColumn,
  SharedScenarioEvent,
  SharedScenarioRow,
} from "./shared-scenarios";

export const FALLBACK_SEED_BASE = 1000;

export type ScenarioTemplate = {
  id: string;
  name: string;
  label: string;
  description: string;
  highlight?: string;
  tags: string[];
  seed: number;
  schemaVersion?: number;
  table?: string;
  schema: SharedScenarioColumn[];
  rows: SharedScenarioRow[];
  events: SharedScenarioEvent[];
  ops: SourceOp[];
};

export type FallbackTimestampFn = (input: {
  scenarioIndex: number;
  opIndex: number;
}) => number;

export interface ScenarioNormaliseOptions {
  scenarioIndex: number;
  fallbackTimestamp?: FallbackTimestampFn;
  includeTxn?: boolean;
  allowEventsAsOps?: boolean;
  fallbackTable?: string;
}

function cloneRows(rows: SharedScenario["rows"]): SharedScenarioRow[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(row => row && typeof row === "object")
    .map(row => ({ ...(row as SharedScenarioRow) }));
}

function cloneSchema(schema: SharedScenario["schema"]): SharedScenarioColumn[] {
  if (!Array.isArray(schema)) return [];
  return schema
    .filter(column => column && typeof column.name === "string")
    .map(column => ({ ...(column as SharedScenarioColumn) }));
}

function cloneEvents(events: SharedScenario["events"]): SharedScenarioEvent[] {
  if (!Array.isArray(events)) return [];
  return events
    .filter(event => event && typeof event === "object")
    .map(event => ({ ...(event as SharedScenarioEvent) }));
}

function deriveSeed(seed: SharedScenario["seed"], index: number): number {
  return typeof seed === "number" ? seed : FALLBACK_SEED_BASE + index;
}

function clonePk(pk: SourceOp["pk"]): SourceOp["pk"] | undefined {
  if (!pk || typeof pk !== "object") return undefined;
  return { ...pk } as SourceOp["pk"];
}

function fallbackTimestampValue(
  fallbackTimestamp: FallbackTimestampFn | undefined,
  scenarioIndex: number,
  opIndex: number,
): number | undefined {
  if (!fallbackTimestamp) return undefined;
  const value = fallbackTimestamp({ scenarioIndex, opIndex });
  return Number.isFinite(value) ? Number(value) : undefined;
}

function derivePkFromAfter(
  op: SharedScenario["ops"] extends Array<infer T> ? T : never,
  schema: SharedScenarioColumn[],
): SourceOp["pk"] | undefined {
  if (!schema.length) return undefined;
  const pkColumn = schema.find(column => column.pk)?.name;
  if (!pkColumn) return undefined;
  const sourceAfter = (op as SourceOp | undefined)?.after as Record<string, unknown> | undefined;
  if (!sourceAfter) return undefined;
  const pkValue = sourceAfter[pkColumn];
  if (pkValue == null) return undefined;
  return { id: String(pkValue) };
}

function cloneOps(
  ops: SharedScenario["ops"],
  options: ScenarioNormaliseOptions,
  schema: SharedScenarioColumn[],
  scenarioTable: string | undefined,
): SourceOp[] {
  if (!Array.isArray(ops)) return [];
  const { scenarioIndex, fallbackTimestamp, includeTxn, fallbackTable } = options;
  const resolvedFallbackTable = scenarioTable ?? fallbackTable;

  return ops
    .filter(op => Boolean(op))
    .map((op, opIndex) => {
      const clone: SourceOp = { ...op } as SourceOp;
      clone.pk = clonePk(op?.pk) ?? derivePkFromAfter(op, schema);

      if (op?.after) {
        clone.after = { ...op.after } as SourceOp["after"];
      }

      if (includeTxn && op?.txn) {
        clone.txn = { ...op.txn };
      }

      const fallbackT = fallbackTimestampValue(fallbackTimestamp, scenarioIndex, opIndex);
      if (fallbackT !== undefined && !Number.isFinite(clone.t)) {
        clone.t = fallbackT;
      }

      if (!clone.table && resolvedFallbackTable) {
        clone.table = resolvedFallbackTable;
      }

      return clone;
    })
    .filter((op): op is SourceOp => Boolean(op.pk?.id));
}

function deriveOpsFromEvents(
  events: SharedScenarioEvent[],
  schema: SharedScenarioColumn[],
  table: string | undefined,
  options: ScenarioNormaliseOptions,
): SourceOp[] {
  if (!events.length) return [];
  const pkField = schema.find(column => column.pk)?.name ?? "id";
  const resolvedTable = table ?? options.fallbackTable ?? "table";

  const resolveEventTable = (event: SharedScenarioEvent): string => {
    const payloadTable =
      (event as any)?.table ??
      (event as any)?.payload?.source?.table ??
      (event as any)?.payload?.source?.tableName ??
      (event as any)?.payload?.source?.table_name;

    if (typeof payloadTable === "string" && payloadTable.trim().length > 0) {
      return payloadTable;
    }

    return resolvedTable;
  };

  return events
    .map((event, opIndex) => {
      const payload = (event as any)?.payload ?? event;
      if (!payload) return null;

      const opCode = payload.op ?? (event as any)?.op;
      const ts = Number(payload.ts_ms ?? (event as any)?.ts_ms);
      const after = payload.after ?? (event as any)?.after ?? null;
      const before = payload.before ?? (event as any)?.before ?? null;
      const keyData = (event as any)?.key ?? null;

      const pkValue =
        (keyData && Object.values(keyData)[0]) ??
        (after && after[pkField]) ??
        (before && before[pkField]);

      const pk = { id: pkValue != null ? String(pkValue) : String(opIndex) };
      const fallbackT = fallbackTimestampValue(options.fallbackTimestamp, options.scenarioIndex, opIndex);

      const base: SourceOp = {
        t: Number.isFinite(ts) ? ts : fallbackT ?? opIndex * 200,
        table: resolveEventTable(event),
        pk,
        op: "insert",
      } as SourceOp;

      if (opCode === "c" || opCode === "r") {
        if (!after) return null;
        return { ...base, op: "insert", after };
      }

      if (opCode === "u") {
        if (!after) return null;
        return { ...base, op: "update", after };
      }

      if (opCode === "d") {
        return { ...base, op: "delete" };
      }

      return null;
    })
    .filter((op): op is SourceOp => Boolean(op));
}

export function normaliseSharedScenario(
  raw: SharedScenario,
  options: ScenarioNormaliseOptions,
): ScenarioTemplate | null {
  if (!raw) return null;

  const schema = cloneSchema(raw.schema);
  const rows = cloneRows(raw.rows);
  const events = cloneEvents(raw.events);
  const opsFromSource = cloneOps(raw.ops, options, schema, raw.table);

  const ops =
    opsFromSource.length > 0
      ? opsFromSource
      : options.allowEventsAsOps === false
        ? []
        : deriveOpsFromEvents(events, schema, raw.table, options);

  if (!ops.length) {
    return null;
  }

  return {
    id: raw.id,
    name: raw.name,
    label: raw.label ?? raw.name,
    description: raw.description,
    highlight: raw.highlight,
    tags: Array.isArray(raw.tags) ? [...raw.tags] : [],
    seed: deriveSeed(raw.seed, options.scenarioIndex),
    schemaVersion: typeof raw.schemaVersion === "number" ? raw.schemaVersion : undefined,
    table: raw.table,
    schema,
    rows,
    events,
    ops,
  };
}
