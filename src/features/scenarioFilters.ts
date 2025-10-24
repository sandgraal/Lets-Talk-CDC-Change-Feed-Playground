import type { ScenarioTemplate } from "./shared-scenario-normaliser";

export type FilterableScenario = Pick<
  ScenarioTemplate,
  "id" | "name" | "label" | "description" | "highlight" | "tags"
> & {
  tags?: readonly string[] | null;
};

export type ScenarioFilterParams<T extends FilterableScenario> = {
  query?: string | null;
  tags?: readonly string[] | null;
  liveScenario?: T | null;
  liveScenarioName?: string;
};

export type ScenarioFilterDetail = {
  query: string;
  tags: string[];
};

export interface ScenarioFilterStorage {
  getItem(key: string): string | null | undefined;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export const SCENARIO_FILTER_STORAGE_KEY = "cdc_playground_template_filter_v1" as const;
export const SCENARIO_FILTER_TAGS_STORAGE_KEY = "cdc_playground_template_filter_tags_v1" as const;

export const DEFAULT_SCENARIO_FILTER: ScenarioFilterDetail = {
  query: "",
  tags: [],
};

const coerceScenarioFilterQuery = (query: string | null | undefined) =>
  typeof query === "string" ? query : "";

const coerceScenarioFilterTags = (tags: readonly string[] | null | undefined): string[] => {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const list: string[] = [];
  tags.forEach(tag => {
    if (tag == null) return;
    const value = String(tag).trim();
    if (!value || seen.has(value)) return;
    seen.add(value);
    list.push(value);
  });
  return list;
};

export const normaliseScenarioFilterDetail = (
  detail: Partial<{ query?: unknown; tags?: unknown }> | null | undefined,
): ScenarioFilterDetail => {
  if (!detail || typeof detail !== "object") {
    return { ...DEFAULT_SCENARIO_FILTER };
  }

  const query = coerceScenarioFilterQuery(typeof detail.query === "string" ? detail.query : "");
  const tagsSource = detail.tags;

  if (Array.isArray(tagsSource)) {
    return { query, tags: coerceScenarioFilterTags(tagsSource as string[]) };
  }

  if (typeof tagsSource === "string") {
    const trimmed = tagsSource.trim();
    return { query, tags: trimmed ? [trimmed] : [] };
  }

  return { query, tags: [] };
};

export const scenarioFilterTagsEqual = (
  a: readonly string[],
  b: readonly string[],
): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
};

export const scenarioFilterDetailsEqual = (
  a: ScenarioFilterDetail,
  b: ScenarioFilterDetail,
): boolean => a.query === b.query && scenarioFilterTagsEqual(a.tags, b.tags);

const normaliseStoredQuery = (value: string | null | undefined): string => {
  if (typeof value !== "string") return "";
  return value;
};

const normaliseStoredTags = (value: string | null | undefined): string[] => {
  if (typeof value !== "string" || value.trim().length === 0) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return coerceScenarioFilterTags(parsed as string[]);
    }
  } catch {
    // fall through to return []
  }
  return [];
};

export const loadScenarioFilterDetail = (
  storage: ScenarioFilterStorage | null | undefined,
): ScenarioFilterDetail => {
  if (!storage) return { ...DEFAULT_SCENARIO_FILTER };
  try {
    const query = normaliseStoredQuery(storage.getItem(SCENARIO_FILTER_STORAGE_KEY));
    const tags = normaliseStoredTags(storage.getItem(SCENARIO_FILTER_TAGS_STORAGE_KEY));
    return { query, tags };
  } catch {
    return { ...DEFAULT_SCENARIO_FILTER };
  }
};

