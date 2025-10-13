import { describe, expect, it } from "vitest";
import { createQueryBasedAdapter, createTriggerBasedAdapter, createLogBasedAdapter, type ModeRuntime } from "../../modes";
import { EventBus } from "../../engine/eventBus";
import { Scheduler } from "../../engine/scheduler";
import { MetricsStore } from "../../engine/metrics";
import type { Event, SourceOp } from "../../domain/types";

function createRuntime(topic: string) {
  const metrics = new MetricsStore();
  const runtime: ModeRuntime = {
    bus: new EventBus<Event>(),
    scheduler: new Scheduler(),
    metrics,
    topic,
  };
  return { runtime, metrics };
}

describe("Mode adapters", () => {
  it("query adapter records missed deletes when soft deletes are disabled", () => {
    const adapter = createQueryBasedAdapter();
    const { runtime, metrics } = createRuntime("cdc.query");
    adapter.initialise?.(runtime);
    adapter.configure?.({ fetch_interval_ms: 25 });
    adapter.configure?.({ poll_interval_ms: 10, include_soft_deletes: false });

    const emitted: Event[] = [];
    adapter.startTailing?.(events => {
      emitted.push(...events);
      return events;
    });

    const insert: SourceOp = {
      t: 1,
      op: "insert",
      table: "widgets",
      pk: { id: "w1" },
      after: { status: "new" },
    };
    const deleteOp: SourceOp = {
      t: 20,
      op: "delete",
      table: "widgets",
      pk: { id: "w1" },
    };

    adapter.applySource?.(insert);
    adapter.tick?.(15);
    adapter.applySource?.(deleteOp);
    adapter.tick?.(30);

    expect(emitted.some(evt => evt.kind === "DELETE")).toBe(false);
    expect(metrics.snapshot().missedDeletes).toBe(1);
  });

  it("trigger adapter bumps write amplification and emits audit events", () => {
    const adapter = createTriggerBasedAdapter();
    const { runtime, metrics } = createRuntime("cdc.trigger");
    adapter.initialise?.(runtime);
    adapter.configure?.({ extract_interval_ms: 1, trigger_overhead_ms: 5 });

    const emitted: Event[] = [];
    adapter.startTailing?.(events => {
      emitted.push(...events);
      return events;
    });

    const insert: SourceOp = {
      t: 10,
      op: "insert",
      table: "widgets",
      pk: { id: "w1" },
      after: { status: "new" },
    };
    const update: SourceOp = {
      t: 20,
      op: "update",
      table: "widgets",
      pk: { id: "w1" },
      after: { status: "updated" },
    };

    adapter.applySource?.(insert);
    adapter.applySource?.(update);
    adapter.tick?.(50);

    expect(emitted.length).toBe(2);
    expect(metrics.snapshot().writeAmplification).toBe(2);
  });

  it("trigger adapter carries transaction boundaries", () => {
    const adapter = createTriggerBasedAdapter();
    const { runtime } = createRuntime("cdc.trigger");
    adapter.initialise?.(runtime);
    adapter.configure?.({ extract_interval_ms: 1, trigger_overhead_ms: 5 });

    const emitted: Event[] = [];
    adapter.startTailing?.(events => {
      emitted.push(...events);
      return events;
    });

    const insertOrder: SourceOp = {
      t: 40,
      op: "insert",
      table: "orders",
      pk: { id: "ORD-9" },
      after: { status: "pending" },
      txn: { id: "txn-9", index: 0, total: 2 },
    };
    const insertItem: SourceOp = {
      t: 40,
      op: "insert",
      table: "order_items",
      pk: { id: "ORD-9-1" },
      after: { order_id: "ORD-9", sku: "SKU-9" },
      txn: { id: "txn-9", index: 1, total: 2, last: true },
    };

    adapter.applySource?.(insertOrder);
    adapter.applySource?.(insertItem);
    adapter.tick?.(100);

    expect(emitted).toHaveLength(2);
    expect(emitted[1].txnLast).toBe(true);
    expect(emitted[1].txnId).toBe("txn-9");
    expect(emitted[0].txnLast).toBe(false);
  });

  it("log adapter flushes WAL entries in order", () => {
    const adapter = createLogBasedAdapter();
    const { runtime } = createRuntime("cdc.log");
    adapter.initialise?.(runtime);

    adapter.startSnapshot?.([], () => []);

    const emitted: Event[] = [];
    adapter.startTailing?.(events => {
      emitted.push(...events);
      return events;
    });

    const insert: SourceOp = {
      t: 5,
      op: "insert",
      table: "widgets",
      pk: { id: "w1" },
      after: { status: "new" },
    };
    const update: SourceOp = {
      t: 15,
      op: "update",
      table: "widgets",
      pk: { id: "w1" },
      after: { status: "updated" },
    };

    adapter.applySource?.(insert);
    adapter.applySource?.(update);
    adapter.tick?.(200);

    expect(emitted.length).toBe(2);
    expect(emitted[0].kind).toBe("INSERT");
    expect(emitted[1].kind).toBe("UPDATE");
    expect(emitted[0].commitTs).toBeLessThan(emitted[1].commitTs);
  });

  it("log adapter emits snapshot rows with schema metadata", () => {
    const adapter = createLogBasedAdapter();
    const { runtime } = createRuntime("cdc.log");
    adapter.initialise?.(runtime);

    const snapshot: Event[] = [];
    adapter.startSnapshot?.(
      [
        {
          name: "widgets",
          schema: {
            name: "widgets",
            columns: [
              { name: "id", type: "string" },
              { name: "status", type: "string" },
            ],
            version: 3,
          },
          rows: [
            { id: "w1", status: "seed", __ts: 50 },
          ],
        },
      ],
      events => {
        snapshot.push(...events);
        return events;
      },
    );

    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].kind).toBe("INSERT");
    expect(snapshot[0].schemaVersion).toBe(3);
    expect(snapshot[0].after?.status).toBe("seed");
  });

  it("log adapter preserves transaction metadata", () => {
    const adapter = createLogBasedAdapter();
    const { runtime } = createRuntime("cdc.log");
    adapter.initialise?.(runtime);

    const emitted: Event[] = [];
    adapter.startTailing?.(events => {
      emitted.push(...events);
      return events;
    });

    const opA: SourceOp = {
      t: 100,
      op: "insert",
      table: "orders",
      pk: { id: "ORD-1" },
      after: { status: "pending" },
      txn: { id: "txn-1", index: 0, total: 2 },
    };
    const opB: SourceOp = {
      t: 100,
      op: "insert",
      table: "order_items",
      pk: { id: "ORD-1-1" },
      after: { order_id: "ORD-1", sku: "SKU-1" },
      txn: { id: "txn-1", index: 1, total: 2, last: true },
    };

    adapter.applySource?.(opA);
    adapter.applySource?.(opB);
    adapter.tick?.(200);

    expect(emitted).toHaveLength(2);
    expect(emitted[0].txnId).toBe("txn-1");
    expect(emitted[0].txnLast).toBe(false);
    expect(emitted[0].txnTotal).toBe(2);
    expect(emitted[1].txnLast).toBe(true);
    expect(emitted[1].txnIndex).toBe(1);
  });

  it("log adapter emits schema change events and bumps schema version", () => {
    const adapter = createLogBasedAdapter();
    const { runtime } = createRuntime("cdc.log");
    adapter.initialise?.(runtime);

    const emitted: Event[] = [];
    adapter.startTailing?.(events => {
      emitted.push(...events);
      return events;
    });

    const column = { name: "priority_flag", type: "bool" } as const;

    adapter.applySchemaChange?.("orders", "ADD_COLUMN", column, 100);
    expect(emitted).toHaveLength(1);
    expect(emitted[0].kind).toBe("SCHEMA_ADD_COL");
    expect(emitted[0].schemaVersion).toBe(2);
    expect(emitted[0].schemaChange?.column.name).toBe("priority_flag");

    adapter.applySchemaChange?.("orders", "DROP_COLUMN", column, 200);
    expect(emitted).toHaveLength(2);
    expect(emitted[1].kind).toBe("SCHEMA_DROP_COL");
    expect(emitted[1].schemaVersion).toBe(3);
    expect(emitted[1].schemaChange?.previousVersion).toBe(2);
  });

  it("trigger adapter drains schema change events on next extract", () => {
    const adapter = createTriggerBasedAdapter();
    const { runtime } = createRuntime("cdc.trigger");
    adapter.initialise?.(runtime);
    adapter.configure?.({ extract_interval_ms: 1, trigger_overhead_ms: 5 });

    const emitted: Event[] = [];
    adapter.startTailing?.(events => {
      emitted.push(...events);
      return events;
    });

    const column = { name: "priority_flag", type: "bool" } as const;

    adapter.applySchemaChange?.("orders", "ADD_COLUMN", column, 100);
    adapter.tick?.(0);
    expect(emitted).toHaveLength(0);

    adapter.tick?.(10);
    expect(emitted).toHaveLength(1);
    expect(emitted[0].kind).toBe("SCHEMA_ADD_COL");
    expect(emitted[0].schemaVersion).toBe(2);
    expect(emitted[0].commitTs).toBe(105);
  });

  it("query adapter surfaces schema change on subsequent poll", () => {
    const adapter = createQueryBasedAdapter();
    const { runtime } = createRuntime("cdc.query");
    adapter.initialise?.(runtime);
    adapter.configure?.({ poll_interval_ms: 10 });

    const emitted: Event[] = [];
    adapter.startTailing?.(events => {
      emitted.push(...events);
      return events;
    });

    const column = { name: "priority_flag", type: "bool" } as const;

    adapter.applySchemaChange?.("orders", "ADD_COLUMN", column, 50);
    adapter.tick?.(5);
    expect(emitted).toHaveLength(0);

    adapter.tick?.(25);
    expect(emitted).toHaveLength(1);
    expect(emitted[0].kind).toBe("SCHEMA_ADD_COL");
    expect(emitted[0].schemaVersion).toBe(2);
  });
});
