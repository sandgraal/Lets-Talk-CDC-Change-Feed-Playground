import { describe, expect, it } from "vitest";
import type { EventLogRow } from "../../ui/components/EventLog";
import {
  eventLogRowToExportItem,
  mapEventsToExportRecords,
  serializeEventLogNdjson,
  type EventLogExportItem,
} from "../../ui/eventLogExport";

describe("eventLogExport", () => {
  it("serialises combined events into NDJSON with transaction metadata", () => {
    const items: EventLogExportItem[] = [
      {
        method: "polling",
        event: {
          offset: 12,
          seq: "34",
          ts_ms: 1_697_000,
          op: "c",
          table: "orders",
          pk: { id: "ord-1" },
          before: null,
          after: { id: "ord-1", status: "new" },
          topic: "cdc.orders",
          tx: { id: "tx-1", index: 0, total: 2, last: false },
          schemaChange: { action: "ADD_COLUMN", column: { name: "status", type: "string" } },
        },
      },
    ];

    const ndjson = serializeEventLogNdjson(items);
    expect(ndjson).toBeTypeOf("string");
    const lines = ndjson.split("\n");
    expect(lines).toHaveLength(1);
    const payload = JSON.parse(lines[0]);
    expect(payload).toEqual({
      method: "polling",
      offset: 12,
      seq: 34,
      ts_ms: 1_697_000,
      op: "c",
      table: "orders",
      pk: { id: "ord-1" },
      before: null,
      after: { id: "ord-1", status: "new" },
      topic: "cdc.orders",
      txn_id: "tx-1",
      txn_index: 0,
      txn_total: 2,
      txn_last: false,
      schema_change: { action: "ADD_COLUMN", column: { name: "status", type: "string" } },
    });
  });

  it("normalises fallbacks for timestamps, pk, and method", () => {
    const records = mapEventsToExportRecords([
      {
        method: "log",
        event: { seq: "5", tsMs: "1234", pk: "abc", topic: "cdc.widgets" },
      },
      {
        method: undefined,
        event: null,
      },
    ]);

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      method: "log",
      seq: 5,
      ts_ms: 1234,
      pk: { id: "abc" },
      topic: "cdc.widgets",
    });
    expect(records[1]).toEqual({
      method: null,
      offset: null,
      seq: null,
      ts_ms: null,
      op: null,
      table: null,
      pk: null,
      before: null,
      after: null,
      topic: null,
      txn_id: null,
      txn_index: null,
      txn_total: null,
      txn_last: null,
      schema_change: null,
    });
  });

  it("converts EventLogRow entries into export items", () => {
    const row: EventLogRow = {
      id: "row-1",
      methodId: "polling",
      methodLabel: "Polling",
      op: "c",
      offset: 4,
      topic: "cdc.orders",
      table: "orders",
      tsMs: 42,
      pk: "ord-9",
      txnId: "txn-9",
      before: null,
      after: { id: "ord-9", status: "ready" },
    };

    const ndjson = serializeEventLogNdjson([eventLogRowToExportItem(row)]);
    const record = JSON.parse(ndjson);
    expect(record).toEqual({
      method: "polling",
      offset: 4,
      seq: null,
      ts_ms: 42,
      op: "c",
      table: "orders",
      pk: { id: "ord-9" },
      before: null,
      after: { id: "ord-9", status: "ready" },
      topic: "cdc.orders",
      txn_id: "txn-9",
      txn_index: null,
      txn_total: null,
      txn_last: null,
      schema_change: null,
    });
  });
});

