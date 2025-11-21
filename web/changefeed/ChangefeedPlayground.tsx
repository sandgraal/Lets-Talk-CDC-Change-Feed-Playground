import { useEffect, useMemo, useReducer, useState } from "react";
import {
  PROJECTED_COLUMNS,
  createInitialState,
  reducePlayground,
  selectLanes,
  type ApplyPolicy,
  type ChangeEvent,
} from "../../src";

const SPEED_OPTIONS = [0.5, 1, 2] as const;
const TICK_BASE_MS = 50;
const EVENT_LOG_LIMIT = 12;

const formatTs = (value: number) => `${value} ms`;

const TypeBadge = ({ type }: { type: ChangeEvent["type"] }) => (
  <span className={`cf-badge cf-badge--${type}`}>{type}</span>
);

const EventCard = ({
  event,
  showPartition = false,
  showAvailability = false,
  tone,
}: {
  event: ChangeEvent;
  showPartition?: boolean;
  showAvailability?: boolean;
  tone?: "muted" | "active";
}) => (
  <div className={`cf-event-card${tone ? ` cf-event-card--${tone}` : ""}`}>
    <div className="cf-event-card__header">
      <TypeBadge type={event.type} />
      <span className="cf-event-card__tx">tx {event.txId}</span>
    </div>
    <dl className="cf-event-card__meta">
      <div>
        <dt>lsn</dt>
        <dd>{event.lsn}</dd>
      </div>
      <div>
        <dt>commit</dt>
        <dd>{formatTs(event.commitTs)}</dd>
      </div>
      <div>
        <dt>index</dt>
        <dd>
          {event.index + 1}/{event.total}
        </dd>
      </div>
      {showPartition ? (
        <div>
          <dt>partition</dt>
          <dd>{event.partition ?? 0}</dd>
        </div>
      ) : null}
      {showAvailability ? (
        <div>
          <dt>available</dt>
          <dd>{formatTs(event.availableAt)}</dd>
        </div>
      ) : null}
    </dl>
    <div className="cf-event-card__body">
      <div className="cf-event-card__table">{event.table}</div>
      <div className="cf-event-card__pk">pk {event.pk}</div>
    </div>
  </div>
);

type PlaygroundViewState = ReturnType<typeof selectLanes> & { clockMs: number };

type TxProgress = {
  txId: string;
  total: number;
  commitTs: number;
  lsn: number;
  stages: Record<"source" | "broker" | "buffered" | "ready" | "applied", number>;
};

const buildTransactionProgress = (state: PlaygroundViewState): TxProgress[] => {
  // Early return if no data to process
  if (
    state.source.log.length === 0 &&
    state.broker.partitions.flat().length === 0 &&
    Object.keys(state.consumer.buffered).length === 0 &&
    state.consumer.ready.length === 0 &&
    state.consumer.appliedLog.length === 0
  ) {
    return [];
  }

  const byTx = new Map<string, TxProgress>();

  const pushEvent = (event: ChangeEvent, stage: keyof TxProgress["stages"]) => {
    const existing = byTx.get(event.txId);
    const base: TxProgress =
      existing ?? {
        txId: event.txId,
        total: event.total,
        commitTs: event.commitTs,
        lsn: event.lsn,
        stages: { source: 0, broker: 0, buffered: 0, ready: 0, applied: 0 },
      };
    base.stages[stage] += 1;
    base.total = Math.max(base.total, event.total);
    base.commitTs = Math.max(base.commitTs, event.commitTs);
    base.lsn = Math.max(base.lsn, event.lsn);
    byTx.set(event.txId, base);
  };

  // Process events in a single pass without creating intermediate arrays
  state.source.log.forEach(evt => pushEvent(evt, "source"));
  
  for (const partition of state.broker.partitions) {
    for (const evt of partition) {
      pushEvent(evt, "broker");
    }
  }
  
  for (const buf of Object.values(state.consumer.buffered)) {
    for (const evt of buf.events) {
      pushEvent(evt, "buffered");
    }
  }
  
  for (const buf of state.consumer.ready) {
    for (const evt of buf.events) {
      pushEvent(evt, "ready");
    }
  }
  
  for (const evt of state.consumer.appliedLog) {
    pushEvent(evt, "applied");
  }
  return Array.from(byTx.values()).sort((a, b) => (a.commitTs === b.commitTs ? a.lsn - b.lsn : a.commitTs - b.commitTs));
};