export const saveScenarioFilterDetail = (
  detail: ScenarioFilterDetail,
  storage: ScenarioFilterStorage | null | undefined,
): void => {
  if (!storage) return;
  const normalised = normaliseScenarioFilterDetail(detail);

  try {
    if (normalised.query) {
      storage.setItem(SCENARIO_FILTER_STORAGE_KEY, normalised.query);
    } else if (typeof storage.removeItem === "function") {
      storage.removeItem(SCENARIO_FILTER_STORAGE_KEY);
    } else {
      storage.setItem(SCENARIO_FILTER_STORAGE_KEY, "");
    }
  } catch {
    // ignore persistence errors for queries
  }

  try {
    if (normalised.tags.length > 0) {
      storage.setItem(SCENARIO_FILTER_TAGS_STORAGE_KEY, JSON.stringify(normalised.tags));
    } else if (typeof storage.removeItem === "function") {
      storage.removeItem(SCENARIO_FILTER_TAGS_STORAGE_KEY);
    } else {
      storage.setItem(SCENARIO_FILTER_TAGS_STORAGE_KEY, "");
    }
  } catch {
    // ignore persistence errors for tags
  }
};

const normaliseQuery = (query: string | null | undefined) =>
  typeof query === "string" ? query.trim().toLowerCase() : "";

const normaliseTags = (tags: readonly string[] | null | undefined): string[] => {
  if (!Array.isArray(tags)) return [];
  return tags
    .map(tag => (typeof tag === "string" ? tag.trim() : ""))
    .filter(tag => tag.length > 0);
};

const buildHaystack = (scenario: FilterableScenario): string => {
  const parts: string[] = [];
  if (scenario.label) parts.push(scenario.label);
  if (scenario.description) parts.push(scenario.description);
  if (scenario.highlight) parts.push(scenario.highlight);
  if (scenario.name) parts.push(scenario.name);
  if (Array.isArray(scenario.tags) && scenario.tags.length > 0) {
    parts.push(scenario.tags.join(" "));
  }
  return parts.join(" ").toLowerCase();
};

export function applyScenarioFilters<T extends FilterableScenario>(
  scenarios: readonly T[],
  params: ScenarioFilterParams<T> = {},
): T[] {
  const list = Array.from(scenarios);
  const { liveScenario, liveScenarioName, tags, query } = params;

  if (liveScenario) {
    const existingIndex = list.findIndex(option => option.name === liveScenario.name);
    if (existingIndex >= 0) {
      list.splice(existingIndex, 1, liveScenario);
    } else {
      list.unshift(liveScenario);
    }
  }

  const requiredTags = normaliseTags(tags);
  const normalizedQuery = normaliseQuery(query);
  const queryTokens = normalizedQuery
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length > 0);

  return list.filter(option => {
    if (liveScenarioName && option.name === liveScenarioName) {
      return true;
    }

    if (requiredTags.length > 0) {
      const optionTags = normaliseTags(option.tags ?? []);
      const hasAllTags = requiredTags.every(tag => optionTags.includes(tag));
      if (!hasAllTags) return false;
    }

    if (queryTokens.length === 0) return true;

    const haystack = buildHaystack(option);
    if (!haystack) return false;
    return queryTokens.every(token => haystack.includes(token));
  });
}

export type CollectScenarioTagsOptions<T extends FilterableScenario> = {
  liveScenario?: T | null;
  additionalTags?: ReadonlyArray<readonly string[] | null | undefined>;
};

const appendTags = (set: Set<string>, tags: readonly string[] | null | undefined) => {
  if (!Array.isArray(tags)) return;
  tags.forEach(tag => {
    if (typeof tag !== "string") return;
    const trimmed = tag.trim();
    if (trimmed.length > 0) {
      set.add(trimmed);
    }
  });
};

export function collectScenarioTags<T extends FilterableScenario>(
  scenarios: readonly T[],
  options: CollectScenarioTagsOptions<T> = {},
): string[] {
  const tagSet = new Set<string>();
  scenarios.forEach(scenario => appendTags(tagSet, scenario.tags));
  if (options.liveScenario) {
    appendTags(tagSet, options.liveScenario.tags);
  }
  options.additionalTags?.forEach(tags => appendTags(tagSet, tags));
  return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
}
