import type { FC, ReactNode } from "react";

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
};

export type EventLogFilters = {
  methodId?: string;
  table?: string;
  txnId?: string;
};

export type EventLogFilterOptions = {
  methods: Array<{ id: string; label: string }>;
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
  maxVisibleEvents?: number;
  emptyMessage?: string;
  noMatchMessage?: string;
  className?: string;
};

const DEFAULT_MAX_VISIBLE = 2000;
const DEFAULT_FILTER_OPTIONS: EventLogFilterOptions = {
  methods: [],
  tables: [],
  txns: [],
};

const DEFAULT_STRINGS = {
  empty: "No events yet.",
  noMatch: "No events match the current filters.",
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

const coerceOp = (op: string) => {
  if (!op) return "—";
  const trimmed = op.trim();
  if (!trimmed) return "—";
  return trimmed.length === 1 ? trimmed.toUpperCase() : trimmed.toUpperCase();
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
  maxVisibleEvents = DEFAULT_MAX_VISIBLE,
  emptyMessage,
  noMatchMessage,
  className,
}) => {
  const appliedFilterOptions = {
    methods: filterOptions?.methods ?? DEFAULT_FILTER_OPTIONS.methods,
    tables: filterOptions?.tables ?? DEFAULT_FILTER_OPTIONS.tables,
    txns: filterOptions?.txns ?? DEFAULT_FILTER_OPTIONS.txns,
  };

  const limitedEvents =
    typeof maxVisibleEvents === "number" && maxVisibleEvents > 0
      ? events.slice(Math.max(events.length - maxVisibleEvents, 0))
      : events;

  const total = typeof totalCount === "number" ? totalCount : events.length;
  const hasFilters =
    Boolean(filters.methodId) || Boolean(filters.table) || Boolean(filters.txnId);
  const strings = {
    empty: emptyMessage ?? DEFAULT_STRINGS.empty,
    noMatch: noMatchMessage ?? DEFAULT_STRINGS.noMatch,
  };

  const handleFilterChange = (partial: Partial<EventLogFilters>) => {
    if (!onFiltersChange) return;
    const merged: EventLogFilters = {
      methodId: partial.methodId === undefined ? filters.methodId : partial.methodId,
      table: partial.table === undefined ? filters.table : partial.table,
      txnId: partial.txnId === undefined ? filters.txnId : partial.txnId,
    };
    const next: EventLogFilters = {
      methodId: merged.methodId || undefined,
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
              Produced {stats.produced} &middot; Consumed {stats.consumed} &middot; Backlog {stats.backlog}
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

      {events.length === 0 ? (
        <p className="cdc-event-log__empty">
          {total > 0 || hasFilters ? strings.noMatch : strings.empty}
        </p>
      ) : (
        <ul className="cdc-event-log__list">
          {events.length > limitedEvents.length && (
            <li className="cdc-event-log__notice">
              Showing latest {limitedEvents.length} of {events.length} events.
            </li>
          )}
          {limitedEvents.map(event => {
            const op = coerceOp(event.op);
            const offset =
              typeof event.offset === "number" ? event.offset : event.offset == null ? "—" : event.offset;
            const topic = event.topic ?? "—";
            const table = event.table ?? "—";
            const pk = event.pk ?? "—";
            const txn = event.txnId ?? "";
            const ts = typeof event.tsMs === "number" ? event.tsMs : "—";
            return (
              <li key={event.id} className="cdc-event-log__item">
                <span className="cdc-event-log__method">
                  {event.methodLabel ?? event.methodId ?? "—"}
                </span>
                <span className="cdc-event-log__op" data-op={op}>
                  {op}
                </span>
                <span className="cdc-event-log__offset">offset {offset}</span>
                <span className="cdc-event-log__topic">{topic}</span>
                <span className="cdc-event-log__table">table {table}</span>
                <span className="cdc-event-log__meta">
                  ts={ts}ms &middot; pk={pk}
                  {txn ? ` · txn=${txn}` : ""}
                </span>
                {event.meta ? <span className="cdc-event-log__extra">{event.meta}</span> : null}
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
