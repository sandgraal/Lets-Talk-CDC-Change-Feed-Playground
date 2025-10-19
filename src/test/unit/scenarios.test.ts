import { describe, expect, it } from "vitest";
import { SCENARIO_TEMPLATES } from "../../features/scenarios";
import { SCENARIOS as COMPARATOR_SCENARIOS } from "../../../web/scenarios";
import sharedScenarios, { type SharedScenario } from "../../features/shared-scenarios";
import { normaliseSharedScenario } from "../../features/shared-scenario-normaliser";

const EXPECTED_SCENARIOS = [
  {
    id: "crud-basic",
    name: "CRUD Basic",
    description: "Teaching delete visibility basics.",
    highlight: "Minimal ops for first-time comparator demos.",
    tags: ["crud", "basics"],
  },
  {
    id: "omnichannel-orders",
    name: "Omnichannel Orders",
    description: "Walking through status transitions and fulfilment edge cases.",
    highlight: "Mix of inserts/updates with delete coverage; great for lag comparisons.",
    tags: ["orders", "lag", "fulfilment"],
  },
  {
    id: "real-time-payments",
    name: "Real-time Payments",
    description: "Demonstrating idempotent updates or risk review flows.",
    highlight: "Trigger overhead tuning + delete capture expectations.",
    tags: ["payments", "risk", "latency"],
  },
  {
    id: "iot-telemetry",
    name: "IoT Telemetry",
    description: "Showing rolling measurements with anomaly flags.",
    highlight: "Highlights soft-delete vs. log consistency and clock controls.",
    tags: ["iot", "telemetry", "anomaly"],
  },
  {
    id: "schema-evolution",
    name: "Schema Evolution",
    description: "Demonstrating column additions while capturing changes.",
    highlight: "Compare immediate log/trigger propagation with polling lag.",
    tags: ["schema", "backfill"],
    schemaVersion: 2,
  },
  {
    id: "orders-items-transactions",
    name: "Orders + Items Transactions",
    description: "Teaching multi-table commit semantics.",
    highlight: "Toggle apply-on-commit to keep orders/items destinations consistent.",
    tags: ["transactions", "orders"],
  },
  {
    id: "burst-updates",
    name: "Burst Updates",
    description: "Stressing lag/ordering behaviour under rapid updates.",
    highlight: "Highlights polling gaps and diff overlays.",
    tags: ["lag", "polling"],
  },
];

describe("Scenario templates", () => {
  it("exposes curated scenarios aligned with the README matrix", () => {
    const ids = SCENARIO_TEMPLATES.map(template => template.id).sort();
    const expectedIds = EXPECTED_SCENARIOS.map(scenario => scenario.id).sort();
    expect(ids).toEqual(expectedIds);
  });

  it("keeps scenario metadata aligned with the README matrix", () => {
    const templatesById = new Map(
      SCENARIO_TEMPLATES.map(template => [template.id, template]),
    );

    EXPECTED_SCENARIOS.forEach(expected => {
      const template = templatesById.get(expected.id);
      expect(template).toBeTruthy();
      expect(template?.name).toBe(expected.name);
      expect(template?.description).toBe(expected.description);
      expect(template?.highlight).toBe(expected.highlight);
      expect(template?.tags).toEqual(expected.tags);
      if (expected.schemaVersion) {
        expect(template?.schemaVersion).toBe(expected.schemaVersion);
      }
    });
  });

  it("exposes scenario tags for template filtering", () => {
    SCENARIO_TEMPLATES.forEach(template => {
      expect(Array.isArray(template.tags)).toBe(true);
      expect(template.tags?.length).toBeGreaterThan(0);
      template.tags?.forEach(tag => {
        expect(typeof tag).toBe("string");
        expect(tag).not.toHaveLength(0);
      });
    });
  });

  it("provides concrete operations for each scenario", () => {
    SCENARIO_TEMPLATES.forEach(template => {
      expect(Array.isArray(template.ops)).toBe(true);
      expect(template.ops.length).toBeGreaterThan(0);
      template.ops.forEach(op => {
        expect(op.table).toBeTruthy();
        expect(op.pk?.id).toBeTruthy();
        if (op.op !== "delete") {
          expect(op.after).toBeTruthy();
        }
      });
    });
  });

  it("provides snapshot rows and schema for previews", () => {
    SCENARIO_TEMPLATES.forEach(template => {
      expect(Array.isArray(template.rows)).toBe(true);
      expect(template.rows.length).toBeGreaterThan(0);
      template.rows.forEach(row => {
        expect(row).toBeTruthy();
        expect(typeof row).toBe("object");
      });

      expect(Array.isArray(template.schema)).toBe(true);
      expect(template.schema.length).toBeGreaterThan(0);
      template.schema.forEach(column => {
        expect(column.name).toBeTruthy();
        expect(typeof column.name).toBe("string");
        expect(typeof column.type).toBe("string");
        expect(typeof column.pk).toBe("boolean");
      });
    });
  });

  it("captures delete expectations for the payments scenario", () => {
    const payments = SCENARIO_TEMPLATES.find(template => template.id === "real-time-payments");
    expect(payments).toBeTruthy();
    expect(payments?.ops.some(op => op.op === "delete")).toBe(true);
  });

  it("stays aligned with the shared scenario catalogue", () => {
    const eligibleShared = sharedScenarios.filter(
      scenario =>
        (Array.isArray(scenario.ops) && scenario.ops.length > 0) ||
        (Array.isArray(scenario.events) && scenario.events.length > 0),
    );
    expect(eligibleShared.length).toBe(SCENARIO_TEMPLATES.length);

    const sharedById = new Map(eligibleShared.map(scenario => [scenario.id, scenario]));
    SCENARIO_TEMPLATES.forEach(template => {
      const shared = sharedById.get(template.id);
      expect(shared).toBeTruthy();
      expect(shared?.label ?? shared?.name).toBe(template.label);
      expect(shared?.description).toBe(template.description);
      expect(shared?.highlight).toBe(template.highlight);
      expect(shared?.tags).toEqual(template.tags);
      expect(shared?.table ?? undefined).toBe(template.table ?? undefined);
      expect(shared?.rows?.length ?? 0).toBe(template.rows.length);
      if (Array.isArray(shared?.rows)) {
        expect(shared?.rows).not.toBe(template.rows);
      }
      expect(shared?.schema?.length ?? 0).toBe(template.schema.length);
      if (Array.isArray(shared?.schema)) {
        expect(shared?.schema).not.toBe(template.schema);
      }
      expect(shared?.events?.length ?? 0).toBe(template.events.length);
      if (Array.isArray(shared?.events)) {
        expect(shared?.events).not.toBe(template.events);
      }
      const sharedOps = Array.isArray(shared?.ops) ? shared?.ops : undefined;
      if (sharedOps) {
        expect(sharedOps.length).toBe(template.ops.length);
        expect(sharedOps).not.toBe(template.ops);
      } else {
        expect(Array.isArray(shared?.events) && shared.events.length > 0).toBe(true);
      }
      expect(shared?.schemaVersion ?? undefined).toBe(template.schemaVersion ?? undefined);
    });
  });
});

