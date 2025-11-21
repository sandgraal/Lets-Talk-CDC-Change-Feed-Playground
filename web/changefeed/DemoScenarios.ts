import type { PlaygroundAction } from "../../src";

export interface DemoScenario {
  id: string;
  name: string;
  description: string;
  icon: string;
  actions: PlaygroundAction[];
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "multi-table-transaction",
    name: "Multi-Table Transaction",
    description:
      "Place an order that spans customers + orders tables atomically",
    icon: "🔗",
    actions: [
      { type: "setApplyPolicy", policy: "apply-on-commit" },
      { type: "toggleCommitDrift", enabled: false },
      { type: "placeOrder", items: 3 },
    ],
  },
  {
    id: "schema-drift-demo",
    name: "Schema Evolution",
    description:
      "Enable schema drift and insert customers with new column version",
    icon: "📊",
    actions: [
      { type: "toggleSchemaDrift", enabled: true },
      { type: "setProjectSchemaDrift", project: true },
      { type: "insertCustomers", count: 2 },
      { type: "updateCustomer" },
    ],
  },
  {
    id: "commit-lag-demo",
    name: "Commit Lag & Drift",
    description:
      "See how commit drift affects event ordering and arrival times",
    icon: "⏱️",
    actions: [
      { type: "toggleCommitDrift", enabled: true },
      { type: "insertCustomers", count: 2 },
      { type: "updateCustomer" },
      { type: "placeOrder", items: 2 },
    ],
  },
  {
    id: "backlog-recovery",
    name: "Backlog Recovery",
    description: "Inject backlog, throttle consumer, then catch up",
    icon: "🔥",
    actions: [
      { type: "injectBacklog", count: 12 },
      { type: "setMaxApply", maxApplyPerTick: 1 },
    ],
  },
  {
    id: "fault-injection",
    name: "Event Drops & Faults",
    description: "Simulate network issues with 20% drop rate",
    icon: "⚠️",
    actions: [
      { type: "setDropProbability", probability: 0.2 },
      { type: "insertCustomers", count: 3 },
      { type: "placeOrder", items: 2 },
    ],
  },
  {
    id: "apply-policy-compare",
    name: "Apply Policies",
    description: "Compare apply-on-commit vs apply-as-polled behavior",
    icon: "⚡",
    actions: [
      { type: "setApplyPolicy", policy: "apply-as-polled" },
      { type: "placeOrder", items: 2 },
    ],
  },
];
