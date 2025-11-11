import { describe, expect, it, vi } from "vitest";
import { MetricsStore } from "../../engine/metrics";

const createEvent = (commitTs: number) => ({ commitTs });

describe("MetricsStore", () => {
  it("tracks produced, consumed, backlog, and lag percentiles", () => {
    const store = new MetricsStore();
    const nowSpy = vi.spyOn(Date, "now");

    nowSpy.mockReturnValue(1_000);
    store.onProduced([createEvent(100), createEvent(200)]);

    nowSpy.mockReturnValue(1_500);
    store.onConsumed([createEvent(500), createEvent(700)]);

    const snapshot = store.snapshot();
    expect(snapshot.produced).toBe(2);
    expect(snapshot.consumed).toBe(2);
    expect(snapshot.backlog).toBe(0);
    expect(snapshot.lagMsP50).toBe(900);
    expect(Math.round(snapshot.lagMsP95)).toBe(990);

    nowSpy.mockRestore();
  });

  it("notifies lag aggregators on updates, reset, and supports unsubscribe", () => {
    const store = new MetricsStore();
    const aggregator = vi.fn();
    const unsubscribe = store.registerLagAggregator(aggregator);

    expect(aggregator).toHaveBeenCalledWith([]);
    aggregator.mockClear();

    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(2_000);
    store.onConsumed([createEvent(500)]);
    expect(aggregator).toHaveBeenCalledWith([1_500]);

    aggregator.mockClear();
    store.reset();
    expect(aggregator).toHaveBeenCalledWith([]);

    unsubscribe();
    aggregator.mockClear();
    store.onConsumed([createEvent(1_800)]);
    expect(aggregator).not.toHaveBeenCalled();

    nowSpy.mockRestore();
  });

  it("swallows aggregator errors so other callbacks still run", () => {
    const store = new MetricsStore();
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    const good = vi.fn();

    store.registerLagAggregator(bad);
    store.registerLagAggregator(good);

    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(3_000);
    expect(() => store.onConsumed([createEvent(2_000)])).not.toThrow();
    expect(good).toHaveBeenCalledWith([1_000]);

    nowSpy.mockRestore();
  });

  it("derives trigger write amplification ratios from source and change writes", () => {
    const store = new MetricsStore();

    expect(store.snapshot().writeAmplification).toBe(0);

    store.recordWriteAmplification();
    expect(store.snapshot().writeAmplification).toBeCloseTo(2);

    store.recordWriteAmplification(2, 1);
    expect(store.snapshot().writeAmplification).toBeCloseTo(2.5);

    store.reset();
    expect(store.snapshot().writeAmplification).toBe(0);
  });
});
