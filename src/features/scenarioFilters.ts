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

  return list.filter(option => {
    if (liveScenarioName && option.name === liveScenarioName) {
      return true;
    }

    if (requiredTags.length > 0) {
      const optionTags = normaliseTags(option.tags ?? []);
      const hasAllTags = requiredTags.every(tag => optionTags.includes(tag));
      if (!hasAllTags) return false;
    }

    if (!normalizedQuery) return true;

    const haystack = buildHaystack(option);
    if (!haystack) return false;
    return haystack.includes(normalizedQuery);
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

export type ScenarioFilterDetail = {
  query: string;
  tags: string[];
};
