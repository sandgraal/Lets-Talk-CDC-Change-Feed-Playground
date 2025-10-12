import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SourceOp, Event as EngineEvent } from "../src";
import type { CdcEvent, LaneDiffResult } from "../sim";
import type { MethodEngine } from "../sim";
import {
  createLogBasedAdapter,
  createQueryBasedAdapter,
  createTriggerBasedAdapter,
  type ModeAdapter,
  type ModeIdentifier,
  type ModeRuntime,
} from "../src";
import { CDCController, EventBus, MetricsStore, Scheduler, type MetricsSnapshot } from "../src";
import { EventLog, type EventLogFilters, type EventLogRow, type EmitFn } from "../src";
import { ScenarioRunner, diffLane } from "../sim";

type FeatureFlagKey =
  | "ff_event_bus"
  | "ff_pause_resume"
  | "ff_query_slider"
  | "ff_event_log"
  | "ff_crud_fix";

type FeatureFlagApi = {
  has?: (flag: string) => boolean;
  all?: () => string[];
};

declare global {
  interface Window {
    cdcFeatureFlags?: FeatureFlagApi;
    APPWRITE_CFG?: {
      featureFlags?: string[];
    };
  }
}
import { MetricsStrip } from "./components/MetricsStrip";
import { MetricsDashboard } from "./components/MetricsDashboard";
import { LaneDiffOverlay } from "./components/LaneDiffOverlay";
import { SCENARIOS, ShellScenario } from "./scenarios";
import { track, trackClockControl } from "./telemetry";
import "./styles/shell.css";
import methodCopyData from "../assets/method-copy.js";

const LIVE_SCENARIO_NAME = "workspace-live" as const;
const PREFERENCES_KEY = "cdc_comparator_prefs_v1" as const;

type WorkspaceBroadcastDetail = {
  scenario?: {
    label?: string;
    description?: string;
    seed?: number;
    ops?: SourceOp[];
  } | null;
};

type Metrics = {
  lagMs: number;
  throughput: number;
  deletesPct: number;
  orderingOk: boolean;
  consistent: boolean;
  writeAmplification?: number;
};

function computeTriggerWriteAmplification(
  stats: Partial<Record<MethodOption, LaneStats>>,
  method: MethodOption,
  events: CdcEvent[],
  scenario: ShellScenario,
): number | undefined {
  if (events.length === 0) return 0;
  const statValue = stats[method]?.metrics.writeAmplification;
  if (typeof statValue === "number" && statValue >= 0) return statValue;
  const sourceOps = scenario.ops.filter(op => op.table === events[0]?.table);
  if (!sourceOps.length) return events.length;
  return events.length / sourceOps.length;
}

const METHOD_ORDER = ["polling", "trigger", "log"] as const;
const MIN_LANES = 2;
const STEP_MS = 100;

type MethodOption = typeof METHOD_ORDER[number];

type PollingConfig = {
  pollIntervalMs: number;
  includeSoftDeletes: boolean;
};

type TriggerConfig = {
  extractIntervalMs: number;
  triggerOverheadMs: number;
};

type LogConfig = {
  fetchIntervalMs: number;
};

type MethodConfigMap = {
  polling: PollingConfig;
  trigger: TriggerConfig;
  log: LogConfig;
};

type PartialMethodConfigMap = Partial<{
  polling: Partial<PollingConfig>;
  trigger: Partial<TriggerConfig>;
  log: Partial<LogConfig>;
}>;

type EventOp = "c" | "u" | "d";

type ComparatorPreferences = {
  scenarioId?: string | null;
  activeMethods?: MethodOption[];
  methodConfig?: PartialMethodConfigMap;
  userPinnedScenario?: boolean;
  showEventList?: boolean;
  eventOps?: EventOp[];
  eventSearch?: string;
  eventLogTable?: string | null;
  eventLogTxn?: string | null;
  eventLogMethod?: MethodOption | null;
};

type LaneMetrics = {
  method: MethodOption;
  metrics: Metrics;
  events: CdcEvent[];
};

type BusEvent = CdcEvent & {
  topic: string;
  offset?: number;
};

type LaneRuntime = {
  bus: EventBus<EngineEvent>;
  metrics: MetricsStore;
  topic: string;
};

type LaneStats = {
  backlog: number;
  lastOffset: number;
  metrics: MetricsSnapshot;
};

type LaneRuntimeSummary = {
  backlog: number;
  lastOffset: number;
  produced: number;
  consumed: number;
  lagMsP50: number;
  lagMsP95: number;
  missedDeletes: number;
  writeAmplification: number;
};

type CombinedBusEvent = {
  method: MethodOption;
  event: BusEvent;
};

type ControllerBackedEngine = MethodEngine & {
  bus: EventBus<EngineEvent>;
  metrics: MetricsStore;
  topic: string;
};

type Summary = {
  bestLag: LaneMetrics;
  worstLag: LaneMetrics;
  lagSpread: number;
  lowestDeletes: LaneMetrics;
  highestDeletes: LaneMetrics;
  orderingIssues: MethodOption[];
  triggerWriteAmplification: LaneMetrics | null;
};

type ClockControlCommand =
  | { type: "play" }
  | { type: "pause" }
  | { type: "step"; deltaMs?: number }
  | { type: "seek"; timeMs: number; stepMs?: number }
  | { type: "reset" };

type MethodCopy = {
  label: string;
  laneDescription: string;
  callout: string;
  whenToUse: string;
};

const METHOD_COPY = methodCopyData as Record<MethodOption, MethodCopy>;

const MAX_TIMELINE_EVENTS = 200;
const MAX_EVENT_LOG_ROWS = 2000;

function readFeatureFlags(): Set<string> {
  if (typeof window === "undefined") return new Set();
  const api = window.cdcFeatureFlags as FeatureFlagApi | undefined;
  const initial = api?.all?.();
  if (Array.isArray(initial) && initial.length) {
    return new Set(initial.map(String));
  }
  const cfg = window.APPWRITE_CFG?.featureFlags;
  if (Array.isArray(cfg) && cfg.length) {
    return new Set(cfg.map(String));
  }
  return new Set();
}

const DEFAULT_METHOD_CONFIG: MethodConfigMap = {
  polling: { pollIntervalMs: 500, includeSoftDeletes: false },
  trigger: { extractIntervalMs: 250, triggerOverheadMs: 8 },
  log: { fetchIntervalMs: 50 },
};

const MODE_LOOKUP: Record<MethodOption, ModeIdentifier> = {
  polling: "QUERY_BASED",
  trigger: "TRIGGER_BASED",
  log: "LOG_BASED",
};

const METHOD_META_LOOKUP: Record<MethodOption, CdcEvent["meta"]["method"]> = {
  polling: "polling",
  trigger: "trigger",
  log: "log",
};

const createAdapterForMethod = (method: MethodOption): ModeAdapter => {
  switch (method) {
    case "polling":
      return createQueryBasedAdapter();
    case "trigger":
      return createTriggerBasedAdapter();
    case "log":
    default:
      return createLogBasedAdapter();
  }
};

const sanitizeRecordForCdcEvent = (record: Record<string, unknown> | undefined) => {
  if (!record) return null;
  const clone = { ...record } as Record<string, unknown>;
  delete clone.__ts;
  return clone;
};

const eventToCdcEvent = (method: MethodOption, event: EngineEvent, seq: number): CdcEvent => ({
  source: "demo-db",
  table: event.table,
  op: event.kind === "INSERT" ? "c" : event.kind === "UPDATE" ? "u" : "d",
  pk: { id: String(event.after?.id ?? event.before?.id ?? "") },
  before: sanitizeRecordForCdcEvent(event.before as Record<string, unknown> | undefined),
  after: sanitizeRecordForCdcEvent(event.after as Record<string, unknown> | undefined),
  ts_ms: event.commitTs,
  tx: { id: event.txnId ?? `tx-${event.commitTs}`, lsn: typeof event.offset === "number" ? event.offset : null },
  seq,
  meta: { method: METHOD_META_LOOKUP[method] },
});

