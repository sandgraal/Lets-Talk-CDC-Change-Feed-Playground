import { BaseEngine } from "./base";
import { CdcEvent, Row, SourceOp } from "../core/types";

export class PollingEngine extends BaseEngine {
  name = "polling" as const;

  private table = new Map<string, Row>();
  private lastSync = 0;
  private pollIntervalMs = 1000;
  private includeSoftDeletes = false;

  configure(opts: { poll_interval_ms?: number; include_soft_deletes?: boolean }) {
    if (opts.poll_interval_ms !== undefined) this.pollIntervalMs = opts.poll_interval_ms;
    if (opts.include_soft_deletes !== undefined) this.includeSoftDeletes = opts.include_soft_deletes;
  }

  reset(seed: number) {
    super.reset(seed);
    this.table.clear();
    this.lastSync = 0;
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
    } else if (op.op === "update") {
      const cur = this.table.get(op.pk.id);
      if (!cur || cur.deleted) return;
      this.table.set(op.pk.id, {
        ...cur,
        data: { ...cur.data, ...op.after },
        version: cur.version + 1,
        updated_at_ms: op.t,
      });
    } else if (op.op === "delete") {
      const cur = this.table.get(op.pk.id);
      if (!cur) return;
      this.table.set(op.pk.id, {
        ...cur,
        deleted: true,
        updated_at_ms: op.t,
      });
    }
  }

  private shouldPoll(nowMs: number) {
    return nowMs - this.lastSync >= this.pollIntervalMs;
  }

  tick(nowMs: number) {
    if (!this.shouldPoll(nowMs)) return;

    const changed = [...this.table.values()].filter(r => r.updated_at_ms > this.lastSync);

    for (const row of changed) {
      if (row.deleted && !this.includeSoftDeletes) continue;

      const evt: CdcEvent = {
        source: "demo-db",
        table: "customers",
        op: row.deleted ? "d" : row.version > 1 ? "u" : "c",
        pk: { id: row.id },
        before: null,
        after: row.deleted ? null : row.data,
        ts_ms: row.updated_at_ms,
        tx: { id: `tx-${row.updated_at_ms}`, lsn: null },
        seq: ++this.seq,
        meta: { method: "polling" },
      };

      this.bus.emit(evt);
    }

    this.lastSync = nowMs;
  }
}
