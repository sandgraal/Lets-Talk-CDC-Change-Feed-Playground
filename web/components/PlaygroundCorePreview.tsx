import { useEffect, useMemo, useRef, useState } from "react";
import type { CdcEvent, Scenario } from "../../sim";
import { LogEngine, PollingEngine, ScenarioRunner, TriggerEngine } from "../../sim";
import type { ShellScenario } from "../scenarios";

const METHODS = [
  { id: "polling" as const, label: "Polling" },
  { id: "trigger" as const, label: "Trigger" },
  { id: "log" as const, label: "Log" },
];

const DEFAULT_POLL_INTERVAL = 400;
const DEFAULT_TRIGGER_OVERHEAD = 5;
const DEFAULT_TRIGGER_EXTRACT = 500;
const DEFAULT_LOG_FETCH = 120;
const MAX_EVENTS = 40;
const DEFAULT_TICK_MS = 120;

const cloneOps = (ops: Scenario["ops"]): Scenario["ops"] => ops.map(op => ({
  ...op,
  pk: op.pk ? { ...op.pk } : undefined,
  after: op.after ? { ...op.after } : undefined,
  txn: op.txn ? { ...op.txn } : undefined,
}));

export function PlaygroundCorePreview({ scenarios, autoStart = false }: { scenarios: ShellScenario[]; autoStart?: boolean }) {
  const [scenarioId, setScenarioId] = useState(() => scenarios[0]?.id ?? "");
  const scenario = useMemo(
    () => scenarios.find(item => item.id === scenarioId) ?? scenarios[0],
    [scenarioId, scenarios],
  );

  const [isPlaying, setIsPlaying] = useState(false);
  const [tickMs, setTickMs] = useState(DEFAULT_TICK_MS);
  const [pollIntervalMs, setPollIntervalMs] = useState(DEFAULT_POLL_INTERVAL);
  const [triggerOverheadMs, setTriggerOverheadMs] = useState(DEFAULT_TRIGGER_OVERHEAD);
  const [extractIntervalMs, setExtractIntervalMs] = useState(DEFAULT_TRIGGER_EXTRACT);
  const [logFetchIntervalMs, setLogFetchIntervalMs] = useState(DEFAULT_LOG_FETCH);
  const [clock, setClock] = useState(0);
  const [laneEvents, setLaneEvents] = useState<Record<string, CdcEvent[]>>({
    polling: [],
    trigger: [],
    log: [],
  });

  const runnerRef = useRef<ScenarioRunner | null>(null);
  const timerRef = useRef<number | null>(null);
  const unsubscribesRef = useRef<Array<() => void>>([]);

  const stopLoop = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const resetEvents = () => {
    setLaneEvents({ polling: [], trigger: [], log: [] });
  };

  useEffect(() => {
    stopLoop();
    setIsPlaying(false);
    unsubscribesRef.current.forEach(unsub => unsub());
    unsubscribesRef.current = [];

    if (!scenario) return;

    const polling = new PollingEngine();
    polling.configure({ poll_interval_ms: pollIntervalMs, include_soft_deletes: true });

    const trigger = new TriggerEngine();
    trigger.configure({
      extract_interval_ms: extractIntervalMs,
      trigger_overhead_ms: triggerOverheadMs,
    });

    const log = new LogEngine();
    log.configure({ fetch_interval_ms: logFetchIntervalMs });

    const runner = new ScenarioRunner();
    runner.attach([polling, trigger, log]);
    runner.load({ ...scenario, ops: cloneOps(scenario.ops) });
    runner.reset(scenario.seed);
    runner.onTick(now => setClock(now));

    resetEvents();
    setClock(0);

    unsubscribesRef.current.push(
      polling.onEvent(event =>
        setLaneEvents(prev => ({ ...prev, polling: [...prev.polling, event].slice(-MAX_EVENTS) })),
      ),
    );
    unsubscribesRef.current.push(
      trigger.onEvent(event =>
        setLaneEvents(prev => ({ ...prev, trigger: [...prev.trigger, event].slice(-MAX_EVENTS) })),
      ),
    );
    unsubscribesRef.current.push(
    log.onEvent(event => setLaneEvents(prev => ({ ...prev, log: [...prev.log, event].slice(-MAX_EVENTS) }))),
    );

    runnerRef.current = runner;

    if (autoStart) {
      stopLoop();
      runner.start();
      setIsPlaying(true);
      timerRef.current = window.setInterval(() => {
        runner.tick(tickMs);
      }, tickMs);
    }

    return () => {
      stopLoop();
      unsubscribesRef.current.forEach(unsub => unsub());
      unsubscribesRef.current = [];
    };
  }, [
    scenario,
    pollIntervalMs,
    extractIntervalMs,
    triggerOverheadMs,
    logFetchIntervalMs,
    autoStart,
    tickMs,
  ]);

  const handlePlay = () => {
    if (!runnerRef.current) return;
    stopLoop();
    runnerRef.current.start();
    setIsPlaying(true);
    timerRef.current = window.setInterval(() => {
      runnerRef.current?.tick(tickMs);
    }, tickMs);
  };

  const handlePause = () => {
    runnerRef.current?.pause();
    setIsPlaying(false);
    stopLoop();
  };

  const handleReset = () => {
    runnerRef.current?.reset(scenario?.seed ?? 0);
    resetEvents();
    setClock(0);
  };

  const handleStep = () => {
    const runner = runnerRef.current;
    if (!runner) return;
    const wasPlaying = isPlaying;
    runner.start();
    runner.tick(tickMs);
    if (!wasPlaying) {
      runner.pause();
    }
  };

  useEffect(() => () => stopLoop(), []);

  if (!scenario) return null;

  return (
    <section className="sim-core" aria-label="Playground core lanes">
      <header className="sim-core__toolbar" aria-label="Core controls">
        <div className="sim-core__toolbar-row">
          <div className="sim-core__toolbar-group">
            <label htmlFor="scenario-select">
              <span className="sim-core__label">Scenario</span>
              <select id="scenario-select" value={scenarioId} onChange={event => setScenarioId(event.target.value)}>
                {scenarios.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sim-core__label">Tick</span>
              <input
                type="range"
                min={50}
                max={500}
                step={10}
                value={tickMs}
                onChange={event => setTickMs(Number(event.target.value))}
              />
              <span className="sim-core__value">{tickMs}ms</span>
            </label>
          </div>
          <div className="sim-core__toolbar-group">
            <button type="button" onClick={isPlaying ? handlePause : handlePlay}>
              {isPlaying ? "Pause" : "Play"}
            </button>
            <button type="button" onClick={handleStep} aria-label="Step">
              Step
            </button>
            <button type="button" onClick={handleReset} aria-label="Reset">
              Reset
            </button>
          </div>
        </div>
        <div className="sim-core__toolbar-row">
          <label>
            <span className="sim-core__label">Polling interval</span>
            <input
              type="range"
              min={100}
              max={1500}
              step={50}
              value={pollIntervalMs}
              onChange={event => setPollIntervalMs(Number(event.target.value))}
            />
            <span className="sim-core__value">{pollIntervalMs}ms</span>
          </label>
          <label>
            <span className="sim-core__label">Trigger overhead</span>
            <input
              type="range"
              min={0}
              max={30}
              step={1}
              value={triggerOverheadMs}
              onChange={event => setTriggerOverheadMs(Number(event.target.value))}
            />
            <span className="sim-core__value">{triggerOverheadMs}ms</span>
          </label>
          <label>
            <span className="sim-core__label">Trigger extract</span>
            <input
              type="range"
              min={100}
              max={1500}
              step={50}
              value={extractIntervalMs}
              onChange={event => setExtractIntervalMs(Number(event.target.value))}
            />
            <span className="sim-core__value">{extractIntervalMs}ms</span>
          </label>
          <label>
            <span className="sim-core__label">Log fetch</span>
            <input
              type="range"
              min={50}
              max={800}
              step={10}
              value={logFetchIntervalMs}
              onChange={event => setLogFetchIntervalMs(Number(event.target.value))}
            />
            <span className="sim-core__value">{logFetchIntervalMs}ms</span>
          </label>
          <div className="sim-core__clock" aria-live="polite">
            Clock: {clock}ms
          </div>
        </div>
      </header>

      <div className="sim-core__lanes" role="list" aria-label="CDC lanes">
        {METHODS.map(method => {
          const events = laneEvents[method.id] ?? [];
          return (
            <article key={method.id} className="sim-core__lane" role="listitem">
              <header className="sim-core__lane-header">
                <div>
                  <p className="sim-core__lane-title">{method.label}</p>
                  <p className="sim-core__lane-subtitle">{method.id} lane</p>
                </div>
                <div className="sim-core__lane-count" data-testid={`${method.id}-event-count`}>
                  {events.length} events
                </div>
              </header>
              <ol className="sim-core__lane-events" aria-label={`${method.label} events`}>
                {events.length === 0 ? <li className="sim-core__empty">Waiting for events…</li> : null}
                {events.map(event => (
                  <li key={`${event.seq}-${event.pk.id}`} className="sim-core__event">
                    <span className={`sim-core__event-op sim-core__event-op--${event.op}`}>
                      {event.op.toUpperCase()}
                    </span>
                    <span className="sim-core__event-table">{event.table}</span>
                    <span className="sim-core__event-pk">pk={String(event.pk.id)}</span>
                    <span className="sim-core__event-time">{event.ts_ms}ms</span>
                  </li>
                ))}
              </ol>
            </article>
          );
        })}
      </div>
    </section>
  );
}
