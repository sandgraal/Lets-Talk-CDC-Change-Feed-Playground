import { describe, expect, it } from "vitest";

import type { Event } from "../domain/types";
import { MetricsStore } from "../engine/metrics";
import type { EventBus } from "../engine/eventBus";
import type { Scheduler } from "../engine/scheduler";
import type { ModeRuntime } from "./types";
import { createQueryBasedAdapter } from "./queryBased";

describe("queryBased adapter", () => {
  it("propagates transaction metadata for polling events", () => {
    const adapter = createQueryBasedAdapter();
    const runtime: ModeRuntime = {
      bus: {} as EventBus,
      scheduler: {} as Scheduler,
      metrics: new MetricsStore(),
      topic: "cdc.test",
    };

    adapter.initialise?.(runtime);

    const batches: Event[][] = [];
    adapter.startTailing?.(events => {
      batches.push(events);
      return events;
    });

    adapter.applySource?.({
      t: 300,
      op: "insert",
      table: "orders",
      pk: { id: "ORD-720" },
      after: { customer_id: "C-32", status: "pending", subtotal: 412.5 },
      txn: { id: "TX-720", index: 0, total: 3 },
    });
    adapter.applySource?.({
      t: 300,
      op: "insert",
      table: "order_items",
      pk: { id: "ORD-720-1" },
      after: { order_id: "ORD-720", sku: "SKU-9", qty: 2, price: 99.5 },
      txn: { id: "TX-720", index: 1, total: 3 },
    });
    adapter.applySource?.({
      t: 300,
      op: "insert",
      table: "order_items",
      pk: { id: "ORD-720-2" },
      after: { order_id: "ORD-720", sku: "SKU-44", qty: 1, price: 213.5 },
      txn: { id: "TX-720", index: 2, total: 3, last: true },
    });

    adapter.tick?.(1000);

    expect(batches).toHaveLength(1);
    const events = batches[0];
    expect(events).toHaveLength(3);

    expect(events.map(event => event.txnId)).toEqual(["TX-720", "TX-720", "TX-720"]);
    expect(events.map(event => event.txnIndex)).toEqual([0, 1, 2]);
    expect(events.map(event => event.txnTotal)).toEqual([3, 3, 3]);
    expect(events.map(event => event.txnLast)).toEqual([false, false, true]);
  });
});
