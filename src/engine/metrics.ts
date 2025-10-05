import type { MetricsSnapshot } from '../domain/types';

type TimestampCarrier = {
  commitTs?: number;
  ts_ms?: number;
};

export type LagSampleAggregator = (values: number[]) => void;

export class MetricsStore {
  private produced = 0;
  private consumed = 0;
  private backlog = 0;
  private lagSamples: number[] = [];
  private missedDeletes = 0;
  private writeAmplification = 0;
  private snapshotRows = 0;
  private errors = 0;

  onProduced(events: TimestampCarrier[]) {
    this.produced += events.length;
    this.backlog += events.length;
  }

  onConsumed(events: TimestampCarrier[]) {
    this.consumed += events.length;
    this.backlog = Math.max(this.backlog - events.length, 0);
    const now = Date.now();
    events.forEach(evt => {
      const commitTs = typeof evt.commitTs === 'number'
        ? evt.commitTs
        : typeof evt.ts_ms === 'number'
          ? evt.ts_ms
          : now;
      const lag = Math.max(now - commitTs, 0);
      this.lagSamples.push(lag);
    });
    if (this.lagSamples.length > 2000) {
      this.lagSamples.splice(0, this.lagSamples.length - 2000);
    }
  }

  recordMissedDelete(count = 1) {
    this.missedDeletes += count;
  }

  recordWriteAmplification(delta = 1) {
    this.writeAmplification += delta;
  }

  recordSnapshotRows(count: number) {
    this.snapshotRows = count;
  }

  recordError() {
    this.errors += 1;
  }

  reset() {
    this.produced = 0;
    this.consumed = 0;
    this.backlog = 0;
    this.lagSamples = [];
    this.missedDeletes = 0;
    this.writeAmplification = 0;
    this.snapshotRows = 0;
    this.errors = 0;
  }

  snapshot(): MetricsSnapshot {
    const sortedLag = [...this.lagSamples].sort((a, b) => a - b);
    const p50 = this.percentile(sortedLag, 0.5);
    const p95 = this.percentile(sortedLag, 0.95);
    return {
      produced: this.produced,
      consumed: this.consumed,
      backlog: this.backlog,
      lagMsP50: p50,
      lagMsP95: p95,
      missedDeletes: this.missedDeletes,
      writeAmplification: this.writeAmplification,
      snapshotRows: this.snapshotRows,
      errors: this.errors,
    };
  }

  private percentile(sorted: number[], percentile: number): number {
    if (!sorted.length) return 0;
    const index = Math.max(sorted.length - 1, 0) * percentile;
    const lower = Math.floor(index);
    const upper = Math.min(lower + 1, sorted.length - 1);
    if (lower === upper) return sorted[lower];
    const fraction = index - lower;
    return sorted[lower] + (sorted[upper] - sorted[lower]) * fraction;
  }
}
