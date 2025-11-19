import { describe, expect, it } from "vitest";
import { SCENARIO_TEMPLATES } from "../../features/scenarios";
import { SCENARIOS as COMPARATOR_SCENARIOS } from "../../../web/scenarios";
import sharedScenarios, { type SharedScenario } from "../../features/shared-scenarios";
import { normaliseSharedScenario } from "../../features/shared-scenario-normaliser";
import type { SourceOp } from "../../domain/types";

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
    id: "outbox-relay",
    name: "Outbox Relay",
    description: "Contrasting log capture with an application-managed outbox.",
    highlight: "Showcases ordering + dedupe safety when emitting business events from an outbox.",
    tags: ["outbox", "eventing", "ordering"],
  },
  {
    id: "snapshot-replay",
    name: "Snapshot Replay",
    description: "Offset resets and re-seeding change feeds.",
    highlight: "Drop-snapshot and dedupe controls for idempotent apply.",
    tags: ["snapshot", "replay", "dedupe"],
  },
  {
    id: "retention-erasure",
    name: "Retention & Erasure",
    description: "Walk through right-to-be-forgotten and legal hold flows.",
    highlight: "Contrast tombstones, masking, and delayed deletes for privacy workflows.",
    tags: ["gdpr", "retention", "privacy"],
  },
  {
    id: "snapshot-to-stream",
    name: "Snapshot ➜ Stream Handoff",
    description: "Showing snapshot catch-up handing off to change feed tails.",
    highlight: "Compare drop-snapshot + dedupe toggles; log vs. trigger resume semantics.",
    tags: ["snapshot", "resume", "dedupe"],
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

  it("normalises event payload variants and deep clones derived rows", () => {
    const snapshotEvent = {
      payload: {
        op: "SNAPSHOT",
        after: { id: "ORD-501", status: "snapshot" },
      },
    };
    const updateEvent = {
      payload: {
        op: "U",
        after: { id: "ORD-501", status: "released" },
      },
    };
    const deleteEvent = {
      payload: {
        op: "DELETE",
        before: { id: "ORD-501", status: "released" },
      },
    };

    const scenario: SharedScenario = {
      id: "event-variants",
      name: "Event variants",
      description: "Accepts a range of Debezium-like payload shapes.",
      schema: [
        { name: "id", type: "string", pk: true },
        { name: "status", type: "string", pk: false },
      ],
      events: [snapshotEvent, updateEvent, deleteEvent],
    };

    const template = normaliseSharedScenario(scenario, {
      scenarioIndex: 2,
      allowEventsAsOps: true,
      includeTxn: false,
      fallbackTable: "orders_fallback",
      fallbackTimestamp: ({ opIndex }) => 500 + opIndex * 10,
    });

    expect(template).toBeTruthy();
    expect(template?.ops).toHaveLength(3);

    expect(template?.ops[0].op).toBe("insert");
    expect(template?.ops[0].table).toBe("orders_fallback");
    expect(template?.ops[0].t).toBe(500);
    expect(template?.ops[0].after).toEqual({ id: "ORD-501", status: "snapshot" });

    expect(template?.ops[1].op).toBe("update");
    expect(template?.ops[1].table).toBe("orders_fallback");
    expect(template?.ops[1].t).toBe(510);
    expect(template?.ops[1].after).toEqual({ id: "ORD-501", status: "released" });

    expect(template?.ops[2].op).toBe("delete");
    expect(template?.ops[2].table).toBe("orders_fallback");
    expect(template?.ops[2].t).toBe(520);
    expect(template?.ops[2].pk.id).toBe("ORD-501");

    snapshotEvent.payload.after.status = "mutated";
    updateEvent.payload.after.status = "mutated";
    expect(template?.ops[0].after?.status).toBe("snapshot");
    expect(template?.ops[1].after?.status).toBe("released");
  });

  it("clones comparator snapshots when scenarios provide them", () => {
    const comparator = {
      preferences: { scenarioId: "with-comparator", activeMethods: ["polling"] },
      summary: { note: "stored" },
      analytics: [{ method: "polling", total: 5 }, null],
      diffs: [
        {
          method: "polling",
          totals: { missing: 1, extra: 0, ordering: 0 },
          issues: [{ id: "missing" }],
          lag: { max: 12, samples: [{ at: 42 }] },
        },
        undefined,
      ],
      tags: ["lag", 42],
      preset: { id: "MYSQL_DEBEZIUM", label: "MySQL" },
      overlay: [
        { method: "polling", label: "Polling", chips: [], hasDetails: false },
        { note: "invalid" },
      ],
      lanes: [
        { method: "polling", eventCount: "7", metrics: { produced: 7, consumed: 7 } },
        { method: 42 },
      ],
    } as unknown as SharedScenario["comparator"];

    const scenario: SharedScenario = {
      id: "with-comparator",
      name: "With comparator",
      description: "Includes stored comparator metadata.",
      schema: [],
      ops: [
        {
          t: 0,
          table: "orders",
          op: "insert",
          pk: { id: "1" },
          after: { id: "1" },
        } as SourceOp,
      ],
      comparator,
    };

    const template = normaliseSharedScenario(scenario, {
      scenarioIndex: 3,
      allowEventsAsOps: false,
    });

    expect(template?.comparator).toEqual({
      preferences: { scenarioId: "with-comparator", activeMethods: ["polling"] },
      summary: { note: "stored" },
      analytics: [{ method: "polling", total: 5 }],
      diffs: [
        {
          method: "polling",
          totals: { missing: 1, extra: 0, ordering: 0 },
          issues: [{ id: "missing" }],
          lag: { max: 12, samples: [{ at: 42 }] },
        },
      ],
      tags: ["lag"],
      preset: { id: "MYSQL_DEBEZIUM", label: "MySQL" },
      overlay: [{ method: "polling", label: "Polling", chips: [], hasDetails: false }],
      lanes: [
        {
          method: "polling",
          eventCount: 7,
          metrics: { produced: 7, consumed: 7 },
        },
      ],
    });

    if (scenario.comparator && typeof scenario.comparator === "object") {
      const analytics = (scenario.comparator as Record<string, unknown>).analytics as unknown[] | undefined;
      if (Array.isArray(analytics) && analytics[0] && typeof analytics[0] === "object") {
        (analytics[0] as Record<string, unknown>).method = "mutated";
      }
    }

    expect(template?.comparator?.analytics[0]?.method).toBe("polling");
  });
});
