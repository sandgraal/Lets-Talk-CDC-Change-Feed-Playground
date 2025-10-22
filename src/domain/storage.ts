import type {
  ColumnType,
  Event,
  Row,
  Schema,
  SchemaChange,
  SchemaColumn,
  Table,
} from "./types";

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

const cloneRow = (row: Row): Row => cloneValue(row);

const cloneSchemaColumn = (column: SchemaColumn): SchemaColumn => ({ ...column });

const cloneSchema = (schema: Schema): Schema => ({
  name: schema.name,
  version: schema.version,
  columns: schema.columns.map(cloneSchemaColumn),
});

const inferColumnType = (key: string, value: unknown): ColumnType => {
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") {
    if (/_ts$|timestamp$/i.test(key)) return "timestamp";
    return "number";
  }
  if (value instanceof Date) return "timestamp";
  return "string";
};

type TableState = {
  schema: Schema;
  rows: Map<string, Row>;
};

const createEmptySchema = (tableName: string, version = 1): Schema => ({
  name: tableName,
  version,
  columns: [
    {
      name: "id",
      type: "string",
      nullable: false,
    },
  ],
});

const ensureIdColumn = (schema: Schema) => {
  const hasId = schema.columns.some(column => column.name === "id");
  if (!hasId) {
    schema.columns.unshift({ name: "id", type: "string", nullable: false });
  }
};

const normaliseRow = (row: Row): Row => {
  const clone = cloneRow(row);
  clone.id = String(clone.id);
  return clone;
};

export type StorageSnapshot = Table[];

export class InMemoryTableStorage {
  private readonly tables = new Map<string, TableState>();

  constructor(initialTables: Table[] = []) {
    initialTables.forEach(table => this.upsertTable(table));
  }

  upsertTable(table: Table): void {
    const schema = cloneSchema(table.schema);
    ensureIdColumn(schema);
    const rows = new Map<string, Row>();
    table.rows.forEach(row => {
      const normalised = normaliseRow(cloneRow(row));
      rows.set(normalised.id, normalised);
    });
    this.tables.set(table.name, { schema, rows });
  }

  replaceAll(tables: Table[]): void {
    this.tables.clear();
    tables.forEach(table => this.upsertTable(table));
  }

  getTable(name: string): Table | undefined {
    const state = this.tables.get(name);
    if (!state) return undefined;
    return {
      name,
      schema: cloneSchema(state.schema),
      rows: Array.from(state.rows.values()).map(row => cloneRow(row)),
    };
  }

  listTables(): Table[] {
    return Array.from(this.tables.keys())
      .map(name => this.getTable(name))
      .filter((table): table is Table => Boolean(table));
  }

  clear(): void {
    this.tables.clear();
  }

  applyEvents(events: Event[]): void {
    events.forEach(event => this.applyEvent(event));
  }

  applyEvent(event: Event): void {
    if (!event?.table) return;
    if (event.kind === "SCHEMA_ADD_COL" || event.kind === "SCHEMA_DROP_COL") {
      this.applySchemaChange(event);
      return;
    }
    const state = this.ensureTableState(event.table, event.schemaVersion);
    if (event.schemaVersion && event.schemaVersion > state.schema.version) {
      state.schema.version = event.schemaVersion;
    }

    if (event.kind === "DELETE") {
      const id = event.before?.id ?? event.after?.id;
      if (id != null) {
        state.rows.delete(String(id));
      }
      return;
    }

    const payload = event.after ?? undefined;
    if (!payload) return;
    const normalised = normaliseRow(payload);
    const existing = state.rows.get(normalised.id);
    const mergedData = existing ? ({ ...existing, ...normalised } as Row) : normalised;
    const merged = cloneRow(mergedData);
    this.syncSchemaColumns(state, merged);
    state.rows.set(merged.id, merged);
  }

  snapshot(): StorageSnapshot {
    return this.listTables();
  }

  private ensureTableState(tableName: string, version?: number): TableState {
    let state = this.tables.get(tableName);
    if (!state) {
      state = {
        schema: createEmptySchema(tableName, version ?? 1),
        rows: new Map<string, Row>(),
      };
      this.tables.set(tableName, state);
    }
    if (version && version > state.schema.version) {
      state.schema.version = version;
    }
    ensureIdColumn(state.schema);
    return state;
  }

  private applySchemaChange(event: Event & { schemaChange?: SchemaChange }): void {
    const change = event.schemaChange;
    if (!change) return;
    const state = this.ensureTableState(event.table, change.nextVersion ?? event.schemaVersion);
    state.schema.version = Math.max(
      state.schema.version,
      change.nextVersion ?? event.schemaVersion ?? state.schema.version,
    );
    if (event.kind === "SCHEMA_ADD_COL") {
      this.addColumn(state, change.column);
    } else if (event.kind === "SCHEMA_DROP_COL") {
      this.dropColumn(state, change.column.name);
    }
  }

  private addColumn(state: TableState, column: SchemaColumn): void {
    const existing = state.schema.columns.find(col => col.name === column.name);
    if (existing) {
      existing.type = column.type;
      if (column.nullable) existing.nullable = true;
    } else {
      state.schema.columns.push(cloneSchemaColumn(column));
    }
    state.rows.forEach(row => {
      if (!(column.name in row)) {
        row[column.name] = null;
      }
    });
  }

  private dropColumn(state: TableState, columnName: string): void {
    if (columnName === "id") return;
    state.schema.columns = state.schema.columns.filter(column => column.name !== columnName);
    state.rows.forEach(row => {
      if (columnName in row) {
        delete row[columnName];
      }
    });
  }

  private syncSchemaColumns(state: TableState, row: Row): void {
    const columns = state.schema.columns;
    Object.entries(row).forEach(([key, value]) => {
      if (key === "id" || key.startsWith("__")) return;
      let column = columns.find(col => col.name === key);
      if (!column) {
        column = {
          name: key,
          type: inferColumnType(key, value),
        };
        columns.push(column);
      }
      if (value == null) {
        column.nullable = true;
      }
    });
  }
}
