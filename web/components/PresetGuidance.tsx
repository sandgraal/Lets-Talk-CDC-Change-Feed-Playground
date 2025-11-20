import type { VendorPreset } from "../../src";

export type PresetMethodGuidance = {
  id: string;
  label: string;
  laneDescription: string;
  whenToUse: string;
  callout: string;
  active: boolean;
};

type PresetGuidanceProps = {
  preset: VendorPreset;
  topicExample: string;
  methods: PresetMethodGuidance[];
};

export function PresetGuidance({ preset, topicExample, methods }: PresetGuidanceProps) {
  return (
    <section className="sim-shell__preset-guidance" aria-label="Vendor preset guidance and quick tips">
      <div className="sim-shell__preset-guidance-header">
        <div>
          <h3 className="sim-shell__subtitle">Pipeline blueprint</h3>
          <p className="sim-shell__description sim-shell__description--subtle">{preset.description}</p>
          <div className="sim-shell__preset-row sim-shell__preset-row--compact" role="list" aria-label="Preset pipeline">
            <span className="sim-shell__preset-pill" data-tooltip={preset.sourceTooltip} role="listitem">
              Source · {preset.sourceLabel}
            </span>
            <span className="sim-shell__preset-arrow" aria-hidden="true">
              →
            </span>
            <span className="sim-shell__preset-pill" data-tooltip={preset.logTooltip} role="listitem">
              Capture · {preset.logLabel}
            </span>
            <span className="sim-shell__preset-arrow" aria-hidden="true">
              →
            </span>
            <span className="sim-shell__preset-pill" data-tooltip={preset.busTooltip} role="listitem">
              Transport · {preset.busLabel}
            </span>
            <span className="sim-shell__preset-arrow" aria-hidden="true">
              →
            </span>
            <span className="sim-shell__preset-pill" data-tooltip={preset.destinationTooltip} role="listitem">
              Sink · {preset.destinationLabel}
            </span>
          </div>
        </div>
        <div className="sim-shell__preset-meta-cards" aria-label="Preset quick facts">
          <div className="sim-shell__preset-meta-card">
            <p className="sim-shell__preset-meta-label">Topic example</p>
            <code className="sim-shell__preset-topic" aria-label="Example transport topic or namespace">
              {topicExample}
            </code>
          </div>
          <div className="sim-shell__preset-meta-card">
            <p className="sim-shell__preset-meta-label">Docs</p>
            {preset.docsHint ? (
              <a
                className="sim-shell__preset-docs"
                href={preset.docsHint}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open preset reference
              </a>
            ) : (
              <span className="sim-shell__preset-meta-placeholder">No reference link provided</span>
            )}
          </div>
        </div>
      </div>
      <div className="sim-shell__method-guidance" role="list" aria-label="Method-specific guidance">
        {methods.map(method => (
          <article
            key={method.id}
            className="sim-shell__method-card"
            data-active={method.active ? "true" : "false"}
            role="listitem"
          >
            <header className="sim-shell__method-card-header">
              <div className="sim-shell__method-card-titles">
                <p className="sim-shell__method-name">{method.label}</p>
                <p className="sim-shell__method-lane">{method.laneDescription}</p>
              </div>
              <span className="sim-shell__method-state" aria-live="polite">
                {method.active ? "Active" : "Off"}
              </span>
            </header>
            <p className="sim-shell__method-card-line">
              <strong>Use when:</strong> {method.whenToUse}
            </p>
            <p className="sim-shell__method-card-line sim-shell__method-card-line--callout" role="note">
              <strong>Watch for:</strong> {method.callout}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
