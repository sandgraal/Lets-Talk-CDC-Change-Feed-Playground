import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CdcEvent } from "../sim";
import { LogEngine, PollingEngine, ScenarioRunner, TriggerEngine } from "../sim";
import { MetricsStrip } from "./components/MetricsStrip";
import { SCENARIOS, ShellScenario } from "./scenarios";
import "./styles/shell.css";

type MethodOption = "polling" | "trigger" | "log";

type Metrics = {
  lagMs: number;
  throughput: number;
  deletesPct: number;
  orderingOk: boolean;
  consistent: boolean;
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

const STEP_MS = 100;

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

  const consistent = orderingOk && (method === "polling" ? capturedDeletes === totalDeletes : true);

  return {
    lagMs,
    throughput,
    deletesPct,
    orderingOk,
    consistent,
  };
}

export function App() {
  const [method, setMethod] = useState<MethodOption>("polling");
  const [scenarioId, setScenarioId] = useState<string>(SCENARIOS[0].name);
  const [events, setEvents] = useState<CdcEvent[]>([]);
  const [clock, setClock] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const scenario = useMemo(() => SCENARIOS.find(s => s.name === scenarioId) ?? SCENARIOS[0], [scenarioId]);

  const runnerRef = useRef<ScenarioRunner | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
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
    setEvents([]);
    setClock(0);
    setIsPlaying(false);

    stopLoop();
    unsubscribeRef.current?.();

    const runner = new ScenarioRunner();
    const engine = createEngine(method);
    const unsubscribe = engine.onEvent(event => {
      setEvents(prev => [...prev, event]);
    });

    runner.attach([engine]);
    runner.load(scenario);
    runner.reset(scenario.seed);
    runner.onTick(now => setClock(now));

    runnerRef.current = runner;
    unsubscribeRef.current = () => {
      unsubscribe();
      unsubscribeRef.current = null;
    };

    return () => {
      runner.pause();
      stopLoop();
      unsubscribeRef.current?.();
    };
  }, [method, scenario, stopLoop]);

  const handleStart = useCallback(() => {
    const runner = runnerRef.current;
    if (!runner) return;

    runner.reset(scenario.seed);
    setEvents([]);
    setClock(0);
    runner.start();
    setIsPlaying(true);
    startLoop();
  }, [scenario.seed, startLoop]);

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

  const metrics = computeMetrics(events, clock, scenario, method);

  return (
    <section className="sim-shell" aria-label="Simulator preview">
      <header className="sim-shell__header">
        <div>
          <h2 className="sim-shell__title">CDC Method Preview</h2>
          <p className="sim-shell__description">Load a canned scenario and watch Polling, Trigger, or Log-based CDC emit events in real time.</p>
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
          <div className="sim-shell__method-tabs" role="group" aria-label="Method selector">
            {(Object.keys(METHOD_LABELS) as MethodOption[]).map(option => (
              <button
                key={option}
                type="button"
                className="sim-shell__method-button"
                aria-pressed={option === method}
                onClick={() => setMethod(option)}
              >
                {METHOD_LABELS[option]}
              </button>
            ))}
          </div>
        </div>
      </header>

      <p className="sim-shell__description" aria-live="polite">
        <strong>{scenario.label}:</strong> {scenario.description}
      </p>

      <p className="sim-shell__description" aria-live="polite">{METHOD_DESCRIPTIONS[method]}</p>

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

      <div className="sim-shell__metrics">
        <MetricsStrip {...metrics} />
      </div>

      <ul className="sim-shell__event-list" aria-live="polite">
        {events.length === 0 ? (
          <li className="sim-shell__empty">No events yet. Start the simulator to stream the change feed.</li>
        ) : (
          events.map(event => (
            <li key={event.seq} className={`sim-shell__event${event.op === "d" ? " sim-shell__event--delete" : ""}`}>
              <span className="sim-shell__event-op" data-op={event.op}>
                {event.op}
              </span>
              <span>
                #{event.seq} · pk={event.pk.id}
              </span>
              <span className="sim-shell__event-target">
                ts={event.ts_ms}ms
              </span>
            </li>
          ))
        )}
      </ul>

      <footer className="sim-shell__footer">
        Scenario clock: {clock}ms · {events.length} events emitted
      </footer>
    </section>
  );
}
