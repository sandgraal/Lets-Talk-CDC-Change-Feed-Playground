export type ScenarioGuidanceBullet = {
  title: string;
  detail: string;
};

export type ScenarioGuidance = {
  summary?: string;
  controls: ScenarioGuidanceBullet[];
  observations: ScenarioGuidanceBullet[];
};

const GUIDANCE_BY_SCENARIO: Record<string, ScenarioGuidance> = {
  "snapshot ➜ stream handoff": {
    summary:
      "Show how a snapshot catch-up hands control to the streaming tail while keeping tables consistent across methods.",
    controls: [
      {
        title: "Keep log + trigger enabled",
        detail:
          "Run both streaming lanes to compare how quickly they drain the backlog once the snapshot is done.",
      },
      {
        title: "Apply on commit",
        detail:
          "Ensure atomic updates across tables once the stream takes over so item/order rows never drift during the handoff.",
      },
      {
        title: "Throttle apply briefly",
        detail:
          "Enable the apply rate limiter to surface how much backlog accumulates during the snapshot phase versus live tailing.",
      },
    ],
    observations: [
      {
        title: "Mind duplicate delivery",
        detail:
          "Use the event log filters to confirm the first stream event after the snapshot resumes doesn't replay rows already applied.",
      },
      {
        title: "Lag recovery",
        detail:
          "Track lag spread to show which capture method clears the handoff backlog fastest once throttling is removed.",
      },
    ],
  },
  "snapshot replay": {
    summary:
      "Rebuild state from a snapshot, then keep tails aligned while new mutations arrive mid-replay.",
    controls: [
      {
        title: "Leave polling disabled",
        detail:
          "Focus on trigger/log methods so the replay highlights ordered change events instead of bulk diffs.",
      },
      {
        title: "Pause/resume apply",
        detail:
          "Pause apply mid-snapshot to show partially hydrated tables, then resume to watch the tail catch up.",
      },
      {
        title: "Filter snapshot ops",
        detail:
          "Filter the event log to op=s to separate snapshot seeds from live updates when explaining offsets.",
      },
    ],
    observations: [
      {
        title: "Offset safety",
        detail:
          "Demonstrate that once the snapshot completes, resumed streams continue without reprocessing completed chunks.",
      },
      {
        title: "Backlog pressure",
        detail:
          "Watch backlog counters while the replay runs; streaming methods should stay ahead of trigger overhead.",
      },
    ],
  },
  "orders + items transactions": {
    summary:
      "Highlight multi-table atomicity and why apply-on-commit matters for transactional feeds.",
    controls: [
      {
        title: "Enable apply-on-commit",
        detail:
          "Group transaction events so orders/items stay consistent even if a lane pauses mid-flight.",
      },
      {
        title: "Toggle consumer pause",
        detail:
          "Pause apply during a multi-row commit to show how partial apply would drift if atomic grouping is off.",
      },
      {
        title: "Keep log + trigger on",
        detail:
          "Contrast log ordering guarantees with trigger write amplification when commits include multiple tables.",
      },
    ],
    observations: [
      {
        title: "Out-of-order risk",
        detail:
          "Use the lane diff overlay to surface any sequence gaps when apply-on-commit is disabled.",
      },
      {
        title: "Write amplification",
        detail:
          "Inspect trigger metrics to show the extra writes incurred versus log capture for the same transaction.",
      },
    ],
  },
  "outbox relay": {
    summary: "Compare an application-managed outbox with log capture and where each shines.",
    controls: [
      {
        title: "Disable polling",
        detail:
          "Keep focus on outbox vs. log/trigger capture; polling collapses the ordering story to diffs.",
      },
      {
        title: "Filter to outbox table",
        detail:
          "Use the event log table filter to spotlight outbox_events entries and their ordering keys.",
      },
      {
        title: "Keep apply-on-commit off",
        detail:
          "Allow partial apply to show how outbox can still preserve business ordering when consumers lag.",
      },
    ],
    observations: [
      {
        title: "Idempotent keys",
        detail:
          "Call out event_key usage and show how downstream sinks can dedupe on that key even if retries occur.",
      },
      {
        title: "Replay behaviour",
        detail:
          "Reset and step through to prove outbox emits stable events even when upstream rows churn.",
      },
    ],
  },
  "retention & erasure": {
    summary: "Demonstrate privacy deletes, masking, and soft-delete visibility across methods.",
    controls: [
      {
        title: "Enable soft delete column",
        detail:
          "Turn on the polling soft-delete marker so diffs retain tombstones instead of dropping rows silently.",
      },
      {
        title: "Keep polling slower",
        detail:
          "Use a longer poll interval (1–2s) to show how lag makes soft-delete visibility diverge from log capture.",
      },
      {
        title: "Use event search",
        detail:
          "Filter for delete ops (d) to compare how each method surfaces erasure events and masking updates.",
      },
    ],
    observations: [
      {
        title: "Hard vs. soft delete",
        detail:
          "Point out that polling without the marker loses hard deletes, while log/trigger lanes emit explicit tombstones.",
      },
      {
        title: "Compliance lag",
        detail:
          "Watch lag spread to discuss how quickly each method propagates erasure, especially under throttled apply.",
      },
    ],
  },
  "burst updates": {
    summary: "Stress test lag/ordering under rapid-fire updates to the same keys.",
    controls: [
      {
        title: "Throttle apply",
        detail:
          "Enable the apply rate limiter to build backlog and make ordering differences visible in the diff overlay.",
      },
      {
        title: "Tighten log fetch interval",
        detail:
          "Drop the log fetch interval toward 50–100ms to show near-real-time log capture versus slower polling.",
      },
      {
        title: "Disable generator",
        detail:
          "Keep the synthetic generator off so the scenario traffic stays focused on the curated burst pattern.",
      },
    ],
    observations: [
      {
        title: "Last-write wins",
        detail:
          "Use the event log search to show how polling collapses intermediate updates when bursts occur.",
      },
      {
        title: "Lag hotspots",
        detail:
          "Check metrics dashboard to spot which lane accumulates the largest p95 lag under sustained bursts.",
      },
    ],
  },
};

export function getScenarioGuidance(scenarioName: string | undefined | null): ScenarioGuidance | null {
  if (!scenarioName) return null;
  const key = scenarioName.trim().toLowerCase();
  return GUIDANCE_BY_SCENARIO[key] ?? null;
}
