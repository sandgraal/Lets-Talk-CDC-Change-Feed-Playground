import { describe, expect, it } from "vitest";
import { EventBus } from "../../engine/eventBus";

describe("EventBus", () => {
  it("assigns monotonically increasing offsets and preserves FIFO ordering", () => {
    const bus = new EventBus<{ offset?: number; payload: string }>();
    const published = bus.publish("cdc.widgets", [
      { payload: "first" },
      { payload: "second" },
    ]);

    expect(published.map(evt => evt.offset)).toEqual([0, 1]);
    expect(bus.size("cdc.widgets")).toBe(2);

    const consumed = bus.consume("cdc.widgets", 2);
    expect(consumed.map(evt => evt.payload)).toEqual(["first", "second"]);
    expect(bus.size("cdc.widgets")).toBe(0);
  });

  it("resets per-topic queues", () => {
    const bus = new EventBus<{ offset?: number; payload: string }>();
    bus.publish("cdc.a", [{ payload: "a" }]);
    bus.publish("cdc.b", [{ payload: "b" }]);

    bus.reset("cdc.a");
    expect(bus.size("cdc.a")).toBe(0);
    expect(bus.size("cdc.b")).toBe(1);

    bus.reset();
    expect(bus.size("cdc.b")).toBe(0);
  });
});
