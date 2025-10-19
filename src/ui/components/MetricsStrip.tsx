import type { FC } from "react";

export type MetricsStripProps = {
  lagMs: number;
  throughput: number;
  deletesPct: number;
  orderingOk: boolean;
  consistent: boolean;
  writeAmplification?: number;
};

export const MetricsStrip: FC<MetricsStripProps> = ({
  lagMs,
  throughput,
  deletesPct,
  orderingOk,
  consistent,
  writeAmplification,
}) => {
  return (
    <div role="status" aria-live="polite">
      <span>Lag: {lagMs}ms</span> ·<span>TPS: {throughput.toFixed(1)}</span> ·
      <span>Deletes: {Math.round(deletesPct)}%</span> ·
      <span>Ordering: {orderingOk ? "OK" : "KO"}</span> ·
      <span>Consistency: {consistent ? "OK" : "Drift"}</span>
      {typeof writeAmplification === "number" && (
        <>
          {" "}·<span>Trigger WA: {writeAmplification.toFixed(1)}x</span>
        </>
      )}
    </div>
  );
};

export default MetricsStrip;
