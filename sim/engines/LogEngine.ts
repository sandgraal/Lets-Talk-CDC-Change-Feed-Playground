import { BaseEngine } from "./base";
import { CdcEvent, Row, SourceOp, WalRecord } from "../core/types";

export class LogEngine extends BaseEngine {
  name = "log" as const;

  private table = new Map<string, Row>();
  private wal: WalRecord[] = [];
  private lsn = 0;
  private fetchIntervalMs = 100;
  private lastFetch = 0;

  configure(opts: { fetch_interval_ms?: number }) {
    if (opts.fetch_interval_ms !== undefined) this.fetchIntervalMs = opts.fetch_interval_ms;
  }

  applySourceOp(op: SourceOp) {
    if (op.op === "insert") {
      this.table.set(op.pk.id, {
        id: op.pk.id,
        data: op.after,
        version: 1,
        updated_at_ms: op.t,
        deleted: false,
      });
      this.wal.push({
        lsn: ++this.lsn,
        tx_id: `tx-${op.t}`,
        op: "c",
        pk: op.pk,
        before: null,
        after: op.after,
        commit_ts_ms: op.t,
      });
    } else if (op.op === "update") {
      const cur = this.table.get(op.pk.id);
      const before = cur ? { ...cur.data } : null;
      const next = cur ? { ...cur.data, ...op.after } : op.after;

      this.table.set(op.pk.id, {
        id: op.pk.id,
        data: next,
        version: (cur?.version ?? 0) + 1,
        updated_at_ms: op.t,
        deleted: false,
      });

      this.wal.push({
        lsn: ++this.lsn,
        tx_id: `tx-${op.t}`,
        op: "u",
        pk: op.pk,
        before,
        after: next,
        commit_ts_ms: op.t,
      });
    } else if (op.op === "delete") {
      const cur = this.table.get(op.pk.id);
      this.table.delete(op.pk.id);

      this.wal.push({
        lsn: ++this.lsn,
        tx_id: `tx-${op.t}`,
        op: "d",
        pk: op.pk,
        before: cur ? cur.data : null,
        after: null,
        commit_ts_ms: op.t,
      });
    }
  }

  tick(nowMs: number) {
    if (nowMs - this.lastFetch < this.fetchIntervalMs) return;

    const toEmit = this.wal.slice(this.seq);

    for (const record of toEmit) {
      const evt: CdcEvent = {
        source: "demo-db",
        table: "customers",
        op: record.op,
        pk: record.pk,
        before: record.before,
        after: record.after,
        ts_ms: record.commit_ts_ms,
        tx: { id: record.tx_id, lsn: record.lsn },
        seq: ++this.seq,
        meta: { method: "log" },
      };

      this.bus.emit(evt);
    }

    this.lastFetch = nowMs;
  }
}