function createControllerEngineInstance(
  method: MethodOption,
  onProduced: (events: BusEvent[]) => void,
): ControllerBackedEngine {
  const bus = new EventBus<EngineEvent>();
  const metrics = new MetricsStore();
  const scheduler = new Scheduler();
  const topic = `cdc.${method}`;

  let adapter = createAdapterForMethod(method);
  let controller: CDCController;
  let runtime: ModeRuntime = { bus, metrics, scheduler, topic };
  let currentConfig: Record<string, unknown> = {};
  let sequence = 0;
  const callbacks = new Set<(event: CdcEvent) => void>();

  const toBusEvent = (event: EngineEvent): BusEvent => {
    const existingSeq = (event as unknown as { __seq?: number }).__seq;
    const seq = typeof existingSeq === "number" && existingSeq > 0 ? existingSeq : ++sequence;
    (event as unknown as { __seq: number }).__seq = seq;
    const base = eventToCdcEvent(method, event, seq);
    return {
      ...base,
      offset: event.offset,
      topic: event.topic ?? topic,
    };
  };

  const interceptEmit = (emit: EmitFn): EmitFn => events => {
    const enriched = emit(events);
    if (enriched.length) {
      const busEvents = enriched.map(ev => toBusEvent(ev));
      onProduced(busEvents);
      busEvents.forEach(evt => callbacks.forEach(cb => cb(evt)));
    }
    return enriched;
  };

  const initialiseController = () => {
    adapter.initialise?.(runtime);
    adapter.configure?.(currentConfig);
    controller = new CDCController(MODE_LOOKUP[method], bus, scheduler, metrics, topic, {
      startSnapshot: (tables, emit) =>
        adapter.startSnapshot?.(tables, events => interceptEmit(emit)(events)),
      startTailing: emit => adapter.startTailing?.(events => interceptEmit(emit)(events)),
      stop: () => adapter.stop?.(),
    });
    controller.startSnapshot([]);
    controller.startTailing();
  };

  initialiseController();

  const engine: ControllerBackedEngine = {
    name: method,
    configure(opts) {
      currentConfig = { ...opts };
      adapter.configure?.(opts);
    },
    reset(seed) {
      void seed;
      controller.stop();
      scheduler.clear();
      metrics.reset();
      bus.reset(topic);
      sequence = 0;
      adapter = createAdapterForMethod(method);
      runtime = { bus, metrics, scheduler, topic };
      initialiseController();
    },
    applySourceOp(op) {
      adapter.applySource?.(op);
    },
    tick(now) {
      adapter.tick?.(now);
    },
    onEvent(cb) {
      callbacks.add(cb);
      return () => callbacks.delete(cb);
    },
    bus,
    metrics,
    topic,
  };

  return engine;
}

function createEngine(method: MethodOption, onProduced: (events: BusEvent[]) => void) {
  return createControllerEngineInstance(method, onProduced);
}

function emptyEventMap<T>(methods: MethodOption[]) {
  return methods.reduce<Partial<Record<MethodOption, T[]>>>((acc, method) => {
    acc[method] = [];
    return acc;
  }, {});
}

function cloneConfig(config: MethodConfigMap): MethodConfigMap {
  return {
    polling: { ...config.polling },
    trigger: { ...config.trigger },
    log: { ...config.log },
  };
}

function sanitizeNumber(value: unknown, fallback: number, min?: number) {
  let parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (typeof min === "number") parsed = Math.max(min, parsed);
  return parsed;
}

function sanitizeActiveMethods(methods: unknown): MethodOption[] {
  if (!Array.isArray(methods)) return [...METHOD_ORDER];
  const unique: MethodOption[] = [];
  METHOD_ORDER.forEach(method => {
    if ((methods as unknown[]).includes(method) && !unique.includes(method)) {
      unique.push(method);
    }
  });
  return unique.length >= MIN_LANES ? unique : [...METHOD_ORDER];
}

function sanitizeEventOps(ops: unknown): Set<EventOp> {
  const defaults: EventOp[] = ["c", "u", "d"];
  if (!Array.isArray(ops) || ops.length === 0) {
    return new Set(defaults);
  }
  const active: EventOp[] = [];
  ops.forEach(op => {
    if (op === "c" || op === "u" || op === "d") {
      if (!active.includes(op)) active.push(op);
    }
  });
  return active.length ? new Set(active) : new Set(defaults);
}

function isMethodOption(value: unknown): value is MethodOption {
  return typeof value === "string" && (METHOD_ORDER as readonly string[]).includes(value as MethodOption);
}

function sanitizeMethodConfig(partial?: PartialMethodConfigMap): MethodConfigMap {
  const base = cloneConfig(DEFAULT_METHOD_CONFIG);
  if (!partial) return base;

  if (partial.polling) {
    if (partial.polling.pollIntervalMs != null) {
      base.polling.pollIntervalMs = sanitizeNumber(
        partial.polling.pollIntervalMs,
        base.polling.pollIntervalMs,
        50,
      );
    }
    if (partial.polling.includeSoftDeletes != null) {
      base.polling.includeSoftDeletes = Boolean(partial.polling.includeSoftDeletes);
    }
  }

  if (partial.trigger) {
    if (partial.trigger.extractIntervalMs != null) {
      base.trigger.extractIntervalMs = sanitizeNumber(
        partial.trigger.extractIntervalMs,
        base.trigger.extractIntervalMs,
        50,
      );
    }
    if (partial.trigger.triggerOverheadMs != null) {
      base.trigger.triggerOverheadMs = sanitizeNumber(
        partial.trigger.triggerOverheadMs,
        base.trigger.triggerOverheadMs,
        0,
      );
    }
  }

  if (partial.log) {
    if (partial.log.fetchIntervalMs != null) {
      base.log.fetchIntervalMs = sanitizeNumber(
        partial.log.fetchIntervalMs,
        base.log.fetchIntervalMs,
        10,
      );
    }
  }

  return base;
}

function loadPreferences(): ComparatorPreferences | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      scenarioId: typeof parsed.scenarioId === "string" ? parsed.scenarioId : undefined,
      activeMethods: Array.isArray(parsed.activeMethods) ? parsed.activeMethods : undefined,
      methodConfig: parsed.methodConfig ?? undefined,
      userPinnedScenario: typeof parsed.userPinnedScenario === "boolean" ? parsed.userPinnedScenario : undefined,
      showEventList: typeof parsed.showEventList === "boolean" ? parsed.showEventList : undefined,
      eventOps: Array.isArray(parsed.eventOps) ? parsed.eventOps : undefined,
      eventSearch: typeof parsed.eventSearch === "string" ? parsed.eventSearch : undefined,
      eventLogTable: typeof parsed.eventLogTable === "string" ? parsed.eventLogTable : undefined,
      eventLogTxn: typeof parsed.eventLogTxn === "string" ? parsed.eventLogTxn : undefined,
      eventLogMethod: typeof parsed.eventLogMethod === "string" ? parsed.eventLogMethod : undefined,
    };
  } catch (err) {
    console.warn("Comparator prefs load failed", err);
    return null;
  }
}

function savePreferences(prefs: ComparatorPreferences) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
  } catch (err) {
    console.warn("Comparator prefs save failed", err);
  }
}

function computeMetrics(
  events: CdcEvent[],
  clock: number,
  scenario: ShellScenario,
  method: MethodOption,
  stats: Partial<Record<MethodOption, LaneStats>>,
): Metrics {
  const lastEvent = events.length ? events[events.length - 1] : null;
  const lagMs = lastEvent ? Math.max(clock - lastEvent.ts_ms, 0) : clock;
  const throughput = clock > 0 ? events.length / (clock / 1000) : 0;

  const totalDeletes = scenario.ops.filter(op => op.op === "delete").length;
  const capturedDeletes = events.filter(evt => evt.op === "d").length;
  const deletesPct = totalDeletes === 0 ? 100 : (capturedDeletes / totalDeletes) * 100;

  const orderingOk = events.every((evt, idx) => {
    if (idx === 0) return true;
    const prev = events[idx - 1];
    return evt.ts_ms >= prev.ts_ms;
  });

  const consistent =
    orderingOk && (method === "polling" ? capturedDeletes === totalDeletes : true);

  return {
    lagMs,
    throughput,
    deletesPct,
    orderingOk,
    consistent,
    writeAmplification:
      method === "trigger"
        ? computeTriggerWriteAmplification(stats, method, events, scenario) ?? 0
        : undefined,
  };
}

function computeSummary(lanes: LaneMetrics[]): Summary | null {
  if (lanes.length === 0) return null;
  const lagSorted = [...lanes].sort((a, b) => a.metrics.lagMs - b.metrics.lagMs);
  const bestLag = lagSorted[0];
  const worstLag = lagSorted[lagSorted.length - 1];
  const lagSpread = worstLag.metrics.lagMs - bestLag.metrics.lagMs;

  const deleteSorted = [...lanes].sort((a, b) => a.metrics.deletesPct - b.metrics.deletesPct);
  const lowestDeletes = deleteSorted[0];
  const highestDeletes = deleteSorted[deleteSorted.length - 1];

  const orderingIssues = lanes.filter(lane => !lane.metrics.orderingOk).map(lane => lane.method);

  const triggerLanes = lanes.filter(
    lane => lane.method === "trigger" && typeof lane.metrics.writeAmplification === "number",
  );
  const triggerWriteAmplification = triggerLanes.length
    ? triggerLanes.reduce((max, lane) => {
        if (!max.metrics.writeAmplification) return lane;
        if (!lane.metrics.writeAmplification) return max;
        return lane.metrics.writeAmplification > max.metrics.writeAmplification ? lane : max;
      })
    : null;

  return {
    bestLag,
    worstLag,
    lagSpread,
    lowestDeletes,
    highestDeletes,
    orderingIssues,
    triggerWriteAmplification,
  };
}

