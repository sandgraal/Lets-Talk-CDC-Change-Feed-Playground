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

  reset(seed: number) {
    super.reset(seed);
    this.table.clear();
    this.wal = [];
    this.lsn = 0;
    this.lastFetch = 0;
  }

  applySourceOp(op: SourceOp) {
    const txnMeta = op.txn ?? { id: `tx-${op.t}`, index: 0, total: 1, last: true };
    const tx_id = txnMeta.id ?? `tx-${op.t}`;
    const tx_index = typeof txnMeta.index === "number" ? txnMeta.index : 0;
    const tx_total = typeof txnMeta.total === "number" ? txnMeta.total : 1;
    const tx_last =
      typeof txnMeta.last === "boolean" ? txnMeta.last : tx_index >= tx_total - 1;

    if (op.op === "insert") {
      this.table.set(op.pk.id, {
        id: op.pk.id,
        table: op.table,
        data: op.after,
        version: 1,
        updated_at_ms: op.t,
        deleted: false,
      });
      this.wal.push({
        lsn: ++this.lsn,
        tx_id,
        tx_index,
        tx_total,
        tx_last,
        table: op.table,
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
        table: cur?.table ?? op.table,
        data: next,
        version: (cur?.version ?? 0) + 1,
        updated_at_ms: op.t,
        deleted: false,
      });

      this.wal.push({
        lsn: ++this.lsn,
        tx_id,
        tx_index,
        tx_total,
        tx_last,
        table: op.table,
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
        tx_id,
        tx_index,
        tx_total,
        tx_last,
        table: op.table,
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
        table: record.table,
        op: record.op,
        pk: record.pk,
        before: record.before,
        after: record.after,
        ts_ms: record.commit_ts_ms,
        tx: {
          id: record.tx_id,
          lsn: record.lsn,
          index: record.tx_index,
          total: record.tx_total,
          last: record.tx_last,
        },
        seq: ++this.seq,
        meta: { method: "log" },
      };

      this.bus.emit(evt);
    }

    this.lastFetch = nowMs;
  }
}
