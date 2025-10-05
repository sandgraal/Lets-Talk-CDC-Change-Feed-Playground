import type { CDCMode, Event, Table } from "../domain/types";
import type { EventBus } from "../engine/eventBus";
import type { Scheduler } from "../engine/scheduler";
import type { MetricsStore } from "../engine/metrics";

export type ModeIdentifier = Extract<CDCMode, 'LOG_BASED' | 'QUERY_BASED' | 'TRIGGER_BASED'>;

export type ModeRuntime = {
  bus: EventBus;
  scheduler: Scheduler;
  metrics: MetricsStore;
};

export type EmitFn = (events: Event[]) => void;

export interface ModeLifecycle {
  startSnapshot?(tables: Table[], emit: EmitFn): void;
  startTailing?(emit: EmitFn): void;
  pause?(): void;
  resume?(): void;
  stop?(): void;
}

export interface ModeAdapter extends ModeLifecycle {
  readonly id: ModeIdentifier;
  initialise?(runtime: ModeRuntime): void;
}
