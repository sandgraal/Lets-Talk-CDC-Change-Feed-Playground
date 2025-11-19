import { type FC, type ReactNode, useEffect, useMemo, useState } from "react";

export type EventLogRow = {
  id: string;
  methodId?: string | null;
  methodLabel?: string | null;
  op: string;
  offset?: number | null;
  topic?: string | null;
  table?: string | null;
  tsMs?: number | null;
  pk?: string | null;
  txnId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  meta?: ReactNode;
};

export type EventLogStats = {
  produced: number;
  consumed: number;
  backlog: number;
  snapshotRows?: number;
};

export type EventLogFilters = {
  methodId?: string;
  op?: string;
  table?: string;
  txnId?: string;
};

export type EventLogFilterOptions = {
  methods: Array<{ id: string; label: string }>;
  ops: string[];
  tables: string[];
  txns: string[];
};

export type EventLogProps = {
  events: EventLogRow[];
  stats?: EventLogStats;
  totalCount?: number;
  filters?: EventLogFilters;
  filterOptions?: Partial<EventLogFilterOptions>;
  onFiltersChange?: (next: EventLogFilters) => void;
  onDownload?: () => void;
  onClear?: () => void;
  onCopyEvent?: (event: EventLogRow) => void;
  onReplayEvent?: (event: EventLogRow) => void;
  maxVisibleEvents?: number;
  emptyMessage?: string;
  noMatchMessage?: string;
  className?: string;
};

const DEFAULT_MAX_VISIBLE = 2000;
const DEFAULT_FILTER_OPTIONS: EventLogFilterOptions = {
  methods: [],
  ops: [],
  tables: [],
  txns: [],
};

const DEFAULT_STRINGS = {
  empty: "No events yet.",
  noMatch: "No events match the current filters.",
};

type SummaryRow = {
  id: string;
  label: string;
  count: number;
  percent: number;
};

const summarise = <T,>(
  items: readonly T[],
  getId: (item: T) => string,
  getLabel: (item: T) => string,
): SummaryRow[] => {
  const counts = new Map<string, { label: string; count: number }>();
  items.forEach(item => {
    const id = getId(item);
    if (!id) return;
    const label = getLabel(item);
    if (!counts.has(id)) {
      counts.set(id, { label, count: 0 });
    }
    counts.get(id)!.count += 1;
  });

  const total = items.length || 1;
  const rows = Array.from(counts.entries()).map(([id, value]) => ({
    id,
    label: value.label,
    count: value.count,
    percent: Math.round((value.count / total) * 100),
  }));

  rows.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.label.localeCompare(b.label);
  });

  return rows;
};

const formatRowPreview = (row: Record<string, unknown> | null | undefined) => {
  if (!row) return "";
  try {
    const json = JSON.stringify(row);
    if (!json) return "";
    return json.length > 160 ? `${json.slice(0, 160)}…` : json;
  } catch {
    return "";
  }
};

const normaliseOpCode = (op: unknown): string => {
  if (typeof op !== "string") return "";
  const trimmed = op.trim();
  if (!trimmed) return "";
  const lowered = trimmed.toLowerCase();
  if (["c", "create", "insert", "i"].includes(lowered)) return "insert";
  if (["u", "update"].includes(lowered)) return "update";
  if (["d", "delete"].includes(lowered)) return "delete";
  return lowered;
};

const formatOpLabel = (op: unknown): string => {
  const normalised = normaliseOpCode(op);
  if (normalised === "insert" || normalised === "update" || normalised === "delete") {
    return normalised.toUpperCase();
  }
  if (typeof op !== "string") return "—";
  const trimmed = op.trim();
  if (!trimmed) return "—";
  return trimmed.toUpperCase();
};

