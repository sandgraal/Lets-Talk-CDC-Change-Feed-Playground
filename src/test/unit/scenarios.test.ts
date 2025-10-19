import { describe, expect, it } from "vitest";
import { SCENARIO_TEMPLATES } from "../../features/scenarios";
import sharedScenarios from "../../features/shared-scenarios";

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

  it("captures delete expectations for the payments scenario", () => {
    const payments = SCENARIO_TEMPLATES.find(template => template.id === "real-time-payments");
    expect(payments).toBeTruthy();
    expect(payments?.ops.some(op => op.op === "delete")).toBe(true);
  });

  it("stays aligned with the shared scenario catalogue", () => {
    const eligibleShared = sharedScenarios.filter(
      scenario => Array.isArray(scenario.ops) && scenario.ops.length > 0,
    );
    expect(eligibleShared.length).toBe(SCENARIO_TEMPLATES.length);

    const sharedById = new Map(eligibleShared.map(scenario => [scenario.id, scenario]));
    SCENARIO_TEMPLATES.forEach(template => {
      const shared = sharedById.get(template.id);
      expect(shared).toBeTruthy();
      expect(shared?.description).toBe(template.description);
      expect(shared?.highlight).toBe(template.highlight);
      expect(shared?.tags).toEqual(template.tags);
      expect(shared?.ops?.length).toBe(template.ops.length);
      expect(shared?.schemaVersion ?? undefined).toBe(template.schemaVersion ?? undefined);
    });
  });
});
