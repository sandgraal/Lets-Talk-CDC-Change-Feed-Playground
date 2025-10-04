import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CdcEvent, SourceOp } from "../sim";
import { LogEngine, PollingEngine, ScenarioRunner, TriggerEngine } from "../sim";
import { MetricsStrip } from "./components/MetricsStrip";
import { SCENARIOS, ShellScenario } from "./scenarios";
import "./styles/shell.css";

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
};

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

type ComparatorPreferences = {
  scenarioId?: string | null;
  activeMethods?: MethodOption[];
  methodConfig?: PartialMethodConfigMap;
  userPinnedScenario?: boolean;
};

type LaneMetrics = {
  method: MethodOption;
  metrics: Metrics;
  events: CdcEvent[];
};

type Summary = {
  bestLag: LaneMetrics;
  worstLag: LaneMetrics;
  lagSpread: number;
  lowestDeletes: LaneMetrics;
  highestDeletes: LaneMetrics;
  orderingIssues: MethodOption[];
};

const METHOD_LABELS: Record<MethodOption, string> = {
  polling: "Polling (Query)",
  trigger: "Trigger (Audit)",
  log: "Log (WAL)",
};

const METHOD_DESCRIPTIONS: Record<MethodOption, string> = {
  polling: "Periodic scans of source state. Fast to set up, but can miss deletes and rapid updates.",
  trigger: "Database triggers capture before/after into an audit table. Complete coverage, added write latency.",
  log: "Streams the transaction log for ordered, low-latency change events with minimal source impact.",
};

const DEFAULT_METHOD_CONFIG: MethodConfigMap = {
  polling: { pollIntervalMs: 500, includeSoftDeletes: false },
  trigger: { extractIntervalMs: 250, triggerOverheadMs: 8 },
  log: { fetchIntervalMs: 50 },
};

function createEngine(method: MethodOption) {
  switch (method) {
    case "polling":
      return new PollingEngine();
    case "trigger":
      return new TriggerEngine();
    case "log":
    default:
      return new LogEngine();
  }
}

