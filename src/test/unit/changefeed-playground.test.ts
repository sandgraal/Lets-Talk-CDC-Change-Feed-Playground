import { describe, expect, it } from "vitest";
import { createInitialState, reducePlayground, selectLanes } from "../../changefeed/model";

const runTicks = (state: ReturnType<typeof createInitialState>, ticks: number) => {
  let next = state;
  for (let i = 0; i < ticks; i += 1) {
    next = reducePlayground(next, { type: "tick", deltaMs: 50 });
  }
  return next;
};

describe("change feed playground", () => {
  it("keeps transactions atomic under drift when apply-on-commit is enabled", () => {
    let ordered = createInitialState({ commitDrift: true, partitions: 2, applyPolicy: "apply-on-commit" });
    ordered = reducePlayground(ordered, { type: "updateCustomer", tier: "bronze", commitTs: 100, id: "C-100" });
    ordered = reducePlayground(ordered, { type: "updateCustomer", tier: "platinum", commitTs: 200, id: "C-100" });
    ordered = runTicks(ordered, 6);
    const orderedTier = selectLanes(ordered).consumer.tables.customers?.["C-100"]?.tier;

    let polled = createInitialState({ commitDrift: true, partitions: 2, applyPolicy: "apply-as-polled" });
    polled = reducePlayground(polled, { type: "updateCustomer", tier: "bronze", commitTs: 100, id: "C-100" });
    polled = reducePlayground(polled, { type: "updateCustomer", tier: "platinum", commitTs: 200, id: "C-100" });
    polled = runTicks(polled, 6);
    const polledTier = selectLanes(polled).consumer.tables.customers?.["C-100"]?.tier;
    expect(selectLanes(ordered).consumer.appliedLog).toHaveLength(2);
    expect(selectLanes(polled).consumer.appliedLog).toHaveLength(2);

    expect(orderedTier).toBe("platinum");
    expect(polledTier).toBe("bronze");
  });

  it("handles schema drift by projecting or ignoring the extra column", () => {
    let state = createInitialState({ schemaDrift: true, projectSchemaDrift: true });
    state = reducePlayground(state, { type: "insertCustomers", count: 1 });
    state = runTicks(state, 4);
    const projectedEntries = Object.values(selectLanes(state).consumer.tables.customers ?? {});
    expect(projectedEntries[projectedEntries.length - 1]).toMatchObject({ priority_flag: true });

    let ignoring = createInitialState({ schemaDrift: true, projectSchemaDrift: false });
    ignoring = reducePlayground(ignoring, { type: "insertCustomers", count: 1 });
    ignoring = runTicks(ignoring, 4);
    const ignoredEntries = Object.values(selectLanes(ignoring).consumer.tables.customers ?? {});
    expect(ignoredEntries[ignoredEntries.length - 1]).not.toHaveProperty("priority_flag");
  });

  it("catches up backlog and reduces lag to zero when consumer throttle is lifted", () => {
    let state = createInitialState({ maxApplyPerTick: 1 });
    state = reducePlayground(state, { type: "injectBacklog", count: 6 });
    state = runTicks(state, 2);
    let metrics = selectLanes(state).metrics;
    expect(metrics.backlog).toBeGreaterThan(0);

    state = reducePlayground(state, { type: "setMaxApply", maxApplyPerTick: 10 });
    for (let i = 0; i < 20 && selectLanes(state).metrics.backlog > 0; i += 1) {
      state = runTicks(state, 1);
    }
    metrics = selectLanes(state).metrics;
    expect(metrics.backlog).toBe(0);
    expect(metrics.lagMs).toBe(0);
    expect(selectLanes(state).consumer.appliedLog.length).toBeGreaterThanOrEqual(6);
  });

  it("keeps partition ordering stable for the same key", () => {
    let state = createInitialState({ partitions: 3, commitDrift: true });
    state = reducePlayground(state, { type: "insertCustomers", count: 2 });
    const broker = selectLanes(state).broker;
    const partitionsWithCustomer = broker.partitions.filter(queue => queue.some(evt => evt.table === "customers"));
    expect(partitionsWithCustomer.length).toBeGreaterThan(0);
    for (const queue of partitionsWithCustomer) {
      const ids = queue.filter(evt => evt.table === "customers").map(evt => evt.lsn);
      const sorted = [...ids].sort((a, b) => a - b);
      expect(ids).toEqual(sorted);
    }
  });
});
