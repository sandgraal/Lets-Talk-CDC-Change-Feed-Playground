import { describe, expect, it } from "vitest";
import { CDCController } from "../../engine/stateMachine";
import { EventBus } from "../../engine/eventBus";
import { Scheduler } from "../../engine/scheduler";
import { MetricsStore } from "../../engine/metrics";
import type { Event } from "../../domain/types";

const sampleEvent: Event = {
  id: "evt-1",
  kind: "INSERT",
  table: "widgets",
  commitTs: 100,
  schemaVersion: 1,
  topic: "cdc.widgets",
  partition: 0,
  after: { id: "w1" },
  before: undefined,
  txnId: "tx-100",
};

describe("CDCController", () => {
  it("enriches emitted events with offsets and tracks metrics", () => {
    const bus = new EventBus<Event>();
    const scheduler = new Scheduler();
    const metrics = new MetricsStore();
    const controller = new CDCController("LOG_BASED", bus, scheduler, metrics, "cdc.widgets");

    const enriched = controller.emit([sampleEvent]);
    expect(enriched[0].offset).toBe(0);
    expect(bus.size("cdc.widgets")).toBe(1);

    const snapshotAfterProduce = metrics.snapshot();
    expect(snapshotAfterProduce.produced).toBe(1);
    expect(snapshotAfterProduce.backlog).toBe(1);

    const drained = bus.consume("cdc.widgets", 1);
    metrics.onConsumed(drained);
    const snapshotAfterConsume = metrics.snapshot();
    expect(snapshotAfterConsume.consumed).toBe(1);
    expect(snapshotAfterConsume.backlog).toBe(0);

    controller.stop();
    const snapshotAfterStop = metrics.snapshot();
    expect(snapshotAfterStop.produced).toBe(0);
    expect(snapshotAfterStop.consumed).toBe(0);
    expect(bus.size("cdc.widgets")).toBe(0);
  });
});
