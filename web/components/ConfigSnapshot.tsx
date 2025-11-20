import { useMemo, useState } from "react";
import type { VendorPreset } from "../../src";
import type { ShellScenario } from "../scenarios";

export type ComparatorConfigSnapshot = {
  scenario: Pick<ShellScenario, "id" | "label" | "tags" | "stats">;
  preset: Pick<VendorPreset, "id" | "label">;
  featureFlags: string[];
  usesDefaultFlags: boolean;
  applyOnCommit: boolean;
  consumerRate: number | null;
  generatorRate: number | null;
  toggles: {
    eventBus: boolean;
    eventLog: boolean;
    pauseResume: boolean;
    querySlider: boolean;
    metrics: boolean;
    schemaWalkthrough: boolean;
    triggerMethod: boolean;
    multiTable: boolean;
  };
  methods: Array<{
    id: string;
    label: string;
    active: boolean;
    laneDescription: string;
    configSummary: string;
    configValues: Record<string, unknown>;
  }>;
};

type ConfigSnapshotProps = {
  snapshot: ComparatorConfigSnapshot;
  onCopy?: () => void;
};

export function ConfigSnapshot({ snapshot, onCopy }: ConfigSnapshotProps) {
  const [copied, setCopied] = useState(false);

  const summaryLines = useMemo(
    () => [
      `${snapshot.methods.filter(method => method.active).length} active capture methods`,
      snapshot.applyOnCommit ? "Apply on commit keeps multi-table writes atomic" : "Apply on commit disabled (drift visible)",
      snapshot.consumerRate == null
        ? "Consumer runs unthrottled"
        : `Consumer capped at ${snapshot.consumerRate} events/s`,
      snapshot.generatorRate == null
        ? "Scenario runs from source ops only"
        : `Synthetic generator at ${snapshot.generatorRate} ops/s`,
    ],
    [snapshot.applyOnCommit, snapshot.consumerRate, snapshot.generatorRate, snapshot.methods],
  );

  const featureFlagLabel = snapshot.usesDefaultFlags
    ? "Defaults (all comparator flags on)"
    : snapshot.featureFlags.length
      ? snapshot.featureFlags.join(", ")
      : "No feature flags provided";

  const formattedSnapshot = useMemo(
    () =>
      JSON.stringify(
        {
          scenario: snapshot.scenario,
          preset: snapshot.preset,
          featureFlags: snapshot.usesDefaultFlags ? "defaults" : snapshot.featureFlags,
          applyOnCommit: snapshot.applyOnCommit,
          consumerRate: snapshot.consumerRate,
          generatorRate: snapshot.generatorRate,
          toggles: snapshot.toggles,
          methods: snapshot.methods.map(method => ({
            id: method.id,
            active: method.active,
            config: method.configValues,
          })),
        },
        null,
        2,
      ),
    [snapshot],
  );

  const handleCopy = async () => {
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard) return;
      await navigator.clipboard.writeText(formattedSnapshot);
      setCopied(true);
      onCopy?.();
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="sim-shell__config-snapshot" aria-label="Comparator configuration snapshot">
      <header className="sim-shell__config-snapshot-header">
        <div>
          <h3>Configuration snapshot</h3>
          <p className="sim-shell__description">
            Share these knobs to reproduce the current comparator run or seed a guided lab.
          </p>
        </div>
        <div className="sim-shell__config-snapshot-meta" role="list">
          <span role="listitem" className="sim-shell__config-pill">
            Scenario · {snapshot.scenario.label}
          </span>
          <span role="listitem" className="sim-shell__config-pill">
            Preset · {snapshot.preset.label}
          </span>
          <span role="listitem" className="sim-shell__config-pill">
            Feature flags · {featureFlagLabel}
          </span>
        </div>
      </header>
      <div className="sim-shell__config-grid" role="list">
        <div role="listitem" className="sim-shell__config-card">
          <p className="sim-shell__config-card-title">Capture methods</p>
          <ul>
            {snapshot.methods.map(method => (
              <li key={method.id} className="sim-shell__config-line">
                <span className="sim-shell__config-label">{method.label}</span>
                <span className="sim-shell__config-value" aria-live="polite">
                  {method.active ? method.configSummary : "Off"}
                </span>
                <span className="visually-hidden">{method.laneDescription}</span>
              </li>
            ))}
          </ul>
        </div>
        <div role="listitem" className="sim-shell__config-card">
          <p className="sim-shell__config-card-title">Cross-lane controls</p>
          <ul>
            {summaryLines.map((line, index) => (
              <li key={`summary-${index}`} className="sim-shell__config-line">
                <span className="sim-shell__config-label">{index === 0 ? "Methods" : "Control"}</span>
                <span className="sim-shell__config-value">{line}</span>
              </li>
            ))}
            <li className="sim-shell__config-line">
              <span className="sim-shell__config-label">Event log</span>
              <span className="sim-shell__config-value">
                {snapshot.toggles.eventLog ? "Visible" : "Disabled"}
                {snapshot.toggles.eventBus ? " · Event bus on" : " · Event bus off"}
              </span>
            </li>
            <li className="sim-shell__config-line">
              <span className="sim-shell__config-label">Schema walkthrough</span>
              <span className="sim-shell__config-value">
                {snapshot.toggles.schemaWalkthrough ? "Enabled" : "Hidden"}
                {snapshot.toggles.multiTable ? " · Multi-table" : " · Single table"}
              </span>
            </li>
            <li className="sim-shell__config-line">
              <span className="sim-shell__config-label">Metrics</span>
              <span className="sim-shell__config-value">
                {snapshot.toggles.metrics ? "Dashboard on" : "Dashboard off"}
                {snapshot.toggles.triggerMethod ? " · Trigger lane available" : " · Trigger lane hidden"}
              </span>
            </li>
          </ul>
        </div>
      </div>
      <div className="sim-shell__config-json">
        <div className="sim-shell__config-json-header">
          <p>JSON export</p>
          <button type="button" className="sim-shell__scenario-download" onClick={handleCopy}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre aria-label="Configuration JSON snapshot">{formattedSnapshot}</pre>
      </div>
    </section>
  );
}
