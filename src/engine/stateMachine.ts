import type { CDCMode, Event, Table } from '../domain/types';
import { EventBus } from './eventBus';
import { Scheduler } from './scheduler';
import { MetricsStore } from './metrics';

type State = 'IDLE' | 'SNAPSHOTTING' | 'TAILING' | 'PAUSED';

type EmitFn = (events: Event[]) => void;

type ModeHandlers = {
  startSnapshot?: (tables: Table[], emit: EmitFn) => void;
  startTailing?: (emit: EmitFn) => void;
  stop?: () => void;
};

export class CDCController {
  private state: State = 'IDLE';
  private readonly topic: string;

  constructor(
    private readonly mode: CDCMode,
    private readonly bus: EventBus<Event>,
    private readonly scheduler: Scheduler,
    private readonly metrics: MetricsStore,
    topic?: string,
    private readonly handlers: ModeHandlers = {},
  ) {
    this.topic = topic ?? `cdc.${mode.toLowerCase()}`;
  }

  get currentState(): State {
    return this.state;
  }

  get topicName(): string {
    return this.topic;
  }

  startSnapshot(tables: Table[]) {
    if (this.state !== 'IDLE') return;
    this.state = 'SNAPSHOTTING';
    this.handlers.startSnapshot?.(tables, events => this.emit(events));
  }

  startTailing() {
    if (this.state === 'TAILING') return;
    this.state = 'TAILING';
    this.handlers.startTailing?.(events => this.emit(events));
  }

  pause() {
    if (this.state !== 'TAILING') return;
    this.state = 'PAUSED';
  }

  resume() {
    if (this.state !== 'PAUSED') return;
    this.state = 'TAILING';
  }

  stop() {
    this.state = 'IDLE';
    this.scheduler.clear();
    this.handlers.stop?.();
    this.bus.reset(this.topic);
    this.metrics.reset();
  }

  emit(events: Event[]) {
    if (events.length === 0) return;
    const enriched = this.bus.publish(this.topic, events);
    this.metrics.onProduced(enriched);
  }
}
