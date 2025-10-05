# Telemetry Taxonomy

The in-browser telemetry client buffers events to `localStorage` (`window.telemetry`) so we can inspect activation and adoption flows without shipping data off-device.

| Event | Question | Description |
| --- | --- | --- |
| `comparator.scenario.select` | Activation | User picked a scenario from the comparator dropdown. Payload: `{ scenario, tags }` |
| `comparator.scenario.preview` | Activation | Preview modal opened for a template. Payload: `{ scenario, tags }` |
| `comparator.summary.copied` | Activation | Summary callouts copied to clipboard. Payload: `{ scenario, methods, tags }` |
| `comparator.diff.opened` | Funnel drop | Lane diff details expanded. Payload: `{ method, issues, maxLag }` |
| `comparator.clock.control` | Funnel drop | Guided clock control action (`play`, `pause`, `seek`, `step`, `reset`). Payload: `{ action, scenario, deltaMs? }` |
| `tour.started` | Funnel drop | Spotlight walkthrough initiated. Payload: `{ totalSteps, source }` |
| `tour.completed` | Activation | Spotlight completed. Payload: `{ totalSteps, durationMs }` |
| `tour.dismissed` | Funnel drop | Spotlight exited before completion. Payload: `{ totalSteps, durationMs, step, reason }` |
| `workspace.share.generated` | Collaboration | Share link copied (clipboard or fallback). Payload: `{ shareId, url, rows, events, fallback? }` |
| `workspace.scenario.imported` | Scenario completeness | Scenario loaded from JSON/share. Payload: `{ source?, rows, events, scenarioId }` |
| `workspace.scenario.template_loaded` | Activation | Template applied in legacy shell. Payload: `{ templateId, rows, ops, tags }` |
| `workspace.scenario.exported` | Scenario completeness | Scenario exported with comparator snapshot. Payload: `{ rows, events, hasComparator }` |
| `telemetry.flush` | Activation | Manual flush of the telemetry buffer (currently invoked from devtools or test hooks). |

## Buffer semantics
- Up to 200 events are buffered in `localStorage`.
- `window.telemetry.flush()` returns and clears the buffer so tests or guided tours can assert on emissions.
- Nothing is sent over the network—inspect via DevTools or dump the buffer during guided sessions.
