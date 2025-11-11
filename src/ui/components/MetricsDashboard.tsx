import type { FC, ReactNode } from "react";
import { TOOLTIP_COPY } from "../tooltips";
import { describeWriteAmplification, hasMeaningfulWriteAmplification } from "../writeAmplification";

export type MetricsDashboardLane = {
  id: string;
  label: string;
  tooltip?: string;
  produced: number;
  consumed: number;
  backlog: number;
  lagP50: number;
  lagP95: number;
  missedDeletes?: number;
  writeAmplification?: number;
  snapshotRows?: number;
  inserts?: number;
  updates?: number;
  deletes?: number;
  schemaChanges?: number;
};

export type MetricsDashboardProps = {
  lanes: MetricsDashboardLane[];
  renderSchemaWalkthrough?: (laneId: string) => ReactNode;
};

const formatNumber = (value: number) =>
  Number.isFinite(value) ? value.toLocaleString() : "—";

const formatLag = (value: number) =>
  Number.isFinite(value) ? `${Math.round(value)}ms` : "—";

export const MetricsDashboard: FC<MetricsDashboardProps> = ({
  lanes,
  renderSchemaWalkthrough,
}) => {
  const totals = lanes.reduce(
    (acc, lane) => {
      acc.produced += lane.produced;
      acc.consumed += lane.consumed;
      acc.backlog += lane.backlog;
      return acc;
    },
    { produced: 0, consumed: 0, backlog: 0 },
  );

  return (
    <section className="sim-shell__metrics-dashboard" aria-label="Runtime metrics">
      <header className="sim-shell__metrics-dashboard-header">
        <div>
          <h3>Runtime metrics</h3>
          <p>
            Produced {formatNumber(totals.produced)} · Consumed {formatNumber(totals.consumed)} · Backlog {formatNumber(totals.backlog)}
          </p>
        </div>
      </header>
      <div className="sim-shell__metrics-dashboard-grid">
        {lanes.map(lane => (
          <article key={lane.id} className="sim-shell__metrics-dashboard-card">
            <header>
              <h4 data-tooltip={lane.tooltip || undefined}>{lane.label}</h4>
            </header>
            {renderSchemaWalkthrough && (
              <div className="sim-shell__schema-demo-inline">
                {renderSchemaWalkthrough(lane.id)}
              </div>
            )}
            <dl>
              <div>
                <dt>Produced</dt>
                <dd>{formatNumber(lane.produced)}</dd>
              </div>
              <div>
                <dt>Consumed</dt>
                <dd>{formatNumber(lane.consumed)}</dd>
              </div>
              <div>
                <dt>Backlog</dt>
                <dd data-tooltip={TOOLTIP_COPY.backlog}>{formatNumber(lane.backlog)}</dd>
              </div>
              <div>
                <dt>Lag p50</dt>
                <dd data-tooltip={TOOLTIP_COPY.lagPercentile}>{formatLag(lane.lagP50)}</dd>
              </div>
              <div>
                <dt>Lag p95</dt>
                <dd data-tooltip={TOOLTIP_COPY.lagPercentile}>{formatLag(lane.lagP95)}</dd>
              </div>
              {typeof lane.snapshotRows === "number" && (
                <div>
                  <dt>Snapshot rows</dt>
                  <dd data-tooltip={TOOLTIP_COPY.snapshot}>{formatNumber(lane.snapshotRows)}</dd>
                </div>
              )}
              {(typeof lane.inserts === "number" ||
                typeof lane.updates === "number" ||
                typeof lane.deletes === "number") && (
                <div>
                  <dt>Change mix</dt>
                  <dd>
                    C {formatNumber(lane.inserts ?? 0)} · U {formatNumber(lane.updates ?? 0)} · D {formatNumber(lane.deletes ?? 0)}
                    {typeof lane.schemaChanges === "number" && lane.schemaChanges > 0
                      ? ` · Schema ${formatNumber(lane.schemaChanges)}`
                      : ""}
                  </dd>
                </div>
              )}
              {typeof lane.missedDeletes === "number" && (
                <div>
                  <dt>Missed deletes</dt>
                  <dd data-tooltip={TOOLTIP_COPY.deleteCapture}>{formatNumber(lane.missedDeletes)}</dd>
                </div>
              )}
              {hasMeaningfulWriteAmplification(lane.writeAmplification) && (
                <div>
                  <dt>Write amplification</dt>
                  <dd data-tooltip={TOOLTIP_COPY.triggerWriteAmplification}>
                    {describeWriteAmplification(lane.writeAmplification)}
                  </dd>
                </div>
              )}
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
};

export default MetricsDashboard;
