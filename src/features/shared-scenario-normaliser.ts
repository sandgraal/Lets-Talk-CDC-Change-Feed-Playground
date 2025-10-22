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

function cloneValue<T>(value: T): T {
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
}

function cloneRows(rows: SharedScenario["rows"]): SharedScenarioRow[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(row => row && typeof row === "object")
    .map(row => cloneValue(row as SharedScenarioRow));
}

function cloneSchema(schema: SharedScenario["schema"]): SharedScenarioColumn[] {
  if (!Array.isArray(schema)) return [];
  return schema
    .filter(column => column && typeof column.name === "string")
    .map(column => cloneValue(column as SharedScenarioColumn));
}

function cloneEvents(events: SharedScenario["events"]): SharedScenarioEvent[] {
  if (!Array.isArray(events)) return [];
  return events
    .filter(event => event && typeof event === "object")
    .map(event => cloneValue(event as SharedScenarioEvent));
}

function deriveSeed(seed: SharedScenario["seed"], index: number): number {
  return typeof seed === "number" ? seed : FALLBACK_SEED_BASE + index;
}

function clonePk(pk: SourceOp["pk"]): SourceOp["pk"] | undefined {
  if (!pk || typeof pk !== "object") return undefined;
  return cloneValue(pk) as SourceOp["pk"];
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
        clone.after = cloneValue(op.after) as SourceOp["after"];
      }

      if (includeTxn && op?.txn) {
        clone.txn = cloneValue(op.txn) as SourceOp["txn"];
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

function normaliseOpCode(opCode: unknown): "insert" | "update" | "delete" | null {
  if (typeof opCode !== "string") return null;
  const trimmed = opCode.trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  if (["c", "create", "r", "read", "s", "snapshot"].includes(lowered)) return "insert";
  if (["u", "update"].includes(lowered)) return "update";
  if (["d", "delete"].includes(lowered)) return "delete";
  return null;
}

function formatPkValue(value: unknown, fallback: string): string {
  if (value == null) return fallback;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }
  return String(value);
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

      const opCode = normaliseOpCode(payload.op ?? (event as any)?.op);
      if (!opCode) return null;

      const rawTs =
        (payload as any)?.ts_ms ??
        (payload as any)?.tsMs ??
        (payload as any)?.ts ??
        (event as any)?.ts_ms ??
        (event as any)?.tsMs ??
        (event as any)?.ts;
      const ts = Number(rawTs);
      const after = payload.after ?? (event as any)?.after ?? null;
      const before = payload.before ?? (event as any)?.before ?? null;
      const keyData = (event as any)?.key ?? null;

      const pkValue =
        (keyData && Object.values(keyData)[0]) ??
        (after && after[pkField]) ??
        (before && before[pkField]);

      const pk = { id: formatPkValue(pkValue, String(opIndex)) };
      const fallbackT = fallbackTimestampValue(options.fallbackTimestamp, options.scenarioIndex, opIndex);
      const resolvedTs = Number.isFinite(ts) ? ts : fallbackT ?? opIndex * 200;

      const base: SourceOp = {
        t: resolvedTs,
        table: resolveEventTable(event),
        pk,
        op: opCode,
      } as SourceOp;

      if ((opCode === "insert" || opCode === "update") && !after) {
        return null;
      }

      if (opCode === "insert") {
        return { ...base, op: "insert", after: cloneValue(after) as SourceOp["after"] };
      }

      if (opCode === "update") {
        return { ...base, op: "update", after: cloneValue(after) as SourceOp["after"] };
      }

      return { ...base, op: "delete" };
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
