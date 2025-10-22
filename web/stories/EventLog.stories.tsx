import React from "react";
import { EventLog, type EventLogRow } from "../../src";

const sampleEvents: EventLogRow[] = [
  {
    id: "polling-0",
    methodId: "polling",
    methodLabel: "Polling",
    op: "c",
    offset: 0,
    topic: "cdc.orders",
    table: "orders",
    tsMs: 1742472000000,
    pk: "ORD-1001",
    txnId: "tx-1742472000000",
    after: {
      order_id: "ORD-1001",
      status: "pending",
      subtotal: 184.5,
    },
  },
  {
    id: "trigger-1",
    methodId: "trigger",
    methodLabel: "Trigger",
    op: "u",
    offset: 7,
    topic: "cdc.orders.audit",
    table: "orders",
    tsMs: 1742472060000,
    pk: "ORD-1001",
    txnId: "tx-1742472060000",
    before: {
      order_id: "ORD-1001",
      status: "pending",
    },
    after: {
      order_id: "ORD-1001",
      status: "processing",
    },
  },
  {
    id: "log-2",
    methodId: "log",
    methodLabel: "Log",
    op: "d",
    offset: 12,
    topic: "cdc.orders.wal",
    table: "orders",
    tsMs: 1742472120000,
    pk: "ORD-1003",
    txnId: "tx-1742472120000",
    before: {
      order_id: "ORD-1003",
      status: "cancelled",
    },
  },
];

const baseProps = {
  className: "cdc-event-log",
  events: sampleEvents,
  stats: { produced: 3, consumed: 3, backlog: 0, snapshotRows: 6 },
  totalCount: sampleEvents.length,
  filters: {},
  filterOptions: {
    methods: [
      { id: "polling", label: "Polling" },
      { id: "trigger", label: "Trigger" },
      { id: "log", label: "Log" },
    ],
    ops: ["c", "u", "d"],
    tables: ["orders"],
    txns: sampleEvents.map(event => event.txnId!).filter(Boolean),
  },
  onFiltersChange: () => {},
  onDownload: () => console.info("Download NDJSON"),
  onClear: () => console.info("Clear events"),
  onCopyEvent: (event: EventLogRow) => console.info("Copy", event.id),
  onReplayEvent: (event: EventLogRow) => console.info("Replay", event.id),
};

export const Populated = () => <EventLog {...baseProps} />;

export const Empty = () => (
  <EventLog
    {...baseProps}
    events={[]}
    stats={{ produced: 0, consumed: 0, backlog: 0, snapshotRows: 0 }}
    totalCount={0}
  />
);

export default {
  title: "Comparator/Event Log",
};
