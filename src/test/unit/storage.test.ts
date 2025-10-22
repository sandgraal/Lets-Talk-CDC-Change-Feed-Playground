import { describe, expect, it } from "vitest";
import { InMemoryTableStorage } from "../../domain/storage";
import type { Event, Table } from "../../domain/types";

const makeEvent = (overrides: Partial<Event>): Event => ({
  id: "evt-1",
  kind: "INSERT",
  table: "widgets",
  commitTs: 0,
  schemaVersion: 1,
  topic: "cdc.widgets",
  partition: 0,
  ...overrides,
});

describe("InMemoryTableStorage", () => {
  const baseTable: Table = {
    name: "widgets",
    schema: {
      name: "widgets",
      version: 1,
      columns: [
        { name: "id", type: "string" },
        { name: "status", type: "string" },
      ],
    },
    rows: [
      { id: "w1", status: "seed", __ts: 10 },
    ],
  };

  it("initialises with tables and clones snapshots", () => {
    const storage = new InMemoryTableStorage([baseTable]);
    const table = storage.getTable("widgets");
    expect(table?.rows).toEqual(baseTable.rows);
    expect(table?.schema.columns).toEqual(baseTable.schema.columns);

    const firstRow = table?.rows[0];
    if (!firstRow) throw new Error("missing row");
    firstRow.status = "mutated";
    const again = storage.getTable("widgets");
    expect(again?.rows[0].status).toBe("seed");
  });

  it("applies insert, update, and delete events", () => {
    const storage = new InMemoryTableStorage([baseTable]);

    const insert = makeEvent({
      id: "evt-insert",
      kind: "INSERT",
      commitTs: 20,
      schemaVersion: 1,
      after: { id: "w2", status: "new", flags: { retry: false } },
    });
    storage.applyEvent(insert);

    const update = makeEvent({
      id: "evt-update",
      kind: "UPDATE",
      commitTs: 40,
      schemaVersion: 2,
      after: { id: "w2", status: "ready", priority: true },
    });
    storage.applyEvent(update);

    const drop = makeEvent({
      id: "evt-delete",
      kind: "DELETE",
      commitTs: 60,
      before: { id: "w2" },
    });
    storage.applyEvent(drop);

    const table = storage.getTable("widgets");
    expect(table?.rows.find(row => row.id === "w2")).toBeUndefined();
    expect(table?.schema.version).toBe(2);
    const statusColumn = table?.schema.columns.find(column => column.name === "status");
    expect(statusColumn?.type).toBe("string");
    const priorityColumn = table?.schema.columns.find(column => column.name === "priority");
    expect(priorityColumn?.type).toBe("bool");
  });

  it("creates tables on demand and infers column types", () => {
    const storage = new InMemoryTableStorage();
    storage.applyEvent(
      makeEvent({
        table: "orders",
        id: "evt-orders",
        after: { id: "ord-1", total: 99.5, approved: false, processed_ts: 1200 },
      }),
    );

    const table = storage.getTable("orders");
    expect(table).toBeTruthy();
    expect(table?.schema.columns.find(column => column.name === "total")?.type).toBe("number");
    expect(table?.schema.columns.find(column => column.name === "approved")?.type).toBe("bool");
    expect(table?.schema.columns.find(column => column.name === "processed_ts")?.type).toBe("timestamp");
    expect(table?.rows[0].total).toBe(99.5);
  });

  it("handles schema change events and keeps rows in sync", () => {
    const storage = new InMemoryTableStorage([baseTable]);

    const addEvent: Event = makeEvent({
      id: "evt-schema-add",
      kind: "SCHEMA_ADD_COL",
      schemaVersion: 2,
      schemaChange: {
        action: "ADD_COLUMN",
        column: { name: "priority", type: "bool", nullable: true },
        previousVersion: 1,
        nextVersion: 2,
      },
    });
    storage.applyEvent(addEvent);

    const dropEvent: Event = makeEvent({
      id: "evt-schema-drop",
      kind: "SCHEMA_DROP_COL",
      schemaVersion: 3,
      schemaChange: {
        action: "DROP_COLUMN",
        column: { name: "status", type: "string" },
        previousVersion: 2,
        nextVersion: 3,
      },
    });
    storage.applyEvent(dropEvent);

    const table = storage.getTable("widgets");
    expect(table?.schema.version).toBe(3);
    expect(table?.schema.columns.some(column => column.name === "priority")).toBe(true);
    expect(table?.schema.columns.some(column => column.name === "status")).toBe(false);
    expect(table?.rows[0].priority).toBeNull();
    expect("status" in (table?.rows[0] ?? {})).toBe(false);
  });

  it("returns deep clones from snapshots", () => {
    const storage = new InMemoryTableStorage([baseTable]);
    const snapshot = storage.snapshot();
    expect(snapshot).toHaveLength(1);
    const [table] = snapshot;
    if (!table) throw new Error("missing table");
    table.rows[0].status = "changed";
    table.schema.columns.push({ name: "extra", type: "string" });

    const fresh = storage.getTable("widgets");
    expect(fresh?.rows[0].status).toBe("seed");
    expect(fresh?.schema.columns.some(column => column.name === "extra")).toBe(false);
  });
});
