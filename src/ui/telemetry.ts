import type { ScenarioFilterStorage } from "../features/scenarioFilters";

export type TelemetryQuestionKey =
  | "activation"
  | "funnel_drop"
  | "adoption"
  | "quality_gate"
  | "scenario_completeness"
  | "collaboration";

export type TelemetryQuestion = {
  key: TelemetryQuestionKey;
  label: string;
  description: string;
};

export type TelemetryEntry = {
  event: string;
  payload: Record<string, unknown>;
  context: Record<string, unknown>;
  question: TelemetryQuestionKey | null;
  recordedAt: string;
};

export type TelemetryStorage = Pick<ScenarioFilterStorage, "getItem" | "setItem" | "removeItem">;

export type TelemetryConsole = Pick<Console, "warn" | "debug">;

export type TelemetryClientOptions = {
  storage?: TelemetryStorage | null;
  storageKey?: string;
  maxEntries?: number;
  now?: () => Date;
  console?: TelemetryConsole;
};

export interface TelemetryClient {
  readonly buffer: TelemetryEntry[];
  track(event: string, payload?: Record<string, unknown>, context?: Record<string, unknown>): void;
  flush(): TelemetryEntry[];
  questions(): TelemetryQuestion[];
  taxonomy(): Record<string, TelemetryQuestionKey>;
}

const DEFAULT_STORAGE_KEY = "cdc_telemetry_buffer_v1";
const DEFAULT_MAX_ENTRIES = 200;

const TELEMETRY_QUESTIONS: Record<TelemetryQuestionKey, TelemetryQuestion> = {
  activation: {
    key: "activation",
    label: "Activation",
    description: "Do new users reach their first comparator insight?",
  },
  funnel_drop: {
    key: "funnel_drop",
    label: "Funnel drop",
    description: "Where do users abandon the guided comparator walkthrough?",
  },
  adoption: {
    key: "adoption",
    label: "Adoption",
    description: "Which comparator features become part of regular usage?",
  },
  quality_gate: {
    key: "quality_gate",
    label: "Quality gate",
    description: "Do reliability issues or errors block comparator adoption?",
  },
  scenario_completeness: {
    key: "scenario_completeness",
    label: "Scenario completeness",
    description: "Which templates lead to full replay, export, and comparator review?",
  },
  collaboration: {
    key: "collaboration",
    label: "Collaboration",
    description: "How often do teams share scenarios or comparator snapshots?",
  },
};

