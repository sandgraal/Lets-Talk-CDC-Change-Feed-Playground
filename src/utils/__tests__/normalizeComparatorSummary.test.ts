import { normalizeComparatorSummary } from "../normalizeComparatorSummary";

describe("normalizeComparatorSummary", () => {
  it("adds labels and values for numeric metrics", () => {
    const summary = { bestLag: 42, triggerWriteAmplification: 1.8 };
    const result = normalizeComparatorSummary(summary, {});
    expect(result.bestLag).toEqual({ label: "42", value: 42 });
    expect(result.triggerWriteAmplification).toEqual({ label: "1.8", value: 1.8 });
  });

  it("uses methodCopy to apply labels/tooltips", () => {
    const summary = { bestLag: "kafka" };
    const map = { kafka: { label: "Kafka Lag", tooltip: "Kafka consumer lag" } };
    const result = normalizeComparatorSummary(summary, map);
    expect(result.bestLag.label).toBe("Kafka Lag");
    expect(result.bestLag.tooltip).toBe("Kafka consumer lag");
  });

  it("normalizes lanes with labels and ids", () => {
    const summary = { lanes: [{ method: "kafka" }, { method: "jdbc" }] };
    const map = { kafka: { label: "Kafka" }, jdbc: { label: "JDBC" } };
    const result = normalizeComparatorSummary(summary, map);
    expect(result.lanes).toEqual([
      { method: "kafka", id: "kafka", label: "Kafka", tooltip: undefined },
      { method: "jdbc", id: "jdbc", label: "JDBC", tooltip: undefined },
    ]);
  });

  it("preserves already normalized fields", () => {
    const summary = { bestLag: { label: "Existing", value: 123 } };
    const result = normalizeComparatorSummary(summary, {});
    expect(result.bestLag).toEqual({ label: "Existing", value: 123 });
  });
});