export function App() {
  const storedPrefsRef = useRef<ComparatorPreferences | null>(null);
  if (storedPrefsRef.current === null) {
    storedPrefsRef.current = loadPreferences();
  }
  const storedPrefs = storedPrefsRef.current || undefined;
  const initialActiveMethods = sanitizeActiveMethods(storedPrefs?.activeMethods);
  const initialMethodConfig = sanitizeMethodConfig(storedPrefs?.methodConfig);
  const initialEventLogMethod = isMethodOption(storedPrefs?.eventLogMethod)
    ? (storedPrefs?.eventLogMethod as MethodOption)
    : null;

  const [liveScenario, setLiveScenario] = useState<ShellScenario | null>(null);
  const [scenarioId, setScenarioId] = useState<string>(
    () => storedPrefs?.scenarioId ?? SCENARIOS[0].name,
  );
  const [scenarioFilter, setScenarioFilter] = useState<string>("");
  const [scenarioTags, setScenarioTags] = useState<string[]>([]);
  const [activeMethods, setActiveMethods] = useState<MethodOption[]>(
    () => initialActiveMethods,
  );
  const [laneEvents, setLaneEvents] = useState<Partial<Record<MethodOption, CdcEvent[]>>>(() =>
    emptyEventMap<CdcEvent>(initialActiveMethods),
  );
  const [busEvents, setBusEvents] = useState<Partial<Record<MethodOption, BusEvent[]>>>(() =>
    emptyEventMap<BusEvent>(initialActiveMethods),
  );
  const [laneStats, setLaneStats] = useState<Partial<Record<MethodOption, LaneStats>>>(
    () => ({}),
  );
  const [clock, setClock] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isConsumerPaused, setIsConsumerPaused] = useState(false);
  const [methodConfig, setMethodConfig] = useState<MethodConfigMap>(
    () => initialMethodConfig,
  );
  const [summaryCopied, setSummaryCopied] = useState(false);
  const [eventSearch, setEventSearch] = useState(() => storedPrefs?.eventSearch ?? "");
  const [activeEventOps, setActiveEventOps] = useState<Set<EventOp>>(() => sanitizeEventOps(storedPrefs?.eventOps));
  const [showEventList, setShowEventList] = useState(storedPrefs?.showEventList ?? true);
  const [eventLogTable, setEventLogTable] = useState<string | null>(storedPrefs?.eventLogTable ?? null);
  const [eventLogTxn, setEventLogTxn] = useState<string>(storedPrefs?.eventLogTxn ?? "");
  const [eventLogMethod, setEventLogMethod] = useState<MethodOption | null>(initialEventLogMethod);
  const [featureFlags, setFeatureFlags] = useState<Set<string>>(() => readFeatureFlags());
  const laneRuntimeRef = useRef<Partial<Record<MethodOption, LaneRuntime>>>({});
  const updateLaneSnapshot = useCallback(
    (method: MethodOption, options?: { lastOffset?: number }) => {
      const runtime = laneRuntimeRef.current[method];
      if (!runtime) return;
      const snapshot = runtime.metrics.snapshot();
      const backlog = runtime.bus.size(runtime.topic);
      setLaneStats(prev => ({
        ...prev,
        [method]: {
          metrics: snapshot,
          backlog,
          lastOffset: options?.lastOffset ?? prev[method]?.lastOffset ?? -1,
        },
      }));
    },
    [],
  );
  const handleProduced = useCallback(
    (method: MethodOption, events: BusEvent[]) => {
      if (!events.length) return;
      setBusEvents(prev => {
        const next = { ...prev };
        const existing = next[method] ?? [];
        next[method] = [...existing, ...events];
        return next;
      });
      updateLaneSnapshot(method, { lastOffset: events[events.length - 1]?.offset ?? -1 });
    },
    [updateLaneSnapshot],
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler: EventListener = event => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as (string[] | undefined);
      const list = Array.isArray(detail) ? detail : [];
      setFeatureFlags(new Set(list.map(String)));
    };
    window.addEventListener("cdc:feature-flags" as string, handler);
    return () => {
      window.removeEventListener("cdc:feature-flags" as string, handler);
    };
  }, []);
  const hasFeatureFlag = useCallback(
    (flag: FeatureFlagKey) => (featureFlags.size === 0 ? true : featureFlags.has(flag)),
    [featureFlags],
  );
  const eventBusEnabled = hasFeatureFlag("ff_event_bus");
  const pauseResumeEnabled = hasFeatureFlag("ff_pause_resume");
  const querySliderEnabled = hasFeatureFlag("ff_query_slider");
  const eventLogEnabled = hasFeatureFlag("ff_event_log");
  const eventOpsArray = useMemo(() => Array.from(activeEventOps).sort(), [activeEventOps]);
  const eventOpsSet = useMemo(() => new Set(eventOpsArray), [eventOpsArray]);
  const eventSearchTerms = useMemo(
    () => eventSearch.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [eventSearch],
  );
  const eventSearchSignature = useMemo(() => eventSearchTerms.join("|"), [eventSearchTerms]);
  const eventSearchCacheRef = useRef(new WeakMap<CdcEvent, string>());
  const filterEvents = useCallback(
    (source: Partial<Record<MethodOption, CdcEvent[]>>) => {
      const opsSet = new Set(eventOpsArray);
      const hasOpFilter = opsSet.size < 3;
      const hasSearch = eventSearchTerms.length > 0;
      const cache = eventSearchCacheRef.current;
      const results = new Map<MethodOption, CdcEvent[]>();

      const buildHaystack = (event: CdcEvent) => {
        const cached = cache.get(event);
        if (cached) return cached;
        const pieces: string[] = [
          String(event.seq ?? ""),
          event.op,
          event.pk?.id ?? "",
          event.table ?? "",
        ];
        if (event.after)
          pieces.push(...Object.values(event.after).map(value => String(value ?? "")));
        if (event.before)
          pieces.push(...Object.values(event.before).map(value => String(value ?? "")));
        const joined = pieces.join(" ").toLowerCase();
        cache.set(event, joined);
        return joined;
      };

      activeMethods.forEach(method => {
        const events = source[method] ?? [];
        if (!hasOpFilter && !hasSearch) {
          results.set(method, events);
          return;
        }

        const filtered = events.filter(event => {
          if (!opsSet.has(event.op as EventOp)) return false;
          if (!hasSearch) return true;
          const haystack = buildHaystack(event);
          return eventSearchTerms.every(term => haystack.includes(term));
        });
        results.set(method, filtered);
      });

      return results;
    },
    [activeMethods, eventOpsArray, eventSearchTerms],
  );
  const filteredEventsByMethod = useMemo(
    () => filterEvents(laneEvents),
    [filterEvents, laneEvents, eventSearchSignature],
  );
  const busFilteredEventsByMethod = useMemo(
    () => filterEvents(busEvents as Partial<Record<MethodOption, CdcEvent[]>>),
    [filterEvents, busEvents, eventSearchSignature],
  );
  const combinedBusData = useMemo(() => {
    const list: CombinedBusEvent[] = [];
    const tables = new Set<string>();
    const txns = new Set<string>();

    activeMethods.forEach(method => {
      const events = busFilteredEventsByMethod.get(method) ?? [];
      events.forEach(event => {
        const table = event.table ?? "";
        if (table) tables.add(table);
        const txnId = event.tx?.id ?? null;
        if (txnId) txns.add(txnId);
        list.push({ method, event: event as BusEvent });
      });
    });

    list.sort((a, b) => {
      const offsetA = a.event.offset ?? a.event.seq ?? 0;
      const offsetB = b.event.offset ?? b.event.seq ?? 0;
      if (offsetA !== offsetB) return offsetA - offsetB;
      return (a.event.ts_ms ?? 0) - (b.event.ts_ms ?? 0);
    });

    return {
      events: list,
      tables: Array.from(tables).sort(),
      txns: Array.from(txns).sort(),
    };
  }, [activeMethods, busFilteredEventsByMethod]);
  const combinedBusEvents = combinedBusData.events;
  const availableEventLogTables = combinedBusData.tables;
  const availableEventLogTxns = combinedBusData.txns;
  const filteredCombinedBusEvents = useMemo(() => {
    return combinedBusEvents.filter(({ method, event }) => {
      if (eventLogMethod && method !== eventLogMethod) return false;
      if (eventLogTable && (event.table ?? "") !== eventLogTable) return false;
      if (eventLogTxn && (event.tx?.id ?? "") !== eventLogTxn) return false;
      return true;
    });
  }, [combinedBusEvents, eventLogMethod, eventLogTable, eventLogTxn]);
  const eventLogRows = useMemo<EventLogRow[]>(() => {
    return filteredCombinedBusEvents.map(({ method, event }, index) => {
      const offset = typeof event.offset === "number" ? event.offset : null;
      const seq = typeof event.seq === "number" ? event.seq : null;
      const ts = typeof event.ts_ms === "number" ? event.ts_ms : null;
      const idParts = [
        method,
        offset != null ? `offset-${offset}` : null,
        seq != null ? `seq-${seq}` : null,
        ts != null ? `ts-${ts}` : null,
        index,
      ].filter(Boolean);
      const pk = event.pk?.id != null ? String(event.pk.id) : null;
      return {
        id: idParts.length ? idParts.join("|") : `${method}-${index}`,
        methodId: method,
        methodLabel: METHOD_COPY[method].label,
        op: event.op ?? "",
        offset,
        topic: event.topic ?? null,
        table: event.table ?? null,
        tsMs: ts,
        pk,
        txnId: event.tx?.id ?? null,
        before: event.before ?? null,
        after: event.after ?? null,
      };
    });
  }, [filteredCombinedBusEvents]);
  const eventLogFilters = useMemo<EventLogFilters>(
    () => ({
      methodId: eventLogMethod ?? undefined,
      table: eventLogTable ?? undefined,
      txnId: eventLogTxn ? eventLogTxn : undefined,
    }),
    [eventLogMethod, eventLogTable, eventLogTxn],
  );
  const eventLogFilterOptions = useMemo(
    () => ({
      methods: METHOD_ORDER.map(method => ({ id: method, label: METHOD_COPY[method].label })),
      tables: availableEventLogTables,
      txns: availableEventLogTxns,
    }),
    [availableEventLogTables, availableEventLogTxns],
  );
  const isPlayingRef = useRef(isPlaying);

  useEffect(() => {
    if (eventLogMethod && !activeMethods.includes(eventLogMethod)) {
      setEventLogMethod(null);
    }
  }, [activeMethods, eventLogMethod]);

  useEffect(() => {
    if (eventLogTable && !availableEventLogTables.includes(eventLogTable)) {
      setEventLogTable(null);
    }
  }, [availableEventLogTables, eventLogTable]);

  useEffect(() => {
    if (eventLogTxn && !availableEventLogTxns.includes(eventLogTxn)) {
      setEventLogTxn("");
    }
  }, [availableEventLogTxns, eventLogTxn]);

  const userSelectedScenarioRef = useRef(storedPrefs?.userPinnedScenario ?? false);

  const scenarioOptions = useMemo(() => {
    const list = [...SCENARIOS];
    if (liveScenario) {
      const existingIndex = list.findIndex(option => option.name === liveScenario.name);
      if (existingIndex >= 0) {
        list.splice(existingIndex, 1, liveScenario);
      } else {
        list.unshift(liveScenario);
      }
    }
    const query = scenarioFilter.trim().toLowerCase();
    return list.filter(option => {
      if (option.name === LIVE_SCENARIO_NAME) return true;
      if (scenarioTags.length) {
        const optionTags = option.tags || [];
        if (!scenarioTags.every(tag => optionTags.includes(tag))) return false;
      }
      if (!query) return true;
      const haystack = [option.label, option.description, option.highlight, option.name, (option.tags || []).join(" ")]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [liveScenario, scenarioFilter, scenarioTags]);

  const scenario = useMemo(() => {
    if (!scenarioOptions.length) return SCENARIOS[0];
    return scenarioOptions.find(s => s.name === scenarioId) ?? scenarioOptions[0];
  }, [scenarioId, scenarioOptions]);

  useEffect(() => {
    if (!summaryCopied) return;
    const timer = window.setTimeout(() => setSummaryCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [summaryCopied]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      track("comparator.event.search", {
        scenario: scenario.name,
        query: eventSearch,
        hasQuery: Boolean(eventSearch.trim()),
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [eventSearch, scenario.name]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    if (!scenarioOptions.length) return;
    if (!scenarioOptions.some(option => option.name === scenarioId)) {
      userSelectedScenarioRef.current = false;
      setScenarioId(scenarioOptions[0].name);
    }
  }, [scenarioId, scenarioOptions]);
  useEffect(() => {
    if (!summaryCopied) return;
    const timer = window.setTimeout(() => setSummaryCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [summaryCopied]);


  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler: EventListener = event => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as { query?: string; tags?: string[] } | undefined;
      const query = detail?.query ?? "";
      const tags = Array.isArray(detail?.tags) ? detail.tags.map(String) : [];
      setScenarioFilter(String(query));
      setScenarioTags(tags);
    };

    window.addEventListener("cdc:scenario-filter" as string, handler);
    window.dispatchEvent(new CustomEvent("cdc:scenario-filter-request"));

    return () => {
      window.removeEventListener("cdc:scenario-filter" as string, handler);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler: EventListener = event => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as WorkspaceBroadcastDetail | undefined;
      if (!detail || !detail.scenario) {
        setLiveScenario(null);
        return;
      }

      const ops = Array.isArray(detail.scenario.ops) ? detail.scenario.ops : [];
      const label = detail.scenario.label ?? "Workspace (live)";
      const description = detail.scenario.description ?? `${ops.length} operations`;
      const seed = detail.scenario.seed ?? 1;

      setLiveScenario({
        name: LIVE_SCENARIO_NAME,
        label,
        description,
        seed,
        ops,
      });
    };

    window.addEventListener("cdc:workspace-update" as string, handler);
    window.dispatchEvent(new CustomEvent("cdc:workspace-request"));

    return () => {
      window.removeEventListener("cdc:workspace-update" as string, handler);
    };
  }, []);

  useEffect(() => {
    if (!liveScenario) return;
    if (!liveScenario.ops.length) return;
    if (userSelectedScenarioRef.current) return;
    setScenarioId(LIVE_SCENARIO_NAME);
  }, [liveScenario]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler: EventListener = event => {
      if (!(event instanceof CustomEvent)) return;
      const prefs = event.detail as ComparatorPreferences | null;
      if (!prefs) {
        userSelectedScenarioRef.current = false;
        return;
      }

      if (prefs.userPinnedScenario != null) {
        userSelectedScenarioRef.current = Boolean(prefs.userPinnedScenario);
      }

      if (prefs.activeMethods) {
        setActiveMethods(sanitizeActiveMethods(prefs.activeMethods));
      }

      if (prefs.methodConfig) {
        setMethodConfig(sanitizeMethodConfig(prefs.methodConfig));
      }

      if (prefs.scenarioId) {
        setScenarioId(prefs.scenarioId);
      }
    };

    window.addEventListener("cdc:comparator-preferences-set" as string, handler);
    return () => {
      window.removeEventListener("cdc:comparator-preferences-set" as string, handler);
    };
  }, []);

  useEffect(() => {
    savePreferences({
      scenarioId,
      activeMethods,
      methodConfig,
      userPinnedScenario: userSelectedScenarioRef.current,
      showEventList,
      eventOps: eventOpsArray,
      eventSearch,
      eventLogTable,
      eventLogTxn,
      eventLogMethod,
    });
  }, [
    scenarioId,
    activeMethods,
    methodConfig,
    showEventList,
    eventOpsArray,
    eventSearch,
    eventLogTable,
    eventLogTxn,
    eventLogMethod,
  ]);

  const runnerRef = useRef<ScenarioRunner | null>(null);
  const timerRef = useRef<number | null>(null);

  const stopLoop = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const drainQueues = useCallback(() => {
    if (isConsumerPaused) return;
    const additions: Partial<Record<MethodOption, CdcEvent[]>> = {};
    for (const method of activeMethods) {
      const runtime = laneRuntimeRef.current[method];
      if (!runtime) continue;
      const batch = runtime.bus.consume(runtime.topic, 50);
      if (!batch.length) continue;
      runtime.metrics.onConsumed(batch);
      const converted = batch.map(event => {
        const seq = (event as unknown as { __seq?: number }).__seq ?? 0;
        return eventToCdcEvent(method, event, seq);
      });
      updateLaneSnapshot(method);
      additions[method] = converted;
    }

    if (Object.keys(additions).length === 0) return;

    setLaneEvents(prev => {
      const next = { ...prev };
      for (const [methodKey, events] of Object.entries(additions) as [MethodOption, CdcEvent[]][]) {
        const existing = next[methodKey] ?? [];
        next[methodKey] = [...existing, ...events];
      }
      return next;
    });
  }, [activeMethods, isConsumerPaused, updateLaneSnapshot]);

  const startLoop = useCallback(() => {
    stopLoop();
    timerRef.current = window.setInterval(() => {
      runnerRef.current?.tick(STEP_MS);
      drainQueues();
    }, STEP_MS);
  }, [stopLoop, drainQueues]);

  useEffect(() => {
    if (!isConsumerPaused) {
      drainQueues();
    }
  }, [isConsumerPaused, drainQueues]);

  useEffect(() => {
    setLaneEvents(emptyEventMap<CdcEvent>(activeMethods));
    setBusEvents(emptyEventMap<BusEvent>(activeMethods));
    laneRuntimeRef.current = {};
    setClock(0);
    setIsPlaying(false);
    stopLoop();

    const runner = new ScenarioRunner();
    const unsubscribes: Array<() => void> = [];
    const runtimes: Partial<Record<MethodOption, LaneRuntime>> = {};

    const engines = activeMethods.map(method => {
      const engine = createEngine(method, events => handleProduced(method, events));
      if (method === "polling") {
        const config = methodConfig.polling;
        engine.configure({
          poll_interval_ms: config.pollIntervalMs,
          include_soft_deletes: config.includeSoftDeletes,
        });
      } else if (method === "trigger") {
        const config = methodConfig.trigger;
        engine.configure({
          extract_interval_ms: config.extractIntervalMs,
          trigger_overhead_ms: config.triggerOverheadMs,
        });
      } else {
        const config = methodConfig.log;
        engine.configure({
          fetch_interval_ms: config.fetchIntervalMs,
        });
      }

      const runtime: LaneRuntime = {
        bus: engine.bus,
        metrics: engine.metrics,
        topic: engine.topic,
      };
      runtimes[method] = runtime;

      const unsubscribe = engine.onEvent(event => {
        setLaneEvents(prev => {
          const next = { ...prev };
          const existing = next[method] ?? [];
          next[method] = [...existing, event];
          return next;
        });
      });
      unsubscribes.push(unsubscribe);
      return engine;
    });

    laneRuntimeRef.current = runtimes;
    activeMethods.forEach(method => updateLaneSnapshot(method, { lastOffset: -1 }));

    runner.attach(engines);
    runner.load(scenario);
    runner.reset(scenario.seed);
    runner.onTick(now => setClock(now));

    runnerRef.current = runner;

    return () => {
      runner.pause();
      stopLoop();
      unsubscribes.forEach(unsub => unsub());
    };
  }, [activeMethods, scenario, stopLoop, methodConfig, updateLaneSnapshot, handleProduced]);

  const toggleMethod = useCallback((method: MethodOption) => {
    setActiveMethods(prev => {
      if (prev.includes(method)) {
        if (prev.length <= MIN_LANES) return prev;
        return prev.filter(item => item !== method);
      }
      const next = [...prev, method];
      return METHOD_ORDER.filter(item => next.includes(item));
    });
  }, []);

  const toggleEventOp = useCallback((op: EventOp) => {
    setActiveEventOps(prev => {
      const next = new Set(prev);
      let changed = false;
      if (next.has(op)) {
        if (next.size > 1) {
          next.delete(op);
          changed = true;
        }
      } else {
        next.add(op);
        changed = true;
      }
      if (changed) {
        track("comparator.event.filter", {
          scenario: scenario.name,
          op,
          active: next.has(op),
        });
      }
      return changed ? next : prev;
    });
  }, [scenario.name]);

  const handleEventSearchChange = useCallback((value: string) => {
    setEventSearch(value);
  }, []);

  const handleToggleEventList = useCallback(() => {
    setShowEventList(prev => {
      const next = !prev;
      track("comparator.panel.layout", { scenario: scenario.name, showEvents: next });
      return next;
    });
  }, [scenario.name]);

  const handleEventLogFiltersChange = useCallback(
    (next: EventLogFilters) => {
      if (next.methodId && isMethodOption(next.methodId)) {
        setEventLogMethod(next.methodId);
      } else {
        setEventLogMethod(null);
      }
      setEventLogTable(next.table ?? null);
      setEventLogTxn(next.txnId ?? "");
    },
    [setEventLogMethod, setEventLogTable, setEventLogTxn],
  );

  const handleDownloadEventLog = useCallback(() => {
    if (filteredCombinedBusEvents.length === 0) return;
    const payload = filteredCombinedBusEvents.map(({ method, event }) =>
      JSON.stringify({
        method,
        offset: event.offset ?? null,
        seq: event.seq,
        ts_ms: event.ts_ms,
        op: event.op,
        pk: event.pk,
        table: event.table,
        before: event.before,
        after: event.after,
        topic: event.topic,
      }),
    );
    const blob = new Blob([payload.join("\n")], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${scenario.name}-event-log.ndjson`;
    anchor.click();
    URL.revokeObjectURL(url);
    track("comparator.event.download", {
      scenario: scenario.name,
      events: filteredCombinedBusEvents.length,
    });
  }, [filteredCombinedBusEvents, scenario.name]);

  const handleClearEventLog = useCallback(() => {
    setBusEvents(prev => {
      const next: Partial<Record<MethodOption, BusEvent[]>> = { ...prev };
      activeMethods.forEach(method => {
        next[method] = [];
      });
      return next;
    });
    eventSearchCacheRef.current = new WeakMap();
    track("comparator.event.clear", { scenario: scenario.name });
  }, [activeMethods, scenario.name]);

  const handleCopyEvent = useCallback(
    (row: EventLogRow) => {
      const payload = JSON.stringify(
        {
          method: row.methodId ?? null,
          methodLabel: row.methodLabel ?? null,
          op: row.op,
          offset: row.offset ?? null,
          topic: row.topic ?? null,
          table: row.table ?? null,
          ts_ms: row.tsMs ?? null,
          pk: row.pk ?? null,
          txnId: row.txnId ?? null,
          before: row.before ?? null,
          after: row.after ?? null,
        },
        null,
        2,
      );
      navigator.clipboard
        .writeText(payload)
        .then(() =>
          track("comparator.event.copy", {
            scenario: scenario.name,
            method: row.methodId ?? null,
            op: row.op,
            offset: row.offset ?? null,
          }),
        )
        .catch(() => {
          track("comparator.event.copy.error", {
            scenario: scenario.name,
            method: row.methodId ?? null,
          });
        });
    },
    [scenario.name],
  );

  const handleScenarioSelect = useCallback((value: string) => {
    userSelectedScenarioRef.current = true;
    setScenarioId(value);
    track("comparator.scenario.select", { scenario: value });
  }, []);

  const handleScenarioDownload = useCallback((target: ShellScenario) => {
    const payload = {
      name: target.name,
      label: target.label,
      description: target.description,
      highlight: target.highlight,
      seed: target.seed,
      ops: target.ops,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${target.name}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }, []);

  const handleScenarioPreview = useCallback((target: ShellScenario) => {
    track("comparator.scenario.preview", { scenario: target.name, tags: target.tags ?? [] });
    window.dispatchEvent(
      new CustomEvent("cdc:preview-scenario", {
        detail: target,
      }),
    );
  }, []);

  const laneMetrics: LaneMetrics[] = useMemo(() => {
    return activeMethods.map(method => {
      const events = laneEvents[method] ?? [];
      return {
        method,
        events,
        metrics: computeMetrics(events, clock, scenario, method, laneStats),
      };
    });
  }, [activeMethods, clock, laneEvents, scenario, laneStats]);

  const scenarioDeleteCount = useMemo(
    () => scenario.ops.filter(op => op.op === "delete").length,
    [scenario.ops],
  );

  const laneRuntimeSummaries = useMemo(() => {
    return activeMethods.reduce((map, method) => {
      const stats = laneStats[method];
      const consumedEvents = laneEvents[method] ?? [];
      const capturedDeletes = consumedEvents.filter(evt => evt.op === "d").length;
      const summary: LaneRuntimeSummary = {
        backlog: stats?.backlog ?? 0,
        lastOffset: stats?.lastOffset ?? -1,
        produced: stats?.metrics.produced ?? 0,
        consumed: stats?.metrics.consumed ?? 0,
        lagMsP50: stats?.metrics.lagMsP50 ?? 0,
        lagMsP95: stats?.metrics.lagMsP95 ?? 0,
        missedDeletes: Math.max(scenarioDeleteCount - capturedDeletes, 0),
        writeAmplification: stats?.metrics.writeAmplification ?? 0,
      };
      map.set(method, summary);
      return map;
    }, new Map<MethodOption, LaneRuntimeSummary>());
  }, [activeMethods, laneEvents, laneStats, scenarioDeleteCount]);

  const totalBacklog = useMemo(
    () =>
      activeMethods.reduce(
        (sum, method) => sum + (laneRuntimeSummaries.get(method)?.backlog ?? 0),
        0,
      ),
    [activeMethods, laneRuntimeSummaries],
  );

  const aggregateEventBusTotals = useMemo(
    () => {
      if (!eventBusEnabled) {
        return { produced: 0, consumed: 0, backlog: 0 };
      }
      return activeMethods.reduce(
        (acc, method) => {
          const summary = laneRuntimeSummaries.get(method);
          if (!summary) return acc;
          acc.produced += summary.produced;
          acc.consumed += summary.consumed;
          acc.backlog += summary.backlog;
          return acc;
        },
        { produced: 0, consumed: 0, backlog: 0 },
      );
    },
    [activeMethods, laneRuntimeSummaries, eventBusEnabled],
  );

  const summary = computeSummary(laneMetrics);
  const totalEvents = useMemo(
    () => laneMetrics.reduce((sum, lane) => sum + lane.events.length, 0),
    [laneMetrics],
  );
  const analytics = useMemo(() => {
    return laneMetrics.map(({ method, events }) => {
      let inserts = 0;
      let updates = 0;
      let deletes = 0;
      events.forEach(evt => {
        if (evt.op === 'c') inserts += 1;
        else if (evt.op === 'u') updates += 1;
        else if (evt.op === 'd') deletes += 1;
      });
      return {
        method,
        label: METHOD_COPY[method].label,
        total: events.length,
        inserts,
        updates,
        deletes,
      };
    });
  }, [laneMetrics]);

  const laneDiffs = useMemo(() => {
    const map = new Map<MethodOption, LaneDiffResult>();
    laneMetrics.forEach(({ method, events }) => {
      map.set(method, diffLane(method, scenario.ops, events));
    });
    return map;
  }, [laneMetrics, scenario.ops]);

  const metricsDashboardLanes = useMemo(() =>
    activeMethods.map(method => {
      const runtimeSummary = laneRuntimeSummaries.get(method);
      return {
        id: method,
        label: METHOD_COPY[method].label,
        produced: runtimeSummary?.produced ?? 0,
        consumed: runtimeSummary?.consumed ?? 0,
        backlog: runtimeSummary?.backlog ?? 0,
        lagP50: runtimeSummary?.lagMsP50 ?? 0,
        lagP95: runtimeSummary?.lagMsP95 ?? 0,
        missedDeletes: runtimeSummary?.missedDeletes,
        writeAmplification: runtimeSummary?.writeAmplification,
      };
    }),
  [activeMethods, laneRuntimeSummaries]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("cdc:consumer-paused", {
        detail: {
          paused: isConsumerPaused,
          backlog: totalBacklog,
        },
      }),
    );
  }, [isConsumerPaused, totalBacklog]);

  const handleCopySummary = useCallback(() => {
    if (!summary) return;
    const parts: string[] = [];
    parts.push(`${scenario.label}: ${scenario.description}`);
    parts.push(`Methods: ${activeMethods.map(method => METHOD_COPY[method].label).join(", ")}`);
    if (summary.bestLag) {
      parts.push(`Fastest ${METHOD_COPY[summary.bestLag.method].label} at ${Math.round(summary.bestLag.metrics.lagMs)}ms`);
    }
    if (summary.lagSpread > 0) {
      parts.push(`${METHOD_COPY[summary.worstLag.method].label} trails by ${Math.round(summary.lagSpread)}ms`);
    }
    parts.push(`Lowest delete capture: ${METHOD_COPY[summary.lowestDeletes.method].label} (${Math.round(summary.lowestDeletes.metrics.deletesPct)}%)`);
    if (summary.triggerWriteAmplification) {
      parts.push(
        `Trigger write amplification: ${METHOD_COPY[summary.triggerWriteAmplification.method].label} ${(summary.triggerWriteAmplification.metrics.writeAmplification ?? 0).toFixed(1)}x`,
      );
    }
    parts.push(`Ordering: ${summary.orderingIssues.length ? summary.orderingIssues.map(method => METHOD_COPY[method].label).join(", ") : "All lanes aligned"}`);
    if (scenario.tags?.length) parts.push(`Tags: ${scenario.tags.join(', ')}`);
    navigator.clipboard
      .writeText(parts.join('\n'))
      .then(() => setSummaryCopied(true))
      .catch(() => setSummaryCopied(false));
    track("comparator.summary.copied", {
      scenario: scenario.name,
      tags: scenario.tags ?? [],
      methods: activeMethods,
    });
  }, [summary, scenario, activeMethods]);
  const updateMethodConfig = useCallback(<T extends MethodOption, K extends keyof MethodConfigMap[T]>(
    method: T,
    key: K,
    value: MethodConfigMap[T][K],
  ) => {
    setMethodConfig(prev => ({
      ...prev,
      [method]: {
        ...prev[method],
        [key]: value,
      },
    }));
  }, []);

  const resetRunnerState = useCallback(
    (options?: { keepLoop?: boolean }) => {
      const runner = runnerRef.current;
      if (!runner) return;

      runner.reset(scenario.seed);
      setLaneEvents(emptyEventMap<CdcEvent>(activeMethods));
      setBusEvents(emptyEventMap<BusEvent>(activeMethods));
      for (const method of activeMethods) {
        const runtime = laneRuntimeRef.current[method];
        if (!runtime) continue;
        runtime.bus.reset(runtime.topic);
        runtime.metrics.reset();
        updateLaneSnapshot(method, { lastOffset: -1 });
      }
      setClock(0);

      if (!options?.keepLoop) {
        runner.pause();
        setIsPlaying(false);
        stopLoop();
      }
    },
    [activeMethods, scenario.seed, stopLoop, updateLaneSnapshot],
  );

  const handleStart = useCallback(() => {
    const runner = runnerRef.current;
    if (!runner) return;

    resetRunnerState({ keepLoop: true });
    runner.start();
    setIsPlaying(true);
    startLoop();
    trackClockControl("play", { scenario: scenario.name });
  }, [resetRunnerState, startLoop, scenario.name]);

  const handlePause = useCallback(() => {
    runnerRef.current?.pause();
    setIsPlaying(false);
    stopLoop();
    trackClockControl("pause", { scenario: scenario.name });
  }, [stopLoop, scenario.name]);

  const handleToggleConsumer = useCallback(() => {
    if (!pauseResumeEnabled) return;
    setIsConsumerPaused(prev => {
      const next = !prev;
      track("comparator.consumer.toggle", { scenario: scenario.name, paused: next });
      if (!next) {
        drainQueues();
      }
      return next;
    });
  }, [drainQueues, pauseResumeEnabled, scenario.name]);

  const handleStep = useCallback(
    (deltaMs = STEP_MS) => {
      const runner = runnerRef.current;
      if (!runner) return;

      const wasPlaying = isPlayingRef.current;
      if (!wasPlaying) {
        runner.start();
      }

      runner.tick(deltaMs);

      if (!wasPlaying) {
        runner.pause();
      }
      trackClockControl("step", { deltaMs, scenario: scenario.name });
    },
    [scenario.name],
  );

  const handleSeek = useCallback(
    (targetMs: number, stepMs?: number) => {
      const runner = runnerRef.current;
      if (!runner) return;

      const stepSize = Math.max(10, stepMs ?? STEP_MS);
      resetRunnerState({ keepLoop: false });
      const ceiling = Math.max(targetMs, 0);
      runner.start();

      let elapsed = 0;
      let safety = 0;
      while (elapsed < ceiling && safety < 10_000) {
        const delta = Math.min(stepSize, ceiling - elapsed);
        runner.tick(delta);
        elapsed += delta;
        safety += 1;
      }

      runner.pause();
      setIsPlaying(false);
      trackClockControl("seek", { targetMs, stepMs, scenario: scenario.name });
    },
    [resetRunnerState, scenario.name],
  );

  const handleReset = useCallback(() => {
    resetRunnerState();
    trackClockControl("reset", { scenario: scenario.name });
  }, [resetRunnerState, scenario.name]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const api = {
      play: () => handleStart(),
      pause: () => handlePause(),
      step: (deltaMs?: number) => handleStep(deltaMs),
      seek: (timeMs: number, stepMs?: number) => handleSeek(timeMs, stepMs),
      reset: () => handleReset(),
    } as const;

    (window as any).cdcComparatorClock = api;

    const handler: EventListener = event => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as ClockControlCommand | undefined;
      if (!detail) return;

      switch (detail.type) {
        case "play":
          api.play();
          break;
        case "pause":
          api.pause();
          break;
        case "step":
          api.step(detail.deltaMs);
          break;
        case "seek":
          api.seek(detail.timeMs, detail.stepMs);
          break;
        case "reset":
          api.reset();
          break;
        default:
          break;
      }
    };

    window.addEventListener("cdc:comparator-clock" as string, handler);

    return () => {
      window.removeEventListener("cdc:comparator-clock" as string, handler);
      if ((window as any).cdcComparatorClock === api) {
        delete (window as any).cdcComparatorClock;
      }
    };
  }, [handlePause, handleReset, handleSeek, handleStart, handleStep]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("cdc:comparator-clock-tick", {
        detail: { clock },
      }),
    );
  }, [clock]);

  useEffect(() => () => stopLoop(), [stopLoop]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const summaryDetail = summary
      ? {
          lagSpread: summary.lagSpread,
          bestLag: {
            method: summary.bestLag.method,
            label: METHOD_COPY[summary.bestLag.method].label,
            metrics: summary.bestLag.metrics,
          },
          worstLag: {
            method: summary.worstLag.method,
            label: METHOD_COPY[summary.worstLag.method].label,
            metrics: summary.worstLag.metrics,
          },
          lowestDeletes: {
            method: summary.lowestDeletes.method,
            label: METHOD_COPY[summary.lowestDeletes.method].label,
            metrics: summary.lowestDeletes.metrics,
          },
          highestDeletes: {
            method: summary.highestDeletes.method,
            label: METHOD_COPY[summary.highestDeletes.method].label,
            metrics: summary.highestDeletes.metrics,
          },
          orderingIssues: summary.orderingIssues.map(method => ({
            method,
            label: METHOD_COPY[method].label,
          })),
          triggerWriteAmplification: summary.triggerWriteAmplification
            ? {
                method: summary.triggerWriteAmplification.method,
                label: METHOD_COPY[summary.triggerWriteAmplification.method].label,
                value: summary.triggerWriteAmplification.metrics.writeAmplification ?? 0,
              }
            : null,
        }
      : null;

    const lanesDetail = laneMetrics.map(({ method, metrics }) => ({
      method,
      label: METHOD_COPY[method].label,
      metrics,
    }));

    const diffsDetail = laneMetrics.map(({ method }) => {
      const diff = laneDiffs.get(method);
      if (!diff) {
        return {
          method,
          totals: { missing: 0, extra: 0, ordering: 0 },
          issues: [],
          lag: { max: 0, samples: [] },
        };
      }
      return {
        method,
        totals: diff.totals,
        issues: diff.issues.slice(0, 25),
        lag: diff.lag,
      };
    });

    window.dispatchEvent(
      new CustomEvent("cdc:comparator-summary", {
        detail: {
          scenarioName: scenario.name,
          scenarioLabel: scenario.label,
          scenarioDescription: scenario.description,
          isLive: scenario.name === LIVE_SCENARIO_NAME,
          totalEvents,
          summary: summaryDetail,
          lanes: lanesDetail,
          analytics,
          tags: scenarioTags,
          diffs: diffsDetail,
        },
      }),
    );
  }, [laneMetrics, scenario, summary, totalEvents, analytics, scenarioTags, laneDiffs]);

  return (
    <section className="sim-shell" aria-label="Simulator preview">
      <header className="sim-shell__header">
        <div>
          <h2 className="sim-shell__title">CDC Method Comparator</h2>
          <p className="sim-shell__description">
            Load a deterministic scenario and contrast Polling, Trigger, and Log-based CDC side by side.
          </p>
        </div>
        <div className="sim-shell__actions sim-shell__actions--scenario" role="group" aria-label="Scenario controls">
          <select
            aria-label="Scenario"
            value={scenarioId}
            onChange={event => handleScenarioSelect(event.target.value)}
          >
            {scenarioOptions.map(option => (
              <option key={option.name} value={option.name}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="sim-shell__scenario-actions">
            <button
              type="button"
              className="sim-shell__scenario-sync"
              onClick={() => {
                if (scenario.name === LIVE_SCENARIO_NAME) return;
                window.dispatchEvent(
                  new CustomEvent("cdc:apply-scenario-template", {
                    detail: { id: scenario.name },
                  }),
                );
              }}
              disabled={scenario.name === LIVE_SCENARIO_NAME}
            >
              Load in workspace
            </button>
            <button
              type="button"
              className="sim-shell__scenario-download"
              onClick={() => handleScenarioDownload(scenario)}
            >
              Download JSON
            </button>
            <button
              type="button"
              className="sim-shell__scenario-preview"
              onClick={() => handleScenarioPreview(scenario)}
            >
              Preview
            </button>
          </div>
          <div className="sim-shell__method-toggle" role="group" aria-label="Methods to display">
            {METHOD_ORDER.map(method => (
              <button
                key={method}
                type="button"
                className="sim-shell__method-chip"
                aria-pressed={activeMethods.includes(method)}
                onClick={() => toggleMethod(method)}
              >
                {METHOD_COPY[method].label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <p className="sim-shell__description" aria-live="polite">
        <strong>{scenario.label}:</strong> {scenario.description}
      </p>
      {scenario.highlight && (
        <p className="sim-shell__description sim-shell__description--highlight" aria-live="polite">
          {scenario.highlight}
        </p>
      )}
      {scenario.tags?.length ? (
        <div className="sim-shell__tag-row" aria-label="Scenario tags">
          {scenario.tags.map(tag => (
            <span key={tag} className="sim-shell__tag-chip">#{tag}</span>
          ))}
        </div>
      ) : null}
      {scenario.stats && (
        <p className="sim-shell__description sim-shell__description--meta" aria-live="polite">
          {scenario.stats.rows} rows · {scenario.stats.ops} ops
        </p>
      )}

      <div className="sim-shell__event-filters" role="group" aria-label="Event filters">
        {isConsumerPaused && (
          <div className="sim-shell__pause-banner" role="status" aria-live="polite">
            Apply paused. Resume to drain the event bus.
          </div>
        )}
        <label className="sim-shell__event-search">
          <span>Search events</span>
          <input
            type="search"
            value={eventSearch}
            onChange={event => handleEventSearchChange(event.target.value)}
            placeholder="Filter by pk, seq, or payload"
          />
        </label>
        <div className="sim-shell__event-ops" role="group" aria-label="Change operations">
          {(["c", "u", "d"] as EventOp[]).map(op => (
            <button
              key={op}
              type="button"
              className="sim-shell__event-op"
              data-active={eventOpsSet.has(op) ? "true" : "false"}
              onClick={() => toggleEventOp(op)}
            >
              {op.toUpperCase()}
            </button>
          ))}
        </div>
        <button type="button" className="sim-shell__event-toggle" onClick={handleToggleEventList}>
          {showEventList ? "Hide timeline" : "Show timeline"}
        </button>
      </div>

      {eventLogEnabled && (
        <EventLog
          className="sim-shell__event-log"
          events={eventLogRows}
          stats={aggregateEventBusTotals}
          totalCount={combinedBusEvents.length}
          filters={eventLogFilters}
          filterOptions={eventLogFilterOptions}
          onFiltersChange={handleEventLogFiltersChange}
          onDownload={handleDownloadEventLog}
          onClear={handleClearEventLog}
          onCopyEvent={handleCopyEvent}
          maxVisibleEvents={MAX_EVENT_LOG_ROWS}
        />
      )}

      <div
        className="sim-shell__actions"
        role="group"
        aria-label="Playback controls"
        data-tour-target="comparator-actions"
      >
        <button type="button" onClick={handleStart} disabled={isPlaying}>
          Start
        </button>
        <button type="button" onClick={handlePause} disabled={!isPlaying}>
          Pause
        </button>
        <button type="button" onClick={() => handleStep()}>
          Step +{STEP_MS}ms
        </button>
        {pauseResumeEnabled && (
          <button type="button" onClick={handleToggleConsumer} className="sim-shell__consumer-toggle">
            {isConsumerPaused ? "Resume apply" : "Pause apply"}
            {eventBusEnabled ? ` (${totalBacklog} queued)` : ""}
          </button>
        )}
      </div>

      <div className="sim-shell__controls" aria-label="Method tuning controls">
        {METHOD_ORDER.map(method => {
          const active = activeMethods.includes(method);

          if (method === "polling") {
            const config = methodConfig.polling;
            return (
              <fieldset
                key={method}
                className="sim-shell__control-card"
                aria-labelledby={`control-${method}`}
                data-active={active ? "true" : "false"}
              >
                <legend id={`control-${method}`}>{METHOD_COPY[method].label}</legend>
                <p className="sim-shell__control-copy">Adjust poll cadence and whether soft deletes are surfaced.</p>
                {querySliderEnabled ? (
                  <>
                    <label className="sim-shell__control-field">
                      <span>Poll interval ({(config.pollIntervalMs / 1000).toFixed(1)}s)</span>
                      <input
                        type="range"
                        min={500}
                        max={10000}
                        step={100}
                        value={config.pollIntervalMs}
                        onChange={event =>
                          updateMethodConfig(
                            "polling",
                            "pollIntervalMs",
                            Math.min(10000, Math.max(500, Number(event.target.value) || 500)),
                          )
                        }
                      />
                    </label>
                    <p className="sim-shell__control-hint">⏱️ Polling every {(config.pollIntervalMs / 1000).toFixed(1)}s</p>
                  </>
                ) : (
                  <label className="sim-shell__control-field">
                    <span>Poll interval (ms)</span>
                    <input
                      type="number"
                      min={100}
                      step={100}
                      value={config.pollIntervalMs}
                      onChange={event =>
                        updateMethodConfig(
                          "polling",
                          "pollIntervalMs",
                          Math.min(10000, Math.max(100, Number(event.target.value) || 500)),
                        )
                      }
                    />
                  </label>
                )}
                <label className="sim-shell__control-checkbox">
                  <input
                    type="checkbox"
                    checked={config.includeSoftDeletes}
                    onChange={event => updateMethodConfig("polling", "includeSoftDeletes", event.target.checked)}
                  />
                  <span>Include soft delete marker column</span>
                </label>
              </fieldset>
            );
          }

          if (method === "trigger") {
            const config = methodConfig.trigger;
            return (
              <fieldset
                key={method}
                className="sim-shell__control-card"
                aria-labelledby={`control-${method}`}
                data-active={active ? "true" : "false"}
              >
                <legend id={`control-${method}`}>{METHOD_COPY[method].label}</legend>
                <p className="sim-shell__control-copy">Tune audit extractor cadence and per-write trigger overhead.</p>
                <label className="sim-shell__control-field">
                  <span>Extractor interval (ms)</span>
                  <input
                    type="number"
                    min={100}
                    step={50}
                    value={config.extractIntervalMs}
                    onChange={event =>
                      updateMethodConfig(
                        "trigger",
                        "extractIntervalMs",
                        Math.max(50, Number(event.target.value) || 0),
                      )
                    }
                  />
                </label>
                <label className="sim-shell__control-field">
                  <span>Trigger overhead (ms)</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={config.triggerOverheadMs}
                    onChange={event =>
                      updateMethodConfig(
                        "trigger",
                        "triggerOverheadMs",
                        Math.max(0, Number(event.target.value) || 0),
                      )
                    }
                  />
                </label>
              </fieldset>
            );
          }

          const config = methodConfig.log;
          return (
            <fieldset
              key={method}
              className="sim-shell__control-card"
              aria-labelledby={`control-${method}`}
              data-active={active ? "true" : "false"}
            >
              <legend id={`control-${method}`}>{METHOD_COPY[method].label}</legend>
              <p className="sim-shell__control-copy">Control how frequently the WAL/Binlog fetcher polls for new records.</p>
              <label className="sim-shell__control-field">
                <span>Fetch interval (ms)</span>
                <input
                  type="number"
                  min={10}
                  step={10}
                  value={config.fetchIntervalMs}
                  onChange={event =>
                    updateMethodConfig("log", "fetchIntervalMs", Math.max(10, Number(event.target.value) || 0))
                  }
                />
              </label>
            </fieldset>
          );
        })}
      </div>

      {summary && (
      <div className="sim-shell__summary" aria-live="polite">
        <ul>
          <li>
            <strong>Lag spread:</strong> {METHOD_COPY[summary.bestLag.method].label} is leading at
            {` ${summary.bestLag.metrics.lagMs.toFixed(0)}ms`}
            {summary.lagSpread > 0
              ? ` — ${METHOD_COPY[summary.worstLag.method].label} trails by ${summary.lagSpread.toFixed(0)}ms`
              : " (no spread)"}
          </li>
          <li>
            <strong>Delete capture:</strong> {METHOD_COPY[summary.lowestDeletes.method].label} is lowest at
            {` ${summary.lowestDeletes.metrics.deletesPct.toFixed(0)}%`} · best is {METHOD_COPY[summary.highestDeletes.method].label}
            {` (${summary.highestDeletes.metrics.deletesPct.toFixed(0)}%)`}
          </li>
          {summary.triggerWriteAmplification && (
            <li>
              <strong>Trigger overhead:</strong> {METHOD_COPY[summary.triggerWriteAmplification.method].label} is at
              {" "}
              {`${(summary.triggerWriteAmplification.metrics.writeAmplification ?? 0).toFixed(1)}x`} write amplification
            </li>
          )}
          <li>
            <strong>Ordering:</strong>
            {summary.orderingIssues.length === 0
              ? " All methods preserved ordering"
              : ` Issues: ${summary.orderingIssues.map(method => METHOD_COPY[method].label).join(", ")}`}
          </li>
        </ul>
          <button type="button" className="sim-shell__summary-copy" onClick={handleCopySummary}>
            {summaryCopied ? "Copied" : "Copy summary"}
          </button>
        </div>
      )}

      {metricsDashboardLanes.length > 0 && (
        <MetricsDashboard lanes={metricsDashboardLanes} />
      )}

      <div className="sim-shell__lane-grid" data-tour-target="comparator-lanes">
        {laneMetrics.map(({ method, metrics, events }, laneIndex) => {
          const copy = METHOD_COPY[method];
          const description = copy.laneDescription;
          const diff = laneDiffs.get(method) ?? null;
          const isPrimaryLane = laneIndex === 0;
          const runtimeSummary = laneRuntimeSummaries.get(method);
          const runtime = laneRuntimeRef.current[method];
          const writeAmplificationValue =
            method === "trigger"
              ? runtimeSummary?.writeAmplification ?? metrics.writeAmplification ?? 0
              : undefined;
          const callouts: Array<{ text: string; tone: "warning" | "info" }> = [];
          const tone = method === "polling" ? "warning" : "info";
          if (copy.callout) {
            if (method === "polling" && metrics.deletesPct < 100) {
              callouts.push({
                text: `${copy.callout} (${metrics.deletesPct.toFixed(0)}% of deletes captured in this scenario)`,
                tone,
              });
            } else {
              callouts.push({ text: copy.callout, tone });
            }
          }
          if (scenario.tags?.includes("schema")) {
            if (method === "trigger" && typeof writeAmplificationValue === "number" && writeAmplificationValue > 0) {
              callouts.push({
                text: `Write amplification ${writeAmplificationValue.toFixed(1)}x (extra audit writes per change)`,
                tone: "info",
              });
            }
            if (method === "log") {
              callouts.push({
                text: "Log capture streams schema changes in-order, keeping downstream versions aligned.",
                tone: "info",
              });
            }
            if (method === "polling") {
              callouts.push({
                text: "Polling picks up new columns once refreshed rows include them; expect interim nulls.",
                tone: "warning",
              });
            }
          }
          const filteredEvents = filteredEventsByMethod.get(method) ?? events;
          const filtered =
            filteredEvents.length !== events.length || eventSearchTerms.length > 0 || eventOpsSet.size < 3;
          const timelineTruncated = showEventList && filteredEvents.length > MAX_TIMELINE_EVENTS;
          const displayEvents = showEventList
            ? filteredEvents.slice(Math.max(filteredEvents.length - MAX_TIMELINE_EVENTS, 0))
            : [];
          return (
            <article key={method} className="sim-shell__lane-card">
              <header className="sim-shell__lane-header">
                <div>
                  <h3 className="sim-shell__lane-title">{copy.label}</h3>
                  <p className="sim-shell__lane-copy">{description}</p>
                </div>
                <span className="sim-shell__lane-count">
                  {filteredEvents.length}
                  {filtered ? ` / ${events.length}` : ""} events
                </span>
              </header>

              <div
                className="sim-shell__metrics"
                data-tour-target={isPrimaryLane ? "comparator-metrics" : undefined}
              >
                <MetricsStrip {...metrics} />
              </div>

              <LaneDiffOverlay diff={diff} scenarioName={scenario.name} />

              {eventBusEnabled && (
                <section
                  className="sim-shell__lane-bus"
                  aria-label={`${copy.label} event bus`}
                  data-paused={isConsumerPaused ? "true" : "false"}
                >
                  <header>
                    <h4>Event Bus</h4>
                    <span>{runtime?.topic ?? `cdc.${method}`}</span>
                  </header>
                  <p>
                    Backlog <strong>{runtimeSummary?.backlog ?? 0}</strong>
                    {isConsumerPaused ? " (apply paused)" : ""} · Last offset {runtimeSummary?.lastOffset ?? -1}
                  </p>
                  <p>
                    Produced {runtimeSummary?.produced ?? 0} · Consumed {runtimeSummary?.consumed ?? 0}
                  </p>
                  <p>
                    Lag p50 {Math.round(runtimeSummary?.lagMsP50 ?? 0)}ms · p95 {Math.round(runtimeSummary?.lagMsP95 ?? 0)}ms
                  </p>
                  {method === "trigger" && (
                    <p>
                      Write amplification: {writeAmplificationValue?.toFixed(1) ?? "0.0"}x
                    </p>
                  )}
                  {method === "polling" && (
                    <p className="sim-shell__lane-bus-warning">
                      Missed deletes: {runtimeSummary?.missedDeletes ?? 0}
                    </p>
                  )}
                </section>
              )}

              <dl className="sim-shell__lane-config">
                {method === "polling" && (() => {
                  const config = methodConfig.polling;
                  return (
                  <>
                  <div>
                    <dt>Poll interval</dt>
                    <dd data-tooltip="Lower intervals reduce lag but increase source load.">{config.pollIntervalMs} ms</dd>
                  </div>
                  <div>
                    <dt>Soft deletes</dt>
                    <dd data-tooltip="Include soft delete markers to surface tombstones." >{config.includeSoftDeletes ? "included" : "ignored"}</dd>
                  </div>
                </>
                  );
                })()}
              {method === "trigger" && (() => {
                const config = methodConfig.trigger;
                return (
                <>
                  <div>
                    <dt>Extractor interval</dt>
                    <dd data-tooltip="Longer intervals lower reader load but add latency.">{config.extractIntervalMs} ms</dd>
                  </div>
                  <div>
                    <dt>Trigger overhead</dt>
                    <dd data-tooltip="Injected synchronous latency per source write.">{config.triggerOverheadMs} ms</dd>
                  </div>
                  <div>
                    <dt>Write amplification</dt>
                    <dd data-tooltip="Additional audit writes compared to source operations.">
                      {writeAmplificationValue?.toFixed(1) ?? "0.0"}x
                    </dd>
                  </div>
                </>
                );
              })()}
              {method === "log" && (() => {
                const config = methodConfig.log;
                return (
                <div>
                  <dt>Fetch interval</dt>
                  <dd data-tooltip="Shorter intervals decrease lag but use more resources.">{config.fetchIntervalMs} ms</dd>
                </div>
                );
              })()}
              </dl>

              {callouts.length > 0 && (
                <div className="sim-shell__callouts">
                  {callouts.map((callout, index) => (
                    <p
                      key={`${method}-callout-${index}`}
                      className={`sim-shell__callout${callout.tone === "warning" ? " sim-shell__callout--warning" : ""}`}
                      data-tour-target={isPrimaryLane && index === 0 ? "comparator-callouts" : undefined}
                    >
                      {callout.text}
                    </p>
                  ))}
                </div>
              )}

              <section className="sim-shell__lane-why" aria-label={`When to use ${copy.label}`}>
                <h4>When to use</h4>
                <p>{copy.whenToUse}</p>
              </section>

              {showEventList ? (
                <ul className="sim-shell__event-list" aria-live="polite">
                  {timelineTruncated && (
                    <li className="sim-shell__event sim-shell__event--notice">
                      <span>Showing latest {MAX_TIMELINE_EVENTS} of {filteredEvents.length} matching events.</span>
                    </li>
                  )}
                  {displayEvents.length === 0 ? (
                    <li className="sim-shell__empty">
                      {filtered ? "No events match the current filters." : "No events yet."}
                    </li>
                  ) : (
                    displayEvents.map(event => (
                      <li
                        key={`${method}-${event.seq}`}
                        className={`sim-shell__event${event.op === "d" ? " sim-shell__event--delete" : ""}`}
                      >
                        <span className="sim-shell__event-op" data-op={event.op}>
                          {event.op}
                        </span>
                        <span>
                          #{event.seq} · pk={event.pk.id}
                        </span>
                        <span className="sim-shell__event-target">ts={event.ts_ms}ms</span>
                      </li>
                    ))
                  )}
                </ul>
              ) : (
                <p className="sim-shell__lane-hidden">Timeline hidden. Use “Show timeline” to view recent events.</p>
              )}
            </article>
          );
        })}
      </div>

      <footer className="sim-shell__footer">
        Scenario clock: {clock}ms · {laneMetrics.reduce((sum, lane) => sum + lane.events.length, 0)} total events emitted
      </footer>
    </section>
  );
}
