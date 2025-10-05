export type BusEvent = { offset?: number } & Record<string, unknown>;

type TopicState<T extends BusEvent> = {
  offset: number;
  queue: T[];
};

export class EventBus<T extends BusEvent = BusEvent> {
  private topics = new Map<string, TopicState<T>>();

  publish(topic: string, events: T[]): T[] {
    if (events.length === 0) return [];
    const state = this.ensure(topic);
    return events.map(evt => {
      const offset = ++state.offset;
      const enriched = { ...evt, offset } as T;
      state.queue.push(enriched);
      return enriched;
    });
  }

  consume(topic: string, max = 1): T[] {
    const state = this.ensure(topic);
    if (max <= 0) return [];
    return state.queue.splice(0, max);
  }

  size(topic: string): number {
    return this.ensure(topic).queue.length;
  }

  reset(topic?: string) {
    if (topic) {
      this.topics.delete(topic);
      return;
    }
    this.topics.clear();
  }

  private ensure(topic: string): TopicState<T> {
    let state = this.topics.get(topic);
    if (!state) {
      state = { offset: -1, queue: [] };
      this.topics.set(topic, state);
    }
    return state;
  }
}
