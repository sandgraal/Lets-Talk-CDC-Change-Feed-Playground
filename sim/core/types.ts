export type Row = {
  id: string;
  table: string;
  data: Record<string, any>;
  version: number;
  updated_at_ms: number;
  deleted: boolean;
};

export type SourceOp =
  | {
      t: number;
      op: "insert";
      table: string;
      pk: { id: string };
      after: Record<string, any>;
      txn?: { id: string; index: number; total?: number; last?: boolean };
    }
  | {
      t: number;
      op: "update";
      table: string;
      pk: { id: string };
      after: Record<string, any>;
      txn?: { id: string; index: number; total?: number; last?: boolean };
    }
  | {
      t: number;
      op: "delete";
      table: string;
      pk: { id: string };
      txn?: { id: string; index: number; total?: number; last?: boolean };
    };

export type SchemaChangeMeta = {
  action: "ADD_COLUMN" | "DROP_COLUMN";
  column: { name: string; type: string; nullable?: boolean };
  previousVersion: number;
  nextVersion: number;
};

export type CdcEvent = {
  source: string;
  table: string;
  op: "c" | "u" | "d" | "s";
  pk: { id: string };
  before: Record<string, any> | null;
  after: Record<string, any> | null;
  ts_ms: number;
  tx: { id: string; lsn: number | null; index?: number; total?: number; last?: boolean };
  seq: number;
  meta: { method: "polling" | "trigger" | "log" };
  schemaChange?: SchemaChangeMeta | null;
};

export type AuditRow = {
  audit_id: string;
  op: "c" | "u" | "d";
  table: string;
  pk: { id: string };
  before: Record<string, any> | null;
  after: Record<string, any> | null;
  tx_id: string;
  tx_index?: number;
  tx_total?: number;
  tx_last?: boolean;
  commit_ts_ms: number;
};

export type WalRecord = {
  lsn: number;
  tx_id: string;
  table: string;
  tx_index?: number;
  tx_total?: number;
  tx_last?: boolean;
  op: "c" | "u" | "d";
  pk: { id: string };
  before: Record<string, any> | null;
  after: Record<string, any> | null;
  commit_ts_ms: number;
};
