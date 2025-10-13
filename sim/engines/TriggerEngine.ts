import { BaseEngine } from "./base";
import { AuditRow, CdcEvent, Row, SourceOp } from "../core/types";

export class TriggerEngine extends BaseEngine {
  name = "trigger" as const;

  private table = new Map<string, Row>();
  private audit: AuditRow[] = [];
  private extractOffset = 0;
  private extractIntervalMs = 500;
  private lastExtract = 0;
  private triggerOverheadMs = 5;

  configure(opts: { extract_interval_ms?: number; trigger_overhead_ms?: number }) {
    if (opts.extract_interval_ms !== undefined) this.extractIntervalMs = opts.extract_interval_ms;
    if (opts.trigger_overhead_ms !== undefined) this.triggerOverheadMs = opts.trigger_overhead_ms;
  }

  reset(seed: number) {
    super.reset(seed);
    this.table.clear();
    this.audit = [];
    this.extractOffset = 0;
    this.lastExtract = 0;
  }

  applySourceOp(op: SourceOp) {
    const commitTs = op.t + this.triggerOverheadMs;
    const txnMeta = op.txn ?? { id: `tx-${commitTs}`, index: 0, total: 1, last: true };
    const tx_id = txnMeta.id ?? `tx-${commitTs}`;
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
        updated_at_ms: commitTs,
        deleted: false,
      });

      this.audit.push({
        audit_id: cryptoRandomId(),
        op: "c",
        pk: op.pk,
        before: null,
        after: op.after,
        tx_id,
        tx_index,
        tx_total,
        tx_last,
        table: op.table,
        commit_ts_ms: commitTs,
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
        updated_at_ms: commitTs,
        deleted: false,
      });

      this.audit.push({
        audit_id: cryptoRandomId(),
        op: "u",
        pk: op.pk,
        before,
        after: next,
        tx_id,
        tx_index,
        tx_total,
        tx_last,
        table: op.table,
        commit_ts_ms: commitTs,
      });
    } else if (op.op === "delete") {
      const cur = this.table.get(op.pk.id) || {
        id: op.pk.id,
        table: op.table,
        data: {},
        version: 0,
        updated_at_ms: commitTs,
        deleted: true,
      };

      this.table.set(op.pk.id, {
        ...cur,
        deleted: true,
        updated_at_ms: commitTs,
      });

      this.audit.push({
        audit_id: cryptoRandomId(),
        op: "d",
        pk: op.pk,
        before: cur ? cur.data : null,
        after: null,
        tx_id,
        tx_index,
        tx_total,
        tx_last,
        table: op.table,
        commit_ts_ms: commitTs,
      });
    }
  }

  tick(nowMs: number) {
    if (nowMs - this.lastExtract < this.extractIntervalMs) return;

    const batch = this.audit.slice(this.extractOffset);

    for (const entry of batch) {
      const evt: CdcEvent = {
        source: "demo-db",
        table: entry.table,
        op: entry.op,
        pk: entry.pk,
        before: entry.before,
        after: entry.after,
        ts_ms: entry.commit_ts_ms,
        tx: {
          id: entry.tx_id,
          lsn: null,
          index: entry.tx_index,
          total: entry.tx_total,
          last: entry.tx_last,
        },
        seq: ++this.seq,
        meta: { method: "trigger" },
      };

      this.bus.emit(evt);
    }

    this.extractOffset = this.audit.length;
    this.lastExtract = nowMs;
  }
}

function cryptoRandomId() {
  return Math.random().toString(36).slice(2);
}