export function ChangefeedPlayground() {
  const [state, dispatch] = useReducer(reducePlayground, undefined, () => createInitialState());
  const [speed, setSpeed] = useState<(typeof SPEED_OPTIONS)[number]>(1);
  const [isRunning, setIsRunning] = useState(true);

  const viewState: PlaygroundViewState = useMemo(
    () => ({ ...selectLanes(state), clockMs: state.clockMs }),
    [state],
  );

  useEffect(() => {
    if (!isRunning) return undefined;
    const handle = window.setInterval(() => {
      dispatch({ type: "tick", deltaMs: Math.round(TICK_BASE_MS * speed) });
    }, Math.round(TICK_BASE_MS * 2));
    return () => window.clearInterval(handle);
  }, [speed, isRunning]);

  const transactions = useMemo(() => buildTransactionProgress(viewState), [viewState]);

  const handlePolicyChange = (policy: ApplyPolicy) => dispatch({ type: "setApplyPolicy", policy });
  const handleSchemaToggle = (enabled: boolean) => dispatch({ type: "toggleSchemaDrift", enabled });
  const handleProjectToggle = (project: boolean) => dispatch({ type: "setProjectSchemaDrift", project });

  const recentEvents = useMemo(() => viewState.source.log.slice(-EVENT_LOG_LIMIT).reverse(), [viewState.source.log]);

  return (
    <section className="cf-shell" aria-label="Change feed playground">
      <header className="cf-shell__header">
        <div>
          <p className="cf-shell__eyebrow">Change Feed Playground</p>
          <h3 className="cf-shell__title">Source → Change Feed → Consumer</h3>
          <p className="cf-shell__lede">
            Drive inserts, updates, deletes, and multi-table transactions to watch ordering, drift, and apply policies across the
            pipeline.
          </p>
        </div>
        <div className="cf-shell__metrics" role="status" aria-live="polite">
          <div className="cf-metric">
            <span className="cf-metric__label">Lag</span>
            <span className="cf-metric__value">{formatTs(viewState.metrics.lagMs)}</span>
          </div>
          <div className="cf-metric">
            <span className="cf-metric__label">Backlog</span>
            <span className="cf-metric__value">{viewState.metrics.backlog}</span>
          </div>
          <div className="cf-metric">
            <span className="cf-metric__label">Commit drift</span>
            <span className="cf-metric__value">{viewState.options.commitDrift ? "on" : "off"}</span>
          </div>
        </div>
      </header>

      <div className="cf-toolbar" role="group" aria-label="Playground controls">
        <div className="cf-toolbar__row">
          <label className="cf-field">
            <span className="cf-field__label">Speed</span>
            <input
              type="range"
              min={0}
              max={SPEED_OPTIONS.length - 1}
              step={1}
              value={SPEED_OPTIONS.indexOf(speed)}
              onChange={event => setSpeed(SPEED_OPTIONS[Number(event.target.value)] ?? 1)}
            />
            <span className="cf-field__value">{speed}x</span>
          </label>
          <label className="cf-field">
            <span className="cf-field__label">Apply policy</span>
            <select value={viewState.options.applyPolicy} onChange={event => handlePolicyChange(event.target.value as ApplyPolicy)}>
              <option value="apply-on-commit">Apply on commit</option>
              <option value="apply-as-polled">Apply as polled</option>
            </select>
          </label>
          <label className="cf-field cf-field--toggle">
            <input
              type="checkbox"
              checked={viewState.options.commitDrift}
              onChange={event => dispatch({ type: "toggleCommitDrift", enabled: event.target.checked })}
            />
            <span>Commit drift</span>
          </label>
          <label className="cf-field cf-field--toggle">
            <input
              type="checkbox"
              checked={viewState.options.schemaDrift}
              onChange={event => handleSchemaToggle(event.target.checked)}
            />
            <span>Schema drift</span>
          </label>
          <label className="cf-field cf-field--toggle">
            <input
              type="checkbox"
              checked={viewState.options.projectSchemaDrift}
              onChange={event => handleProjectToggle(event.target.checked)}
            />
            <span>Project drifted column</span>
          </label>
          <label className="cf-field">
            <span className="cf-field__label">Faults (drop %)</span>
            <input
              type="range"
              min={0}
              max={0.4}
              step={0.05}
              value={viewState.options.dropProbability}
              onChange={event => dispatch({ type: "setDropProbability", probability: Number(event.target.value) })}
              aria-valuetext={`${Math.round(viewState.options.dropProbability * 100)}%`}
            />
            <span className="cf-field__value">{Math.round(viewState.options.dropProbability * 100)}%</span>
          </label>
          <div className="cf-toolbar__actions">
            <button type="button" onClick={() => setIsRunning(prev => !prev)}>{isRunning ? "Pause" : "Resume"}</button>
            <button type="button" onClick={() => dispatch({ type: "reset" })}>Reset &amp; Seed</button>
          </div>
        </div>
        <div className="cf-toolbar__row">
          <div className="cf-toolbar__actions">
            <button type="button" onClick={() => dispatch({ type: "insertCustomers", count: 1 })}>
              Insert customers
            </button>
            <button type="button" onClick={() => dispatch({ type: "placeOrder", items: 2 })}>Place order</button>
            <button type="button" onClick={() => dispatch({ type: "updateCustomer" })}>Update customer</button>
            <button type="button" onClick={() => dispatch({ type: "deleteCustomer" })}>Delete customer</button>
            <button type="button" onClick={() => dispatch({ type: "injectBacklog", count: 8 })}>Inject backlog</button>
            <button type="button" onClick={() => dispatch({ type: "setMaxApply", maxApplyPerTick: 1 })}>Throttle</button>
            <button type="button" onClick={() => dispatch({ type: "setMaxApply", maxApplyPerTick: 12 })}>Catch up</button>
          </div>
        </div>
      </div>

      <div className="cf-lanes" role="group" aria-label="Change feed lanes">
        <div className="cf-lane">
          <header className="cf-lane__header">
            <div>
              <p className="cf-lane__eyebrow">Source</p>
              <h4 className="cf-lane__title">Rows &amp; captured events</h4>
            </div>
            <div className="cf-lane__meta">
              <span>{viewState.source.rows.length} rows</span>
              <span>{viewState.source.log.length} events</span>
            </div>
          </header>
          <div className="cf-lane__body">
            <div className="cf-grid cf-grid--rows">
              {PROJECTED_COLUMNS.map(column => (
                <span key={column} className="cf-chip">
                  {column}
                </span>
              ))}
            </div>
            <div className="cf-table">
              <div className="cf-table__header">Latest rows</div>
              <div className="cf-table__body">
                {viewState.source.rows.slice(-5).map(row => (
                  <div key={`${row.table}-${row.id}`} className="cf-table__row">
                    <span className="cf-table__cell">{row.table}</span>
                    <span className="cf-table__cell">{row.id}</span>
                    <span className="cf-table__cell">{JSON.stringify(row.data)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="cf-event-stack" aria-label="Source log">
              {recentEvents.map(evt => (
                <EventCard key={`source-${evt.lsn}`} event={evt} />
              ))}
            </div>
          </div>
        </div>

        <div className="cf-lane">
          <header className="cf-lane__header">
            <div>
              <p className="cf-lane__eyebrow">Change feed</p>
              <h4 className="cf-lane__title">Broker partitions</h4>
            </div>
            <div className="cf-lane__meta">
              <span>{viewState.broker.partitions.length} partitions</span>
              <span>{viewState.broker.partitions.reduce((acc, q) => acc + q.length, 0)} buffered</span>
            </div>
          </header>
          <div className="cf-lane__body">
            <div className="cf-partitions">
              {viewState.broker.partitions.map((queue, idx) => (
                <div key={`partition-${idx}`} className="cf-partition">
                  <div className="cf-partition__header">Partition {idx}</div>
                  <div className="cf-partition__queue">
                    {queue.length === 0 ? <p className="cf-empty">idle</p> : null}
                    {queue.map(evt => (
                      <EventCard key={`broker-${evt.lsn}`} event={evt} showPartition showAvailability tone="muted" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="cf-lane">
          <header className="cf-lane__header">
            <div>
              <p className="cf-lane__eyebrow">Consumer</p>
              <h4 className="cf-lane__title">Buffered vs applied</h4>
            </div>
            <div className="cf-lane__meta">
              <span>{viewState.consumer.appliedLog.length} applied</span>
              <span>{Object.keys(viewState.consumer.tables).length} tables</span>
            </div>
          </header>
          <div className="cf-lane__body">
            <div className="cf-buffered">
              <div>
                <p className="cf-subtitle">Buffered</p>
                <div className="cf-event-stack">
                  {Object.values(viewState.consumer.buffered).map(buf =>
                    buf.events.map(evt => <EventCard key={`buffered-${evt.lsn}`} event={evt} tone="muted" />),
                  )}
                  {viewState.consumer.ready.flatMap(tx => tx.events).length === 0 &&
                  Object.values(viewState.consumer.buffered).flatMap(buf => buf.events).length === 0 ? (
                    <p className="cf-empty">No buffered events</p>
                  ) : null}
                </div>
              </div>
              <div>
                <p className="cf-subtitle">Applied</p>
                <div className="cf-event-stack">
                  {viewState.consumer.appliedLog.slice(-EVENT_LOG_LIMIT).map(evt => (
                    <EventCard key={`applied-${evt.lsn}`} event={evt} tone="active" />
                  ))}
                </div>
              </div>
            </div>
            <div className="cf-table">
              <div className="cf-table__header">Consumer tables</div>
              <div className="cf-table__body">
                {Object.entries(viewState.consumer.tables).map(([table, rows]) => (
                  <div key={table} className="cf-table__row cf-table__row--nested">
                    <span className="cf-table__cell">{table}</span>
                    <span className="cf-table__cell cf-table__cell--muted">{Object.keys(rows).length} rows</span>
                    <div className="cf-table__nested">
                      {Object.values(rows)
                        .slice(-4)
                        .map(row => (
                          <div key={row.id ?? JSON.stringify(row)} className="cf-table__nested-row">
                            <span>{row.id ?? "row"}</span>
                            <span className="cf-table__cell--muted">{JSON.stringify(row)}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="cf-transactions" aria-label="Transaction atomicity">
        <header className="cf-transactions__header">
          <div>
            <p className="cf-lane__eyebrow">Transactions</p>
            <h4 className="cf-lane__title">Atomicity across lanes</h4>
            <p className="cf-transactions__hint">
              Each bracket shows how many events from a transaction are visible in the source log, broker partitions, buffered
              pool, and applied tables.
            </p>
          </div>
          <span className="cf-clock">Clock {formatTs(viewState.clockMs)}</span>
        </header>
        <div className="cf-transaction-list">
          {transactions.length === 0 ? <p className="cf-empty">Run an operation to see transactions</p> : null}
          {transactions.map(tx => {
            const completion = Math.min(1, tx.stages.applied / tx.total);
            const buffered = tx.stages.buffered + tx.stages.ready;
            return (
              <div key={tx.txId} className="cf-transaction">
                <div className="cf-transaction__meta">
                  <span className="cf-transaction__tx">tx {tx.txId}</span>
                  <span className="cf-transaction__commit">commit {formatTs(tx.commitTs)}</span>
                  <span className="cf-transaction__total">{tx.total} events</span>
                </div>
                <div className="cf-transaction__stages" role="list">
                  <div className="cf-transaction__stage" role="listitem">
                    <span className="cf-stage__label">source</span>
                    <span className="cf-stage__value">{tx.stages.source}</span>
                  </div>
                  <div className="cf-transaction__stage" role="listitem">
                    <span className="cf-stage__label">broker</span>
                    <span className="cf-stage__value">{tx.stages.broker}</span>
                  </div>
                  <div className="cf-transaction__stage" role="listitem">
                    <span className="cf-stage__label">buffered</span>
                    <span className="cf-stage__value">{buffered}</span>
                  </div>
                  <div className="cf-transaction__stage" role="listitem">
                    <span className="cf-stage__label">applied</span>
                    <span className="cf-stage__value">{tx.stages.applied}</span>
                  </div>
                </div>
                <div className="cf-transaction__progress">
                  <span
                    className="cf-progress"
                    role="progressbar"
                    aria-label="Applied progress"
                    aria-valuenow={tx.stages.applied}
                    aria-valuemin={0}
                    aria-valuemax={tx.total}
                    style={{ width: `${completion * 100}%` }}
                  />
                  <span
                    className="cf-progress cf-progress--buffered"
                    role="progressbar"
                    aria-label="Buffered progress"
                    aria-valuenow={buffered}
                    aria-valuemin={0}
                    aria-valuemax={tx.total}
                    style={{ width: `${Math.min(1, buffered / tx.total) * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </section>
  );
}