const TELEMETRY_TAXONOMY: Record<string, TelemetryQuestionKey> = {
  "comparator.scenario.select": "activation",
  "comparator.scenario.preview": "activation",
  "comparator.preset.select": "activation",
  "comparator.scenario.filter": "activation",
  "comparator.scenario.tag_toggle": "funnel_drop",
  "comparator.scenario.tag_clear": "funnel_drop",
  "comparator.summary.copied": "activation",
  "comparator.diff.opened": "funnel_drop",
  "comparator.overlay.inspect": "activation",
  "comparator.schema.change": "activation",
  "comparator.clock.control": "funnel_drop",
  "comparator.consumer.toggle": "funnel_drop",
  "comparator.consumer.rate_toggle": "funnel_drop",
  "comparator.consumer.rate_adjust": "activation",
  "comparator.consumer.rate_reset": "activation",
  "comparator.event.search": "activation",
  "comparator.event.filter": "activation",
  "comparator.panel.layout": "adoption",
  "comparator.event.download": "adoption",
  "comparator.event.clear": "adoption",
  "comparator.event.copy": "activation",
  "comparator.event.copy.error": "quality_gate",
  "comparator.event.replay": "activation",
  "comparator.destination.download": "adoption",
  "comparator.generator.toggle": "adoption",
  "comparator.generator.rate_adjust": "adoption",
  "comparator.generator.burst": "activation",
  "tour.started": "funnel_drop",
  "tour.completed": "activation",
  "tour.dismissed": "funnel_drop",
  "workspace.share.generated": "collaboration",
  "workspace.scenario.imported": "scenario_completeness",
  "workspace.scenario.template_loaded": "activation",
  "workspace.scenario.exported": "scenario_completeness",
  "telemetry.flush": "activation",
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normaliseRecord = (value: unknown): Record<string, unknown> => {
  if (!isPlainObject(value)) return {};
  const normalised: Record<string, unknown> = {};
  Object.keys(value).forEach(key => {
    normalised[key] = value[key];
  });
  return normalised;
};

const createNoopStorage = (): TelemetryStorage => ({
  getItem: () => null,
  setItem: () => undefined,
});

const safeIsoString = (date: Date): string => {
  try {
    return date.toISOString();
  } catch {
    return new Date().toISOString();
  }
};

const reviveEntry = (raw: unknown): TelemetryEntry | null => {
  if (!isPlainObject(raw)) return null;
  const event = typeof raw.event === "string" ? raw.event : null;
  if (!event) return null;
  const payload = normaliseRecord(raw.payload);
  const context = normaliseRecord(raw.context);
  const recordedAtRaw =
    typeof raw.recordedAt === "string"
      ? raw.recordedAt
      : typeof raw.recorded_at === "string"
        ? raw.recorded_at
        : null;
  const recordedAt = recordedAtRaw && !Number.isNaN(Date.parse(recordedAtRaw))
    ? recordedAtRaw
    : new Date().toISOString();
  const questionRaw = raw.question;
  const question =
    typeof questionRaw === "string" && questionRaw in TELEMETRY_QUESTIONS
      ? (questionRaw as TelemetryQuestionKey)
      : null;
  return { event, payload, context, question, recordedAt };
};

const serializeEntry = (entry: TelemetryEntry) => ({
  event: entry.event,
  payload: entry.payload,
  context: entry.context,
  question: entry.question,
  recordedAt: entry.recordedAt,
});

export const createTelemetryClient = (options: TelemetryClientOptions = {}): TelemetryClient => {
  const storage = options.storage ??
    (typeof window !== "undefined" && window.localStorage
      ? (window.localStorage as TelemetryStorage)
      : createNoopStorage());
  const storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
  const maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES);
  const now = options.now ?? (() => new Date());
  const consoleRef: TelemetryConsole = options.console ??
    (typeof console !== "undefined"
      ? { warn: console.warn.bind(console), debug: console.debug.bind(console) }
      : { warn: () => undefined, debug: () => undefined });

  const loadBuffer = (): TelemetryEntry[] => {
    try {
      const raw = storage.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const revived = parsed
        .map(reviveEntry)
        .filter((entry): entry is TelemetryEntry => Boolean(entry));
      return revived.slice(-maxEntries);
    } catch (error) {
      consoleRef.warn("Telemetry buffer load failed", error);
      return [];
    }
  };

  const buffer = loadBuffer();

  const persist = () => {
    try {
      const snapshot = buffer.slice(-maxEntries).map(serializeEntry);
      storage.setItem(storageKey, JSON.stringify(snapshot));
    } catch (error) {
      consoleRef.warn("Telemetry buffer save failed", error);
    }
  };

  const track = (
    event: string,
    payload: Record<string, unknown> = {},
    context: Record<string, unknown> = {},
  ) => {
    if (typeof event !== "string" || !event.trim()) return;
    const trimmedEvent = event.trim();
    const entry: TelemetryEntry = {
      event: trimmedEvent,
      payload: normaliseRecord(payload),
      context: normaliseRecord(context),
      question: TELEMETRY_TAXONOMY[trimmedEvent] ?? null,
      recordedAt: safeIsoString(now()),
    };
    buffer.push(entry);
    if (buffer.length > maxEntries) {
      buffer.splice(0, buffer.length - maxEntries);
    }
    persist();
    if (entry.context.debug) {
      consoleRef.debug("[telemetry]", entry);
    }
  };

  const flush = (): TelemetryEntry[] => {
    if (buffer.length === 0) return [];
    const snapshot = buffer.slice();
    buffer.length = 0;
    persist();
    return snapshot;
  };

  const questions = (): TelemetryQuestion[] =>
    Object.values(TELEMETRY_QUESTIONS).map(question => ({ ...question }));

  const taxonomy = (): Record<string, TelemetryQuestionKey> => ({ ...TELEMETRY_TAXONOMY });

  return {
    buffer,
    track,
    flush,
    questions,
    taxonomy,
  };
};

export type { TelemetryClientOptions as CreateTelemetryClientOptions };
