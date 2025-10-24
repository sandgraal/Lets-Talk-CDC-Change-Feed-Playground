import { describe, expect, it } from "vitest";
import {
  createGeneratorOp,
  createGeneratorStateFromScenario,
  type GeneratorScenario,
} from "../../ui/generator";

const buildScenario = (override: Partial<GeneratorScenario> = {}): GeneratorScenario => ({
  table: "orders",
  schema: [
    { name: "order_id", type: "string", pk: true },
    { name: "status", type: "string" },
    { name: "amount", type: "number" },
  ],
  rows: [
    { order_id: "42", status: "NEW", amount: 100 },
    { order_id: 7, status: "PROCESSING", amount: 75 },
  ],
  ops: [
    {
      t: 120,
      op: "insert",
      table: "orders",
      pk: { id: "42" },
      after: { order_id: "42", status: "NEW", amount: 100 },
    },
  ],
  ...override,
});

describe("createGeneratorStateFromScenario", () => {
  it("clones rows and derives metadata", () => {
    const scenario = buildScenario();
    const state = createGeneratorStateFromScenario(scenario);

    expect(state.table).toBe("orders");
    expect(state.pkField).toBe("order_id");
    expect(state.logicalTime).toBe(120);
    expect(state.rows.size).toBe(2);
    expect(state.seq).toBe(3);

    const firstRow = state.rows.get("42");
    expect(firstRow).toMatchObject({ order_id: "42", status: "NEW", amount: 100 });

    // Mutating the source scenario should not affect the generator state.
    scenario.rows?.[0] && ((scenario.rows[0] as Record<string, unknown>).status = "UPDATED");
    expect(state.rows.get("42")?.status).toBe("NEW");
  });

  it("falls back to the default table name when unspecified", () => {
    const state = createGeneratorStateFromScenario(buildScenario({ table: undefined, ops: [] }));
    expect(state.table).toBe("workspace");
  });
});

describe("createGeneratorOp", () => {
  it("cycles through insert, update, and delete operations", () => {
    const state = createGeneratorStateFromScenario(
      buildScenario({
        rows: [{ order_id: "base", status: "BASE", amount: 0 }],
        ops: [],
      }),
    );

    const events = [] as Array<ReturnType<typeof createGeneratorOp>>;
    for (let i = 0; i < 5; i += 1) {
      events.push(createGeneratorOp(state, 50, 0));
    }

    const kinds = events.map(result => result?.kind);
    expect(kinds).toEqual(["insert", "update", "update", "update", "delete"]);

    const insert = events[0];
    expect(insert?.op.op).toBe("insert");
    expect(insert?.op.after).toBeDefined();
    expect(insert?.op.after).not.toHaveProperty("order_id");

    const update = events[1];
    expect(update?.op.op).toBe("update");
    const updateKeys = update?.op.after ? Object.keys(update.op.after) : [];
    expect(updateKeys.length).toBe(1);
    expect(updateKeys[0]).not.toBe("order_id");

    const deleteOp = events[4];
    expect(deleteOp?.op.op).toBe("delete");

    const timestamps = events
      .filter((result): result is NonNullable<typeof result> => Boolean(result))
      .map(result => result.op.t);
    const sorted = [...timestamps].sort((a, b) => a - b);
    expect(timestamps).toEqual(sorted);
  });
});
