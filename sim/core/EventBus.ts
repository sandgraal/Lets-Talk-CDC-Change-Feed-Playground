type Handler<T> = (event: T) => void;

export class EventBus<T> {
  private handlers = new Set<Handler<T>>();

  emit(event: T) {
    this.handlers.forEach(handler => handler(event));
  }

  on(handler: Handler<T>) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}
