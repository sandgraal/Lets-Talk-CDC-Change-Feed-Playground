import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CdcEvent } from "../sim";
import { LogEngine, PollingEngine, ScenarioRunner, TriggerEngine } from "../sim";
import { MetricsStrip } from "./components/MetricsStrip";
import { SCENARIOS, ShellScenario } from "./scenarios";
import "./styles/shell.css";

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
  const [scenarioId, setScenarioId] = useState<string>(SCENARIOS[0].name);
  const [activeMethods, setActiveMethods] = useState<MethodOption[]>(() => [...METHOD_ORDER]);
  const [laneEvents, setLaneEvents] = useState<Partial<Record<MethodOption, CdcEvent[]>>>(() =>
    emptyEventMap([...METHOD_ORDER]),
  );
  const [clock, setClock] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const scenario = useMemo(
    () => SCENARIOS.find(s => s.name === scenarioId) ?? SCENARIOS[0],
    [scenarioId],
  );

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
  }, [activeMethods, scenario, stopLoop]);

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
            onChange={event => setScenarioId(event.target.value)}
          >
            {SCENARIOS.map(option => (
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
