export type Row = {
  id: string;
  data: Record<string, any>;
  version: number;
  updated_at_ms: number;
  deleted: boolean;
};

export type SourceOp =
  | { t: number; op: "insert"; table: string; pk: { id: string }; after: Record<string, any> }
  | { t: number; op: "update"; table: string; pk: { id: string }; after: Record<string, any> }
  | { t: number; op: "delete"; table: string; pk: { id: string } };

export type CdcEvent = {
  source: string;
  table: string;
  op: "c" | "u" | "d";
  pk: { id: string };
  before: Record<string, any> | null;
  after: Record<string, any> | null;
  ts_ms: number;
  tx: { id: string; lsn: number | null };
  seq: number;
  meta: { method: "polling" | "trigger" | "log" };
};

export type AuditRow = {
  audit_id: string;
  op: "c" | "u" | "d";
  pk: { id: string };
  before: Record<string, any> | null;
  after: Record<string, any> | null;
  tx_id: string;
  commit_ts_ms: number;
};

export type WalRecord = {
  lsn: number;
  tx_id: string;
  op: "c" | "u" | "d";
  pk: { id: string };
  before: Record<string, any> | null;
  after: Record<string, any> | null;
  commit_ts_ms: number;
};
