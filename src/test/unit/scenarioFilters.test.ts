import { describe, expect, it } from "vitest";
import {
  applyScenarioFilters,
  collectScenarioTags,
  type FilterableScenario,
} from "../../features/scenarioFilters";

const LIVE_NAME = "workspace-live";

type Scenario = FilterableScenario & {
  highlight?: string;
};

const baseScenarios: Scenario[] = [
  {
    id: "crud",
    name: "crud-basic",
    label: "CRUD Basic",
    description: "Intro scenario",
    highlight: "Teaches basic CRUD flows",
    tags: ["crud", "basics"],
  },
  {
    id: "orders",
    name: "omnichannel-orders",
    label: "Omnichannel Orders",
    description: "Orders with lag hotspots",
    highlight: "Great for lag comparisons",
    tags: ["orders", "lag"],
  },
  {
    id: "payments",
    name: "real-time-payments",
    label: "Real-time Payments",
    description: "Risk review flows",
    highlight: "Delete capture expectations",
    tags: ["payments", "risk"],
  },
];

const liveScenario: Scenario = {
  id: "live",
  name: LIVE_NAME,
  label: "Workspace (live)",
  description: "Live workspace feed",
  highlight: "Streams the latest workspace changes",
  tags: ["live", "workspace"],
};

describe("collectScenarioTags", () => {
  it("gathers unique tags from scenarios, live scenario, and extras", () => {
    const result = collectScenarioTags(baseScenarios, {
      liveScenario,
      additionalTags: [["custom"], ["lag", "workspace"], null],
    });

    expect(result).toEqual(["basics", "crud", "custom", "lag", "live", "orders", "payments", "risk", "workspace"]);
  });

  it("ignores empty and whitespace-only tags", () => {
    const withEmpty: Scenario[] = [
      { ...baseScenarios[0], tags: ["crud", " ", ""] },
    ];
    const result = collectScenarioTags(withEmpty, { additionalTags: [["", "  "]] });
    expect(result).toEqual(["crud"]);
  });
});

describe("applyScenarioFilters", () => {
  it("prepends live scenario when provided and deduplicates by name", () => {
    const result = applyScenarioFilters(baseScenarios, {
      liveScenario,
      liveScenarioName: LIVE_NAME,
    });

    expect(result[0].name).toBe(LIVE_NAME);
    expect(result.filter(option => option.name === LIVE_NAME)).toHaveLength(1);
    expect(result).toHaveLength(baseScenarios.length + 1);
  });

  it("replaces existing live entry with latest copy", () => {
    const scenariosWithLive = [...baseScenarios, { ...liveScenario, highlight: "outdated" }];
    const updatedLive = { ...liveScenario, highlight: "fresh" };

    const result = applyScenarioFilters(scenariosWithLive, {
      liveScenario: updatedLive,
      liveScenarioName: LIVE_NAME,
    });

    const liveEntry = result.find(option => option.name === LIVE_NAME);
    expect(liveEntry?.highlight).toBe("fresh");
    expect(result.filter(option => option.name === LIVE_NAME)).toHaveLength(1);
  });

  it("matches scenarios by case-insensitive query across metadata", () => {
    const result = applyScenarioFilters(baseScenarios, {
      query: "  lag  ",
    });

    expect(result.map(option => option.id)).toEqual(["orders"]);
  });

  it("filters scenarios by requiring all selected tags", () => {
    const result = applyScenarioFilters(baseScenarios, {
      tags: ["lag", "orders"],
    });

    expect(result.map(option => option.id)).toEqual(["orders"]);
  });

  it("retains live scenario even when it does not satisfy filters", () => {
    const result = applyScenarioFilters(baseScenarios, {
      liveScenario,
      liveScenarioName: LIVE_NAME,
      tags: ["lag"],
      query: "payments",
    });

    expect(result.some(option => option.name === LIVE_NAME)).toBe(true);
    expect(result.some(option => option.id === "payments")).toBe(false);
  });

  it("returns an empty list when nothing matches", () => {
    const result = applyScenarioFilters(baseScenarios, { query: "non-existent" });
    expect(result).toHaveLength(0);
  });

  it("does not mutate the original scenario array", () => {
    const original = [...baseScenarios];
    applyScenarioFilters(original, { query: "crud" });
    expect(original).toEqual(baseScenarios);
  });
});
