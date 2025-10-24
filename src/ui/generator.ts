import type { SchemaColumn, SourceOp } from "../domain/types";

export type GeneratorColumn = SchemaColumn & { pk?: boolean };

export type GeneratorScenarioColumn = Partial<GeneratorColumn> & { name: string; pk?: boolean };

export type GeneratorScenario = {
  table?: string | null;
  schema?: ReadonlyArray<GeneratorScenarioColumn | null | undefined> | null;
  rows?: ReadonlyArray<Record<string, unknown> | null | undefined> | null;
  ops?: ReadonlyArray<SourceOp | null | undefined> | null;
};

export type GeneratorState = {
  table: string;
  columns: GeneratorColumn[];
  pkField: string;
  rows: Map<string, Record<string, unknown>>;
  logicalTime: number;
  seq: number;
  opCounter: number;
};

export type GeneratedOpResult = {
  op: SourceOp;
  kind: "insert" | "update" | "delete";
};

const DEFAULT_TABLE = "workspace";

const cloneRow = (row: Record<string, unknown>): Record<string, unknown> => ({ ...row });

const normalizeColumns = (input: GeneratorScenario["schema"]): GeneratorColumn[] => {
  if (!Array.isArray(input) || input.length === 0) {
    return [{ name: "id", type: "string", pk: true }];
  }
  return input
    .filter(column => column && typeof column.name === "string")
    .map(column => {
      const base: GeneratorColumn = {
        name: column!.name,
        type: "string",
        pk: Boolean(column!.pk),
      };
      const rawType = column!.type;
      if (typeof rawType === "string") {
        const lowered = rawType.toLowerCase();
        if (lowered === "number" || lowered === "bool" || lowered === "timestamp") {
          base.type = lowered;
        } else if (lowered === "string") {
          base.type = "string";
        }
      }
      if (typeof column!.nullable === "boolean") {
        base.nullable = column!.nullable;
      }
      return base;
    });
};

const coerceColumnType = (column: GeneratorColumn): string => {
  if (!column.type) return "string";
  return String(column.type).toLowerCase();
};

const derivePkField = (columns: GeneratorColumn[]): string => {
  const explicitPk = columns.find(column => column.pk);
  if (explicitPk?.name) {
    return explicitPk.name;
  }
  return "id";
};

const buildAfterPayload = (
  row: Record<string, unknown>,
  pkField: string,
  changedColumns?: readonly string[],
): Record<string, unknown> => {
  if (Array.isArray(changedColumns) && changedColumns.length > 0) {
    return changedColumns.reduce<Record<string, unknown>>((acc, column) => {
      if (column === pkField) return acc;
      if (Object.prototype.hasOwnProperty.call(row, column)) {
        acc[column] = row[column];
      }
      return acc;
    }, {});
  }

  return Object.entries(row).reduce<Record<string, unknown>>((acc, [key, value]) => {
    if (key === pkField) return acc;
    acc[key] = value;
    return acc;
  }, {});
};

const nextGeneratorValue = (
  column: GeneratorColumn,
  state: GeneratorState,
  iteration: number,
  previous?: unknown,
): unknown => {
  const type = coerceColumnType(column);
  if (type === "number") {
    const base = state.seq * 10 + iteration;
    if (typeof previous === "number") return previous + 1;
    return base;
  }
  if (type === "bool" || type === "boolean") {
    if (typeof previous === "boolean") return !previous;
    return iteration % 2 === 0;
  }
  if (type === "timestamp") {
    return state.logicalTime + iteration + 1;
  }
  const suffix = `${state.seq}_${iteration}_${state.opCounter}`;
  return `${column.name}_${suffix}`;
};