describe("Comparator scenarios", () => {
  it("mirrors curated scenario coverage", () => {
    const ids = COMPARATOR_SCENARIOS.map(scenario => scenario.id).sort();
    const expected = SCENARIO_TEMPLATES.map(template => template.id).sort();
    expect(ids).toEqual(expected);
  });

  it("retains metadata and preview payloads", () => {
    const templatesById = new Map(SCENARIO_TEMPLATES.map(template => [template.id, template]));
    COMPARATOR_SCENARIOS.forEach(scenario => {
      const template = templatesById.get(scenario.id);
      expect(template).toBeTruthy();
      expect(scenario.label).toBe(template?.label);
      expect(scenario.description).toBe(template?.description);
      expect(scenario.highlight).toBe(template?.highlight);
      expect(scenario.tags).toEqual(template?.tags ?? []);
      expect(scenario.table ?? undefined).toBe(template?.table ?? undefined);
      expect(scenario.schemaVersion ?? undefined).toBe(template?.schemaVersion ?? undefined);
      expect(scenario.seed).toBe(template?.seed);

      expect(scenario.schema?.length ?? 0).toBe(template?.schema.length ?? 0);
      if (scenario.schema && template?.schema) {
        expect(scenario.schema).not.toBe(template.schema);
      }

      expect(scenario.rows?.length ?? 0).toBe(template?.rows.length ?? 0);
      if (scenario.rows && template?.rows) {
        expect(scenario.rows).not.toBe(template.rows);
      }

      expect(scenario.events?.length ?? 0).toBe(template?.events.length ?? 0);
      if (scenario.events && template?.events) {
        expect(scenario.events).not.toBe(template.events);
      }

      expect(scenario.ops.length).toBe(template?.ops.length ?? 0);
      expect(scenario.ops).not.toBe(template?.ops);
      expect(scenario.stats?.rows ?? 0).toBe(scenario.rows?.length ?? 0);
      expect(scenario.stats?.ops ?? 0).toBe(scenario.ops.length);
    });
  });
});

describe("Shared scenario normaliser", () => {
  it("fills missing metadata for source operations", () => {
    const scenario: SharedScenario = {
      id: "synthetic-source-fallback",
      name: "Synthetic source fallback",
      description: "Ensures pk and table fallbacks are derived.",
      schema: [
        { name: "order_ref", type: "string", pk: true },
        { name: "status", type: "string", pk: false },
      ],
      rows: [],
      ops: [
        {
          t: Number.NaN,
          op: "update",
          after: { status: "ready", order_ref: "PK-7" },
        } as any,
      ],
    };

    const template = normaliseSharedScenario(scenario, {
      scenarioIndex: 5,
      includeTxn: false,
      allowEventsAsOps: false,
      fallbackTable: "orders",
      fallbackTimestamp: () => 900,
    });

    expect(template).toBeTruthy();
    expect(template?.ops).toHaveLength(1);
    expect(template?.ops[0].table).toBe("orders");
    expect(template?.ops[0].pk?.id).toBe("PK-7");
    expect(template?.ops[0].t).toBe(900);
  });

  it("derives operations from event payloads with table hints", () => {
    const scenario: SharedScenario = {
      id: "synthetic-event-fallback",
      name: "Synthetic event fallback",
      description: "Ensures event tables and payloads map to operations.",
      table: "orders_default",
      schema: [
        { name: "id", type: "string", pk: true },
        { name: "status", type: "string", pk: false },
      ],
      rows: [],
      events: [
        {
          table: "event_orders",
          payload: {
            op: "u",
            ts_ms: "1425",
            after: { id: "ORD-142", status: "complete" },
          },
        },
      ],
    };

    const template = normaliseSharedScenario(scenario, {
      scenarioIndex: 1,
      allowEventsAsOps: true,
      includeTxn: false,
      fallbackTimestamp: ({ opIndex }) => 1000 + opIndex * 25,
      fallbackTable: "orders_fallback",
    });

    expect(template).toBeTruthy();
    expect(template?.ops).toHaveLength(1);
    const [op] = template!.ops;
    expect(op.table).toBe("event_orders");
    expect(op.op).toBe("update");
    expect(op.pk.id).toBe("ORD-142");
    expect(op.after).toEqual({ id: "ORD-142", status: "complete" });
    expect(op.t).toBe(1425);
  });
});
