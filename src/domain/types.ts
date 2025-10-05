export type CDCMode = 'LOG_BASED' | 'QUERY_BASED' | 'TRIGGER_BASED';

export type ColumnType = 'string' | 'number' | 'bool' | 'timestamp';

export type SchemaColumn = {
  name: string;
  type: ColumnType;
  nullable?: boolean;
};

export type Schema = {
  name: string;
  columns: SchemaColumn[];
  version: number;
};

export type Row = {
  id: string;
  [key: string]: unknown;
  __ts?: number;
};

export type ChangeKind =
  | 'INSERT'
  | 'UPDATE'
  | 'DELETE'
  | 'SCHEMA_ADD_COL'
  | 'SCHEMA_DROP_COL';

export type Event = {
  id: string;
  kind: ChangeKind;
  table: string;
  before?: Row;
  after?: Row;
  txnId?: string;
  commitTs: number;
  schemaVersion: number;
  topic: string;
  partition: number;
  offset?: number;
};

export type Transaction = {
  id: string;
  changes: Omit<Event, 'id' | 'topic' | 'partition' | 'offset'>[];
  commitTs: number;
};

export type MetricsSnapshot = {
  produced: number;
  consumed: number;
  backlog: number;
  lagMsP50: number;
  lagMsP95: number;
  missedDeletes: number;
  writeAmplification: number;
  snapshotRows: number;
  errors: number;
};

export type Table = {
  name: string;
  schema: Schema;
  rows: Row[];
};

export type SourceOp =
  | {
      t: number;
      op: 'insert';
      table: string;
      pk: { id: string };
      after: Record<string, unknown>;
    }
  | {
      t: number;
      op: 'update';
      table: string;
      pk: { id: string };
      after: Record<string, unknown>;
    }
  | {
      t: number;
      op: 'delete';
      table: string;
      pk: { id: string };
    };