export const createGeneratorStateFromScenario = (
  scenario: GeneratorScenario,
  options: { fallbackTable?: string } = {},
): GeneratorState => {
  const columns = normalizeColumns(scenario.schema);
  const pkField = derivePkField(columns);
  const rows = new Map<string, Record<string, unknown>>();
  const seedRows = Array.isArray(scenario.rows) ? scenario.rows : [];

  seedRows.forEach(row => {
    if (!row || typeof row !== "object") return;
    const record = row as Record<string, unknown>;
    const rawId = record[pkField] ?? record.id;
    if (rawId == null) return;
    const id = String(rawId);
    const values: Record<string, unknown> = {};

    Object.entries(record).forEach(([key, value]) => {
      if (key === pkField) {
        values[key] = String(value);
        return;
      }
      if (key === "id" && pkField !== "id") return;
      values[key] = value;
    });

    if (!Object.prototype.hasOwnProperty.call(values, pkField)) {
      values[pkField] = id;
    }

    rows.set(id, values);
  });

  const lastOpTime = Array.isArray(scenario.ops)
    ? scenario.ops.reduce((max, op) => Math.max(max, op?.t ?? 0), 0)
    : 0;

  const table = typeof scenario.table === "string" && scenario.table.trim().length
    ? scenario.table
    : options.fallbackTable ?? DEFAULT_TABLE;

  return {
    table,
    columns,
    pkField,
    rows,
    logicalTime: lastOpTime,
    seq: rows.size + 1,
    opCounter: 0,
  };
};

export const createGeneratorOp = (
  state: GeneratorState,
  spacingMs: number,
  currentClock: number,
): GeneratedOpResult | null => {
  const spacing = Math.max(1, Math.floor(spacingMs) || 1);
  const availableIds = Array.from(state.rows.keys());
  const nonPkColumns = state.columns.filter(column => column.name !== state.pkField);

  let kind: GeneratedOpResult["kind"] = "insert";
  if (availableIds.length > 0 && nonPkColumns.length > 0) {
    const cycle = state.opCounter % 6;
    if ((cycle === 0 || cycle === 4) && availableIds.length > 1) {
      kind = "delete";
    } else if (cycle === 1 || cycle === 2 || cycle === 3) {
      kind = "update";
    } else {
      kind = "insert";
    }
  } else if (availableIds.length > 1 && nonPkColumns.length === 0) {
    kind = state.opCounter % 3 === 0 ? "delete" : "insert";
  }

  const counter = state.opCounter;
  state.opCounter += 1;

  const baseTime = Math.max(state.logicalTime, currentClock);
  state.logicalTime = baseTime + spacing;
  const commitTs = state.logicalTime;

  if (kind === "insert") {
    const id = `gen-${state.seq++}`;
    const stored: Record<string, unknown> = { [state.pkField]: id };
    nonPkColumns.forEach((column, index) => {
      stored[column.name] = nextGeneratorValue(column, state, index);
    });
    state.rows.set(id, stored);
    const after = buildAfterPayload(stored, state.pkField);
    const op: SourceOp = {
      t: commitTs,
      op: "insert",
      table: state.table,
      pk: { id },
      after,
    };
    return { op, kind };
  }

  if (kind === "update" && availableIds.length > 0 && nonPkColumns.length > 0) {
    const targetIndex = counter % availableIds.length;
    const id = availableIds[targetIndex];
    const existing = state.rows.get(id);
    if (!existing) return null;
    const column = nonPkColumns[counter % nonPkColumns.length];
    const nextValue = nextGeneratorValue(column, state, counter, existing[column.name]);
    const updated = cloneRow(existing);
    updated[column.name] = nextValue;
    state.rows.set(id, updated);
    const after = buildAfterPayload(updated, state.pkField, [column.name]);
    const op: SourceOp = {
      t: commitTs,
      op: "update",
      table: state.table,
      pk: { id },
      after,
    };
    return { op, kind };
  }

  if (kind === "delete" && availableIds.length > 0) {
    const targetIndex = counter % availableIds.length;
    const id = availableIds[targetIndex];
    state.rows.delete(id);
    const op: SourceOp = {
      t: commitTs,
      op: "delete",
      table: state.table,
      pk: { id },
    };
    return { op, kind };
  }

  return null;
};

