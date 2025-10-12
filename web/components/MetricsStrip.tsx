export function MetricsStrip(props: {
  lagMs: number;
  throughput: number;
  deletesPct: number;
  orderingOk: boolean;
  consistent: boolean;
  writeAmplification?: number;
}) {
  return (
    <div role="status" aria-live="polite">
      <span>Lag: {props.lagMs}ms</span> ·
      <span>TPS: {props.throughput.toFixed(1)}</span> ·
      <span>Deletes: {Math.round(props.deletesPct)}%</span> ·
      <span>Ordering: {props.orderingOk ? "OK" : "KO"}</span> ·
      <span>Consistency: {props.consistent ? "OK" : "Drift"}</span>
      {typeof props.writeAmplification === "number" && (
        <>
          {" "}·<span>Trigger WA: {props.writeAmplification.toFixed(1)}x</span>
        </>
      )}
    </div>
  );
}