export const EventLog: FC<EventLogProps> = ({
  events,
  stats,
  totalCount,
  filters = {},
  filterOptions,
  onFiltersChange,
  onDownload,
  onClear,
  onCopyEvent,
  onReplayEvent,
  maxVisibleEvents = DEFAULT_MAX_VISIBLE,
  emptyMessage,
  noMatchMessage,
  className,
}) => {
  const appliedFilterOptions = {
    methods: filterOptions?.methods ?? DEFAULT_FILTER_OPTIONS.methods,
    ops: filterOptions?.ops ?? DEFAULT_FILTER_OPTIONS.ops,
    tables: filterOptions?.tables ?? DEFAULT_FILTER_OPTIONS.tables,
    txns: filterOptions?.txns ?? DEFAULT_FILTER_OPTIONS.txns,
  };

  const baseVisible = useMemo(() => {
    if (typeof maxVisibleEvents !== "number" || maxVisibleEvents <= 0) {
      return events.length;
    }
    return Math.min(maxVisibleEvents, events.length);
  }, [events.length, maxVisibleEvents]);
  const [visibleCount, setVisibleCount] = useState(baseVisible);

  useEffect(() => {
    setVisibleCount(previous => {
      if (previous < baseVisible) {
        return baseVisible;
      }
      if (previous > events.length) {
        return events.length;
      }
      return previous;
    });
  }, [baseVisible, events.length]);

  const visibleEvents = useMemo(() => {
    const count = Math.max(visibleCount, 0);
    const startIndex = Math.max(events.length - count, 0);
    return events.slice(startIndex);
  }, [events, visibleCount]);
  const visibleSummaryLabel = useMemo(() => {
    if (!events.length) return "";
    if (visibleEvents.length === events.length) return `${visibleEvents.length} visible`;
    return `Latest ${visibleEvents.length} of ${events.length}`;
  }, [events.length, visibleEvents.length]);

  const opSummary = useMemo(
    () =>
      summarise(
        visibleEvents,
        row => normaliseOpCode(row.op),
        row => formatOpLabel(row.op),
      ),
    [visibleEvents],
  );
  const methodSummary = useMemo(
    () =>
      summarise(
        visibleEvents,
        row => row.methodId ?? row.methodLabel ?? "",
        row => row.methodLabel || row.methodId || "",
      ),
    [visibleEvents],
  );

  const canLoadMore = visibleEvents.length < events.length;
  const canShowLatest = visibleCount > baseVisible;

  const handleLoadMore = () => {
    if (!canLoadMore) return;
    const batchSize = baseVisible > 0 ? baseVisible : events.length;
    setVisibleCount(previous => Math.min(previous + batchSize, events.length));
  };

  const handleShowLatest = () => {
    setVisibleCount(baseVisible);
  };

  const total = typeof totalCount === "number" ? totalCount : events.length;
  const hasFilters =
    Boolean(filters.methodId) || Boolean(filters.op) || Boolean(filters.table) || Boolean(filters.txnId);
  const strings = {
    empty: emptyMessage ?? DEFAULT_STRINGS.empty,
    noMatch: noMatchMessage ?? DEFAULT_STRINGS.noMatch,
  };

  const handleFilterChange = (partial: Partial<EventLogFilters>) => {
    if (!onFiltersChange) return;
    const merged: EventLogFilters = {
      methodId: partial.methodId === undefined ? filters.methodId : partial.methodId,
      op: partial.op === undefined ? filters.op : partial.op,
      table: partial.table === undefined ? filters.table : partial.table,
      txnId: partial.txnId === undefined ? filters.txnId : partial.txnId,
    };
    const next: EventLogFilters = {
      methodId: merged.methodId || undefined,
      op: merged.op || undefined,
      table: merged.table || undefined,
      txnId: merged.txnId || undefined,
    };
    onFiltersChange(next);
  };

  const renderRowDetails = (row: EventLogRow) => {
    const before = formatRowPreview(row.before);
    const after = formatRowPreview(row.after);
    if (!before && !after) return null;
    return (
      <details className="cdc-event-log__details">
        <summary>Row image</summary>
        {before && (
          <div className="cdc-event-log__details-row">
            <span>before</span>
            <code>{before}</code>
          </div>
        )}
        {after && (
          <div className="cdc-event-log__details-row">
            <span>after</span>
            <code>{after}</code>
          </div>
        )}
      </details>
    );
  };

  return (
    <section
      className={`cdc-event-log${className ? ` ${className}` : ""}`}
      aria-label="Event log"
      role="region"
    >
      <header className="cdc-event-log__header">
        <div className="cdc-event-log__headline">
          <h3>Event Log</h3>
          {stats && (
            <p className="cdc-event-log__stats">
              <span>Produced {stats.produced}</span>
              {" · "}
              <span>Consumed {stats.consumed}</span>
              {" · "}
              <span>Backlog {stats.backlog}</span>
              {typeof stats.snapshotRows === "number" && (
                <>
                  {" · "}
                  <span>Snapshot rows {stats.snapshotRows}</span>
                </>
              )}
            </p>
          )}
        </div>
        <div className="cdc-event-log__actions">
          <span>{events.length} events</span>
          <button type="button" onClick={onDownload} disabled={!onDownload || events.length === 0}>
            Download NDJSON
          </button>
          <button type="button" onClick={onClear} disabled={!onClear || total === 0}>
            Clear
          </button>
        </div>
      </header>

      <div className="cdc-event-log__filters" role="group" aria-label="Event log filters">
        <label>
          <span>Method</span>
          <select
            value={filters.methodId ?? ""}
            onChange={event => handleFilterChange({ methodId: event.target.value || undefined })}
            disabled={!onFiltersChange || appliedFilterOptions.methods.length === 0}
          >
            <option value="">All methods</option>
            {appliedFilterOptions.methods.map(method => (
              <option key={method.id} value={method.id}>
                {method.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Operation</span>
          <select
            value={filters.op ?? ""}
            onChange={event => handleFilterChange({ op: event.target.value || undefined })}
            disabled={!onFiltersChange || appliedFilterOptions.ops.length === 0}
          >
            <option value="">All ops</option>
            {appliedFilterOptions.ops.map(op => (
              <option key={op} value={op}>
                {op.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Table</span>
          <select
            value={filters.table ?? ""}
            onChange={event => handleFilterChange({ table: event.target.value || undefined })}
            disabled={!onFiltersChange || appliedFilterOptions.tables.length === 0}
          >
            <option value="">All tables</option>
            {appliedFilterOptions.tables.map(table => (
              <option key={table} value={table}>
                {table}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Txn</span>
          <select
            value={filters.txnId ?? ""}
            onChange={event => handleFilterChange({ txnId: event.target.value || undefined })}
            disabled={!onFiltersChange || appliedFilterOptions.txns.length === 0}
          >
            <option value="">All txns</option>
            {appliedFilterOptions.txns.map(txn => (
              <option key={txn} value={txn}>
                {txn}
              </option>
            ))}
          </select>
        </label>
      </div>

      {visibleEvents.length > 0 && (
        <div className="cdc-event-log__summary" role="status" aria-live="polite">
          <div className="cdc-event-log__summary-block">
            <div className="cdc-event-log__summary-heading">
              <h4>Change mix</h4>
              {visibleSummaryLabel ? <span>{visibleSummaryLabel}</span> : null}
            </div>
            <div className="cdc-event-log__summary-pills" aria-label="Change operations distribution">
              {opSummary.length > 0 ? (
                opSummary.map(row => (
                  <span key={row.id} className="cdc-event-log__pill">
                    <strong>{row.label}</strong>
                    <span>
                      {row.count} · {row.percent}%
                    </span>
                  </span>
                ))
              ) : (
                <span className="cdc-event-log__pill cdc-event-log__pill--muted">No op codes</span>
              )}
            </div>
          </div>
          <div className="cdc-event-log__summary-block">
            <div className="cdc-event-log__summary-heading">
              <h4>Method mix</h4>
              <span>Visible window</span>
            </div>
            <div className="cdc-event-log__summary-pills" aria-label="Method distribution">
              {methodSummary.length > 0 ? (
                methodSummary.map(row => (
                  <span key={row.id} className="cdc-event-log__pill">
                    <strong>{row.label || "Unknown"}</strong>
                    <span>
                      {row.count} · {row.percent}%
                    </span>
                  </span>
                ))
              ) : (
                <span className="cdc-event-log__pill cdc-event-log__pill--muted">No method labels</span>
              )}
            </div>
          </div>
        </div>
      )}

      {events.length === 0 ? (
        <p className="cdc-event-log__empty">
          {total > 0 || hasFilters ? strings.noMatch : strings.empty}
        </p>
      ) : (
        <ul className="cdc-event-log__list">
          {events.length > visibleEvents.length && (
            <li className="cdc-event-log__notice">
              <span>
                Showing latest {visibleEvents.length} of {events.length} events.
              </span>
              <div className="cdc-event-log__notice-actions">
                <button type="button" onClick={handleLoadMore} disabled={!canLoadMore}>
                  Load more
                </button>
                {canShowLatest && (
                  <button type="button" onClick={handleShowLatest}>
                    Show latest
                  </button>
                )}
              </div>
            </li>
          )}
          {visibleEvents.map(event => {
            const opLabel = formatOpLabel(event.op);
            const normalizedOp = normaliseOpCode(event.op);
            const offset =
              typeof event.offset === "number" ? event.offset : event.offset == null ? "—" : event.offset;
            const topic = event.topic ?? "—";
            const table = event.table ?? "—";
            const pk = event.pk ?? "—";
            const txn = event.txnId ?? "";
            const ts = typeof event.tsMs === "number" ? event.tsMs : "—";
            const replayable =
              normalizedOp === "insert" || normalizedOp === "update" || normalizedOp === "delete";
            return (
              <li key={event.id} className="cdc-event-log__item">
                <span className="cdc-event-log__method">
                  {event.methodLabel ?? event.methodId ?? "—"}
                </span>
                <span className="cdc-event-log__op" data-op={opLabel}>
                  {opLabel}
                </span>
                <span className="cdc-event-log__offset">offset {offset}</span>
                <span className="cdc-event-log__topic">{topic}</span>
                <span className="cdc-event-log__table">table {table}</span>
                <span className="cdc-event-log__meta">
                  ts={ts}ms &middot; pk={pk}
                  {txn ? ` · txn=${txn}` : ""}
                </span>
                {event.meta ? <span className="cdc-event-log__extra">{event.meta}</span> : null}
                {onReplayEvent ? (
                  <button
                    type="button"
                    className="cdc-event-log__replay"
                    onClick={() => onReplayEvent?.(event)}
                    disabled={!replayable}
                  >
                    Replay
                  </button>
                ) : null}
                <button
                  type="button"
                  className="cdc-event-log__copy"
                  onClick={() => onCopyEvent?.(event)}
                  disabled={!onCopyEvent}
                >
                  Copy
                </button>
                {renderRowDetails(event)}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
