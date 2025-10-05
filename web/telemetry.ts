export type TelemetryPayload = Record<string, unknown>;

export function track(event: string, payload: TelemetryPayload = {}, context: TelemetryPayload = {}) {
  if (typeof window === "undefined") return;
  const client = (window as any).telemetry;
  if (!client || typeof client.track !== "function") return;
  client.track(event, payload, context);
}

export function trackClockControl(action: string, detail: TelemetryPayload = {}) {
  track("comparator.clock.control", { action, ...detail });
}
