import type { ScenarioGuidance } from "../../src";

type ScenarioGuidanceProps = {
  guidance: ScenarioGuidance;
};

export function ScenarioGuidancePanel({ guidance }: ScenarioGuidanceProps) {
  if (!guidance.controls.length && !guidance.observations.length) {
    return null;
  }

  return (
    <section className="sim-shell__scenario-guidance" aria-label="Scenario guardrails and teaching tips">
      <header className="sim-shell__scenario-guidance-header">
        <div>
          <p className="sim-shell__subtitle">Scenario guardrails</p>
          {guidance.summary ? (
            <p className="sim-shell__description sim-shell__description--meta">{guidance.summary}</p>
          ) : null}
        </div>
      </header>
      <div className="sim-shell__scenario-guidance-grid" role="list">
        {guidance.controls.length ? (
          <article className="sim-shell__scenario-guidance-card" role="listitem">
            <h4>Recommended controls</h4>
            <ul>
              {guidance.controls.map(item => (
                <li key={item.title}>
                  <strong>{item.title}.</strong> {item.detail}
                </li>
              ))}
            </ul>
          </article>
        ) : null}
        {guidance.observations.length ? (
          <article className="sim-shell__scenario-guidance-card" role="listitem">
            <h4>What to observe</h4>
            <ul>
              {guidance.observations.map(item => (
                <li key={item.title}>
                  <strong>{item.title}.</strong> {item.detail}
                </li>
              ))}
            </ul>
          </article>
        ) : null}
      </div>
    </section>
  );
}
