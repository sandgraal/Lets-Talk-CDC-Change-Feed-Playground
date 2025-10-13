export const TOOLTIP_COPY = {
  pollingInterval: "Lower intervals reduce lag but increase read pressure on the source.",
  pollingSoftDeletes: "Surface soft-delete markers so downstream consumers can emit tombstones.",
  triggerExtractorInterval: "Stretching the extractor interval reduces read load but adds latency before events land.",
  triggerOverhead: "Injected synchronous time per write while the trigger captures change rows.",
  triggerWriteAmplification: "Audit-table writes compared to source operations; >1x means extra storage + IO.",
  logFetchInterval: "Shorter fetch intervals decrease lag but require more connector and network throughput.",
  backlog: "Events queued on the bus waiting for apply to catch up.",
  lagPercentile: "Latency from commit to apply; percentiles show typical versus tail delay.",
  lagSpread: "Difference between the fastest and slowest lane latency.",
  deleteCapture: "Percent of deletes the lane surfaced versus what the scenario generated.",
  offset: "Monotonic bookmark for bus position so consumers can resume without replaying events.",
  tombstone: "A delete marker event that instructs downstream systems to remove a row.",
  snapshot: "Initial bulk copy exported before switching to streaming changes.",
  transactionLog: "Ordered record of committed operations; log-based CDC tails this stream.",
};

if (typeof window !== "undefined") {
  window.CDC_TOOLTIP_COPY = TOOLTIP_COPY;
}

export default TOOLTIP_COPY;
