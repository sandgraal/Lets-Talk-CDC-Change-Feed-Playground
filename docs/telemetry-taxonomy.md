# Telemetry Taxonomy

The in-browser telemetry client buffers events to `localStorage` (`window.telemetry`) so we can inspect activation and adoption flows without shipping data off-device.

| Event | Question | Description |
| --- | --- | --- |
| `comparator.scenario.select` | Activation | User picked a scenario from the comparator dropdown. Payload: `{ scenario, tags }` |
| `comparator.scenario.preview` | Activation | Preview modal opened for a template. Payload: `{ scenario, tags }` |
| `comparator.preset.select` | Activation | Vendor preset badge selected. Payload: `{ presetId }` |
| `comparator.scenario.filter` | Activation | Scenario search input updated. Payload: `{ query }` |
| `comparator.scenario.tag_toggle` | Funnel drop | Scenario tag chip toggled. Payload: `{ tag, active }` |
| `comparator.scenario.tag_clear` | Funnel drop | Scenario tag filters cleared. No payload. |
| `comparator.summary.copied` | Activation | Summary callouts copied to clipboard. Payload: `{ scenario, methods, tags }` |
| `comparator.diff.opened` | Funnel drop | Lane diff details expanded. Payload: `{ method, issues, maxLag }` |
| `comparator.overlay.inspect` | Activation | Lane checks CTA clicked; scrolls to diff details. Payload: `{ method, scenario }` |
| `comparator.schema.change` | Activation | Schema walkthrough action taken. Payload: `{ method, action, column, scenario }` |
| `comparator.clock.control` | Funnel drop | Guided clock control action (`play`, `pause`, `seek`, `step`, `reset`). Payload: `{ action, scenario, deltaMs? }` |
| `comparator.consumer.toggle` | Funnel drop | Pause/resume apply. Payload: `{ scenario, paused }` |
| `comparator.consumer.rate_toggle` | Funnel drop | Throughput limiter toggle clicked. Payload: `{ scenario, enabled }` |
| `comparator.consumer.rate_adjust` | Activation | Throughput limiter slider changed. Payload: `{ scenario, rate }` |
| `comparator.consumer.rate_reset` | Activation | Throughput limiter reset to default. Payload: `{ scenario }` |
| `comparator.event.search` | Activation | Event log search query changed. Payload: `{ scenario, query, hasQuery }` |
| `comparator.event.filter` | Activation | Event operation pill toggled. Payload: `{ scenario, op, active }` |
| `comparator.panel.layout` | Adoption | Event timeline shown/hidden. Payload: `{ scenario, showEvents }` |
| `comparator.event.download` | Adoption | Event log exported as NDJSON. Payload: `{ scenario, events }` |
| `comparator.event.clear` | Adoption | Event log cleared. Payload: `{ scenario }` |
| `comparator.event.copy` | Activation | Event copied to clipboard. Payload: `{ scenario, method, table, op }` |
| `comparator.event.copy.error` | Quality gate | Clipboard copy failed. Payload: `{ scenario, reason }` |
| `comparator.event.replay` | Activation | Event replayed into workspace. Payload: `{ scenario, method, op, pk }` |
| `comparator.destination.download` | Adoption | Destination snapshot downloaded. Payload: `{ scenario, method, tables }` |
| `comparator.generator.toggle` | Adoption | Generator toggled on/off. Payload: `{ scenario, enabled }` |
| `comparator.generator.rate_adjust` | Adoption | Generator cadence changed. Payload: `{ scenario, rate }` |
| `comparator.generator.burst` | Activation | Burst run triggered. Payload: `{ scenario, count, spacingMs }` |
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