function emptyEventMap(methods: MethodOption[]) {
  return methods.reduce<Partial<Record<MethodOption, CdcEvent[]>>>((acc, method) => {
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

function computeMetrics(events: CdcEvent[], clock: number, scenario: ShellScenario, method: MethodOption): Metrics {
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

  return {
    bestLag,
    worstLag,
    lagSpread,
    lowestDeletes,
    highestDeletes,
    orderingIssues,
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

  const [liveScenario, setLiveScenario] = useState<ShellScenario | null>(null);
  const [scenarioId, setScenarioId] = useState<string>(
    () => storedPrefs?.scenarioId ?? SCENARIOS[0].name,
  );
  const [activeMethods, setActiveMethods] = useState<MethodOption[]>(
    () => initialActiveMethods,
  );
  const [laneEvents, setLaneEvents] = useState<Partial<Record<MethodOption, CdcEvent[]>>>(() =>
    emptyEventMap(initialActiveMethods),
  );
  const [clock, setClock] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [methodConfig, setMethodConfig] = useState<MethodConfigMap>(
    () => initialMethodConfig,
  );

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
    return list;
  }, [liveScenario]);

  const scenario = useMemo(() => {
    if (!scenarioOptions.length) return SCENARIOS[0];
    return scenarioOptions.find(s => s.name === scenarioId) ?? scenarioOptions[0];
  }, [scenarioId, scenarioOptions]);

  useEffect(() => {
    if (!scenarioOptions.length) return;
    if (!scenarioOptions.some(option => option.name === scenarioId)) {
      userSelectedScenarioRef.current = false;
      setScenarioId(scenarioOptions[0].name);
    }
  }, [scenarioId, scenarioOptions]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = (event: Event) => {
      const custom = event as CustomEvent<WorkspaceBroadcastDetail>;
      const detail = custom.detail;
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

    window.addEventListener("cdc:workspace-update", handler as EventListener);
    window.dispatchEvent(new CustomEvent("cdc:workspace-request"));

    return () => {
      window.removeEventListener("cdc:workspace-update", handler as EventListener);
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

    const handler = (event: Event) => {
      const prefs = (event as CustomEvent<ComparatorPreferences | null>).detail;
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

    window.addEventListener("cdc:comparator-preferences-set", handler as EventListener);
    return () => {
      window.removeEventListener("cdc:comparator-preferences-set", handler as EventListener);
    };
  }, []);

  useEffect(() => {
    savePreferences({
      scenarioId,
      activeMethods,
      methodConfig,
      userPinnedScenario: userSelectedScenarioRef.current,
    });
  }, [scenarioId, activeMethods, methodConfig]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const summaryDetail = summary
      ? {
          lagSpread: summary.lagSpread,
          bestLag: {
            method: summary.bestLag.method,
            label: METHOD_LABELS[summary.bestLag.method],
            metrics: summary.bestLag.metrics,
          },
          worstLag: {
            method: summary.worstLag.method,
            label: METHOD_LABELS[summary.worstLag.method],
            metrics: summary.worstLag.metrics,
          },
          lowestDeletes: {
            method: summary.lowestDeletes.method,
            label: METHOD_LABELS[summary.lowestDeletes.method],
            metrics: summary.lowestDeletes.metrics,
          },
          highestDeletes: {
            method: summary.highestDeletes.method,
            label: METHOD_LABELS[summary.highestDeletes.method],
            metrics: summary.highestDeletes.metrics,
          },
          orderingIssues: summary.orderingIssues.map(method => ({
            method,
            label: METHOD_LABELS[method],
          })),
        }
      : null;

    const lanesDetail = laneMetrics.map(({ method, metrics }) => ({
      method,
      label: METHOD_LABELS[method],
      metrics,
    }));

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
        },
      }),
    );
  }, [laneMetrics, scenario, summary, totalEvents]);

  const runnerRef = useRef<ScenarioRunner | null>(null);
  const timerRef = useRef<number | null>(null);

  const stopLoop = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startLoop = useCallback(() => {
    stopLoop();
    timerRef.current = window.setInterval(() => {
      runnerRef.current?.tick(STEP_MS);
    }, STEP_MS);
  }, [stopLoop]);

  useEffect(() => {
    setLaneEvents(emptyEventMap(activeMethods));
    setClock(0);
    setIsPlaying(false);
    stopLoop();

    const runner = new ScenarioRunner();
    const unsubscribes: Array<() => void> = [];
    const engines = activeMethods.map(method => {
      const engine = createEngine(method);
      const config = methodConfig[method];
      if (method === "polling") {
        engine.configure({
          poll_interval_ms: config.pollIntervalMs,
          include_soft_deletes: config.includeSoftDeletes,
        });
      } else if (method === "trigger") {
        engine.configure({
          extract_interval_ms: config.extractIntervalMs,
          trigger_overhead_ms: config.triggerOverheadMs,
        });
      } else {
        engine.configure({
          fetch_interval_ms: config.fetchIntervalMs,
        });
      }
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
  }, [activeMethods, scenario, stopLoop, methodConfig]);

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

  const handleScenarioSelect = useCallback((value: string) => {
    userSelectedScenarioRef.current = true;
    setScenarioId(value);
  }, []);

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

  const handleStart = useCallback(() => {
    const runner = runnerRef.current;
    if (!runner) return;

    runner.reset(scenario.seed);
    setLaneEvents(emptyEventMap(activeMethods));
    setClock(0);
    runner.start();
    setIsPlaying(true);
    startLoop();
  }, [activeMethods, scenario.seed, startLoop]);

  const handlePause = useCallback(() => {
    runnerRef.current?.pause();
    setIsPlaying(false);
    stopLoop();
  }, [stopLoop]);

  const handleStep = useCallback(() => {
    const runner = runnerRef.current;
    if (!runner) return;

    const wasPlaying = isPlaying;
    if (!wasPlaying) {
      runner.start();
    }

    runner.tick(STEP_MS);

    if (!wasPlaying) {
      runner.pause();
    }
  }, [isPlaying]);

  useEffect(() => () => stopLoop(), [stopLoop]);

  const laneMetrics: LaneMetrics[] = useMemo(() => {
    return activeMethods.map(method => {
      const events = laneEvents[method] ?? [];
      return {
        method,
        events,
        metrics: computeMetrics(events, clock, scenario, method),
      };
    });
  }, [activeMethods, clock, laneEvents, scenario]);

  const summary = computeSummary(laneMetrics);
  const totalEvents = useMemo(
    () => laneMetrics.reduce((sum, lane) => sum + lane.events.length, 0),
    [laneMetrics],
  );

  return (
    <section className="sim-shell" aria-label="Simulator preview">
      <header className="sim-shell__header">
        <div>
          <h2 className="sim-shell__title">CDC Method Comparator</h2>
          <p className="sim-shell__description">
            Load a deterministic scenario and contrast Polling, Trigger, and Log-based CDC side by side.
          </p>
        </div>
        <div className="sim-shell__actions" role="group" aria-label="Scenario controls">
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
          <div className="sim-shell__method-toggle" role="group" aria-label="Methods to display">
            {METHOD_ORDER.map(method => (
              <button
                key={method}
                type="button"
                className="sim-shell__method-chip"
                aria-pressed={activeMethods.includes(method)}
                onClick={() => toggleMethod(method)}
              >
                {METHOD_LABELS[method]}
              </button>
            ))}
          </div>
        </div>
      </header>

      <p className="sim-shell__description" aria-live="polite">
        <strong>{scenario.label}:</strong> {scenario.description}
      </p>

      <div className="sim-shell__actions" role="group" aria-label="Playback controls">
        <button type="button" onClick={handleStart} disabled={isPlaying}>
          Start
        </button>
        <button type="button" onClick={handlePause} disabled={!isPlaying}>
          Pause
        </button>
        <button type="button" onClick={handleStep}>
          Step +{STEP_MS}ms
        </button>
      </div>

      <div className="sim-shell__controls" aria-label="Method tuning controls">
        {METHOD_ORDER.map(method => {
          const config = methodConfig[method];
          const active = activeMethods.includes(method);

          if (method === "polling") {
            return (
              <fieldset
                key={method}
                className="sim-shell__control-card"
                aria-labelledby={`control-${method}`}
                data-active={active ? "true" : "false"}
              >
                <legend id={`control-${method}`}>{METHOD_LABELS[method]}</legend>
                <p className="sim-shell__control-copy">Adjust poll cadence and whether soft deletes are surfaced.</p>
                <label className="sim-shell__control-field">
                  <span>Poll interval (ms)</span>
                  <input
                    type="number"
                    min={50}
                    step={50}
                    value={config.pollIntervalMs}
                    onChange={event =>
                      updateMethodConfig("polling", "pollIntervalMs", Math.max(50, Number(event.target.value) || 0))
                    }
                  />
                </label>
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
            return (
              <fieldset
                key={method}
                className="sim-shell__control-card"
                aria-labelledby={`control-${method}`}
                data-active={active ? "true" : "false"}
              >
                <legend id={`control-${method}`}>{METHOD_LABELS[method]}</legend>
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

          return (
            <fieldset
              key={method}
              className="sim-shell__control-card"
              aria-labelledby={`control-${method}`}
              data-active={active ? "true" : "false"}
            >
              <legend id={`control-${method}`}>{METHOD_LABELS[method]}</legend>
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
        <ul className="sim-shell__summary" aria-live="polite">
          <li>
            <strong>Lag spread:</strong> {METHOD_LABELS[summary.bestLag.method]} is leading at
            {` ${summary.bestLag.metrics.lagMs.toFixed(0)}ms`}
            {summary.lagSpread > 0
              ? ` — ${METHOD_LABELS[summary.worstLag.method]} trails by ${summary.lagSpread.toFixed(0)}ms`
              : " (no spread)"}
          </li>
          <li>
            <strong>Delete capture:</strong> {METHOD_LABELS[summary.lowestDeletes.method]} is lowest at
            {` ${summary.lowestDeletes.metrics.deletesPct.toFixed(0)}%`} · best is {METHOD_LABELS[summary.highestDeletes.method]}
            {` (${summary.highestDeletes.metrics.deletesPct.toFixed(0)}%)`}
          </li>
          <li>
            <strong>Ordering:</strong>
            {summary.orderingIssues.length === 0
              ? " All methods preserved ordering"
              : ` Issues: ${summary.orderingIssues.map(method => METHOD_LABELS[method]).join(", ")}`}
          </li>
        </ul>
      )}

      <div className="sim-shell__lane-grid">
        {laneMetrics.map(({ method, metrics, events }) => {
          const description = METHOD_DESCRIPTIONS[method];
          const displayEvents = events.length > 12 ? events.slice(-12) : events;
          const config = methodConfig[method];
          return (
            <article key={method} className="sim-shell__lane-card">
              <header className="sim-shell__lane-header">
                <div>
                  <h3 className="sim-shell__lane-title">{METHOD_LABELS[method]}</h3>
                  <p className="sim-shell__lane-copy">{description}</p>
                </div>
                <span className="sim-shell__lane-count">{events.length} events</span>
              </header>

              <div className="sim-shell__metrics">
                <MetricsStrip {...metrics} />
              </div>

              <dl className="sim-shell__lane-config">
                {method === "polling" && (
                  <>
                    <div>
                      <dt>Poll interval</dt>
                      <dd>{config.pollIntervalMs} ms</dd>
                    </div>
                    <div>
                      <dt>Soft deletes</dt>
                      <dd>{config.includeSoftDeletes ? "included" : "ignored"}</dd>
                    </div>
                  </>
                )}
                {method === "trigger" && (
                  <>
                    <div>
                      <dt>Extractor interval</dt>
                      <dd>{config.extractIntervalMs} ms</dd>
                    </div>
                    <div>
                      <dt>Trigger overhead</dt>
                      <dd>{config.triggerOverheadMs} ms</dd>
                    </div>
                  </>
                )}
                {method === "log" && (
                  <div>
                    <dt>Fetch interval</dt>
                    <dd>{config.fetchIntervalMs} ms</dd>
                  </div>
                )}
              </dl>

              {method === "polling" && metrics.deletesPct < 100 && (
                <p className="sim-shell__callout sim-shell__callout--warning">
                  Hard deletes missed: {metrics.deletesPct.toFixed(0)}% captured.
                </p>
              )}
              {method === "trigger" && (
                <p className="sim-shell__callout">Adds write latency via trigger execution.</p>
              )}
              {method === "log" && (
                <p className="sim-shell__callout">Reads WAL/Binlog post-commit with strict ordering.</p>
              )}

              <ul className="sim-shell__event-list" aria-live="polite">
                {displayEvents.length === 0 ? (
                  <li className="sim-shell__empty">No events yet.</li>
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
