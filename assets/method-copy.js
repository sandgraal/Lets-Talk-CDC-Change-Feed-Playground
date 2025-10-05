export const METHOD_COPY = {
  polling: {
    label: "Polling (Query)",
    laneDescription:
      "Simple, but lossy. Periodic scans read current state only; hard deletes and mid-poll updates can disappear.",
    callout:
      "Polling reads current state only. Hard deletes and intermediate updates are not captured.",
    whenToUse:
      "Simple, but lossy. Periodic scans read current state only. Hard deletes and intermediate updates between polls are not observable. Good for small, non-critical syncs where some lag and loss is acceptable."
  },
  trigger: {
    label: "Trigger (Audit)",
    laneDescription:
      "Complete, but intrusive. Database triggers write to an audit table and add synchronous source overhead.",
    callout: "Triggers add write overhead to source transactions.",
    whenToUse:
      "Complete, but intrusive. Triggers capture every change into an audit table, but add write latency and operational overhead on the source. Use when log access isn’t available." 
  },
  log: {
    label: "Log (WAL)",
    laneDescription:
      "Default choice. Streams the transaction log post-commit for ordered, low-latency change events.",
    callout: "Log-based CDC is the preferred default when available.",
    whenToUse:
      "Default choice. Reads the database’s transaction log post-commit. Lowest source impact, complete and ordered changes, near-real-time. Requires connector setup and ops discipline."
  }
};

if (typeof window !== "undefined") {
  window.CDC_METHOD_COPY = METHOD_COPY;
}

export default METHOD_COPY;
