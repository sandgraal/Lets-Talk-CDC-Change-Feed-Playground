import type { FC } from "react";

export type EventLogProps = {
  events: Array<{ id: string; label: string }>;
};

/**
 * Minimal placeholder that will be replaced with the full event log UI. It renders nothing but
 * allows feature wiring to compile against a concrete component signature.
 */
export const EventLog: FC<EventLogProps> = () => null;
