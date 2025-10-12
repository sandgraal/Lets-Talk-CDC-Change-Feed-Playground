import type { FC } from "react";

export type MetricsDashboardLane = {
  id: string;
  label: string;
  produced: number;
  consumed: number;
  backlog: number;
  lagP50: number;
  lagP95: number;
  missedDeletes?: number;
  writeAmplification?: number;
};

export type MetricsDashboardProps = {
  lanes: MetricsDashboardLane[];
  renderSchemaWalkthrough?: (laneId: string) => React.ReactNode;
};
const formatNumber = (value: number) =>
  Number.isFinite(value) ? value.toLocaleString() : "—";

const formatLag = (value: number) =>
  Number.isFinite(value) ? `${Math.round(value)}ms` : "—";

export const MetricsDashboard: FC<MetricsDashboardProps> = ({ lanes, renderSchemaWalkthrough }) => {
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
          <p>Produced {formatNumber(totals.produced)} · Consumed {formatNumber(totals.consumed)} · Backlog {formatNumber(totals.backlog)}</p>
        </div>
      </header>
      <div className="sim-shell__metrics-dashboard-grid">
        {lanes.map(lane => (
          <article key={lane.id} className="sim-shell__metrics-dashboard-card">
            <header>
              <h4>{lane.label}</h4>
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
                <dd>{formatNumber(lane.backlog)}</dd>
              </div>
              <div>
                <dt>Lag p50</dt>
                <dd>{formatLag(lane.lagP50)}</dd>
              </div>
              <div>
                <dt>Lag p95</dt>
                <dd>{formatLag(lane.lagP95)}</dd>
              </div>
              {typeof lane.missedDeletes === "number" && (
                <div>
                  <dt>Missed deletes</dt>
                  <dd>{formatNumber(lane.missedDeletes)}</dd>
                </div>
              )}
              {typeof lane.writeAmplification === "number" && (
                <div>
                  <dt>Write amplification</dt>
                  <dd>{lane.writeAmplification.toFixed(1)}x</dd>
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
