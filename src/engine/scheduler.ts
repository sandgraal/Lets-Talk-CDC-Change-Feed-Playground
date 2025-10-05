type Task = {
  id: number;
  interval: number;
  handler: () => void;
};

export class Scheduler {
  private tasks = new Map<number, Task>();
  private nextId = 1;

  every(intervalMs: number, handler: () => void): number {
    const id = this.nextId++;
    const task: Task = { id, interval: intervalMs, handler };
    this.tasks.set(id, task);
    const timerId = setInterval(() => handler(), intervalMs);
    (task as unknown as { timerId: ReturnType<typeof setInterval> }).timerId = timerId;
    return id;
  }

  clear(id?: number) {
    if (id != null) {
      const task = this.tasks.get(id);
      if (task && (task as unknown as { timerId?: ReturnType<typeof setInterval> }).timerId) {
        clearInterval((task as unknown as { timerId: ReturnType<typeof setInterval> }).timerId);
      }
      this.tasks.delete(id);
      return;
    }

    this.tasks.forEach(task => {
      const timerId = (task as unknown as { timerId?: ReturnType<typeof setInterval> }).timerId;
      if (timerId) clearInterval(timerId);
    });
    this.tasks.clear();
  }
}
