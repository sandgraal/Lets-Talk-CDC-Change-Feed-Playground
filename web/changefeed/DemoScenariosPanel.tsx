import { memo } from "react";
import { DEMO_SCENARIOS, type DemoScenario } from "./DemoScenarios";

interface DemoScenariosPanelProps {
  onRunScenario: (scenario: DemoScenario) => void;
}

export const DemoScenariosPanel = memo(
  ({ onRunScenario }: DemoScenariosPanelProps) => (
    <div className="cf-demo-scenarios">
      <div className="cf-demo-scenarios__header">
        <h4 className="cf-demo-scenarios__title">Guided Demos</h4>
        <p className="cf-demo-scenarios__hint">
          Quick scenarios to explore CDC features
        </p>
      </div>
      <div className="cf-demo-scenarios__grid">
        {DEMO_SCENARIOS.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            className="cf-demo-card"
            onClick={() => onRunScenario(scenario)}
            title={scenario.description}
          >
            <span className="cf-demo-card__icon">{scenario.icon}</span>
            <span className="cf-demo-card__name">{scenario.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
);

DemoScenariosPanel.displayName = "DemoScenariosPanel";
