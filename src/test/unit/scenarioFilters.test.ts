import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCENARIO_FILTER,
  SCENARIO_FILTER_STORAGE_KEY,
  SCENARIO_FILTER_TAGS_STORAGE_KEY,
  applyScenarioFilters,
  collectScenarioTags,
  loadScenarioFilterDetail,
  normaliseScenarioFilterDetail,
  saveScenarioFilterDetail,
  scenarioFilterTagsEqual,
  type FilterableScenario,
  type ScenarioFilterDetail,
  type ScenarioFilterStorage,
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

class MemoryStorage implements ScenarioFilterStorage {
  #store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.#store.has(key) ? this.#store.get(key)! : null;
  }

  setItem(key: string, value: string) {
    this.#store.set(key, value);
  }

  removeItem(key: string) {
    this.#store.delete(key);
  }
}

const readStorageDetail = (storage: ScenarioFilterStorage): ScenarioFilterDetail => ({
  query: storage.getItem(SCENARIO_FILTER_STORAGE_KEY) ?? "",
  tags: (() => {
    const raw = storage.getItem(SCENARIO_FILTER_TAGS_STORAGE_KEY);
    if (!raw) return [] as string[];
    try {
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  })(),
});

describe("normaliseScenarioFilterDetail", () => {
  it("returns defaults when detail is missing", () => {
    expect(normaliseScenarioFilterDetail(undefined)).toEqual(DEFAULT_SCENARIO_FILTER);
    expect(normaliseScenarioFilterDetail(null)).toEqual(DEFAULT_SCENARIO_FILTER);
  });

  it("deduplicates and trims tags", () => {
    const detail = normaliseScenarioFilterDetail({
      query: " orders ",
      tags: [" lag ", "orders", "lag", 42, ""],
    });

    expect(detail.query).toBe(" orders ");
    expect(detail.tags).toEqual(["lag", "orders", "42"]);
  });

  it("coerces string tags into arrays", () => {
    const detail = normaliseScenarioFilterDetail({ query: "lag", tags: "orders" });
    expect(detail).toEqual({ query: "lag", tags: ["orders"] });
  });
});

describe("scenarioFilterTagsEqual", () => {
  it("checks equality by value and order", () => {
    expect(scenarioFilterTagsEqual(["a", "b"], ["a", "b"])).toBe(true);
    expect(scenarioFilterTagsEqual(["a", "b"], ["b", "a"])).toBe(false);
    const tags = ["lag"];
    expect(scenarioFilterTagsEqual(tags, tags)).toBe(true);
  });
});

describe("scenario filter storage helpers", () => {
  it("loads stored query and tags", () => {
    const storage = new MemoryStorage();
    storage.setItem(SCENARIO_FILTER_STORAGE_KEY, "orders");
    storage.setItem(SCENARIO_FILTER_TAGS_STORAGE_KEY, JSON.stringify(["lag", " orders "]));

    expect(loadScenarioFilterDetail(storage)).toEqual({
      query: "orders",
      tags: ["lag", "orders"],
    });
  });

  it("handles legacy string values and invalid tags payloads", () => {
    const storage = new MemoryStorage();
    storage.setItem(SCENARIO_FILTER_STORAGE_KEY, "payments");
    storage.setItem(SCENARIO_FILTER_TAGS_STORAGE_KEY, "invalid-json");

    expect(loadScenarioFilterDetail(storage)).toEqual({ query: "payments", tags: [] });
  });

  it("saves detail back to storage and removes empty values", () => {
    const storage = new MemoryStorage();
    saveScenarioFilterDetail({ query: "lag", tags: ["orders", "lag"] }, storage);

    expect(readStorageDetail(storage)).toEqual({
      query: "lag",
      tags: ["orders", "lag"],
    });

    saveScenarioFilterDetail({ query: "", tags: [] }, storage);
    expect(readStorageDetail(storage)).toEqual({ query: "", tags: [] });
  });
});

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

  it("requires all query terms to appear in the scenario metadata", () => {
    const multiMatch = applyScenarioFilters(baseScenarios, {
      query: "lag hotspots",
    });

    expect(multiMatch.map(option => option.id)).toEqual(["orders"]);

    const noMatch = applyScenarioFilters(baseScenarios, {
      query: "lag payments",
    });

    expect(noMatch).toHaveLength(0);
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
