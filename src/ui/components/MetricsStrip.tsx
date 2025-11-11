import type { FC } from "react";
import { TOOLTIP_COPY } from "../tooltips";
import { describeWriteAmplification, hasMeaningfulWriteAmplification } from "../writeAmplification";

export type MetricsStripProps = {
  lagMs: number;
  throughput: number;
  deletesPct: number;
  orderingOk: boolean;
  consistent: boolean;
  writeAmplification?: number;
  insertCount: number;
  updateCount: number;
  deleteCount: number;
  schemaChangeCount: number;
};

export const MetricsStrip: FC<MetricsStripProps> = ({
  lagMs,
  throughput,
  deletesPct,
  orderingOk,
  consistent,
  writeAmplification,
  insertCount,
  updateCount,
  deleteCount,
  schemaChangeCount,
}) => {
  return (
    <div role="status" aria-live="polite">
      <span>Lag: {lagMs}ms</span> ·<span>TPS: {throughput.toFixed(1)}</span> ·
      <span>Deletes: {Math.round(deletesPct)}%</span> ·
      <span>Ordering: {orderingOk ? "OK" : "KO"}</span> ·
      <span>Consistency: {consistent ? "OK" : "Drift"}</span>
      {" "}·<span>
        Ops C/U/D: {insertCount}/{updateCount}/{deleteCount}
      </span>
      {schemaChangeCount > 0 && (
        <>
          {" "}·<span>Schema: {schemaChangeCount}</span>
        </>
      )}
      {hasMeaningfulWriteAmplification(writeAmplification) && (
        <>
          {" "}·
          <span data-tooltip={TOOLTIP_COPY.triggerWriteAmplification}>
            Trigger WA: {describeWriteAmplification(writeAmplification)}
          </span>
        </>
      )}
    </div>
  );
};

export default MetricsStrip;
