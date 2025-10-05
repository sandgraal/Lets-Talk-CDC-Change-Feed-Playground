import type { CdcEvent, SourceOp } from "../core/types";

const EVENT_OPS = new Set(["c", "u", "d"] as const);

type EventOp = "c" | "u" | "d";

export type LaneDiffIssueType = "missing" | "extra" | "ordering";

export type LaneDiffIssue = {
  type: LaneDiffIssueType;
  op: EventOp;
  pk: string;
  expectedIndex?: number;
  actualIndex?: number;
  expectedTime?: number;
  actualTime?: number;
  lagMs?: number;
};

export type LaneLagSample = {
  op: EventOp;
  pk: string;
  expectedTime: number;
  actualTime: number;
  lagMs: number;
};

export type LaneDiffResult = {
  method: string;
  totals: {
    missing: number;
    extra: number;
    ordering: number;
  };
  issues: LaneDiffIssue[];
  lag: {
    max: number;
    samples: LaneLagSample[];
  };
};

type ExpectedEntry = {
  key: string;
  op: EventOp;
  pk: string;
  index: number;
  time: number;
};

type ActualEntry = {
  key: string;
  op: EventOp;
  pk: string;
  index: number;
  time: number;
};

type MatchedPair = {
  expected: ExpectedEntry;
  actual: ActualEntry;
  lagMs: number;
};

function mapSourceOp(op: SourceOp): EventOp | null {
  switch (op.op) {
    case "insert":
      return "c";
    case "update":
      return "u";
    case "delete":
      return "d";
    default:
      return null;
  }
}

function buildExpectedEntries(sourceOps: SourceOp[]): ExpectedEntry[] {
  return sourceOps
    .map((op, index) => {
      const opCode = mapSourceOp(op);
      if (!opCode) return null;
      const pk = op.pk?.id != null ? String(op.pk.id) : "";
      return {
        key: `${opCode}::${pk}`,
        op: opCode,
        pk,
        index,
        time: op.t,
      };
    })
    .filter((entry): entry is ExpectedEntry => Boolean(entry));
}

function buildActualEntries(events: CdcEvent[]): ActualEntry[] {
  return events
    .map((event, index) => {
      if (!EVENT_OPS.has(event.op as EventOp)) return null;
      const pk = event.pk?.id != null ? String(event.pk.id) : "";
      const op = event.op as EventOp;
      return {
        key: `${op}::${pk}`,
        op,
        pk,
        index,
        time: event.ts_ms,
      };
    })
    .filter((entry): entry is ActualEntry => Boolean(entry));
}

function toBuckets<T extends { key: string }>(entries: T[]): Map<string, T[]> {
  const buckets = new Map<string, T[]>();
  for (const entry of entries) {
    const bucket = buckets.get(entry.key);
    if (bucket) {
      bucket.push(entry);
    } else {
      buckets.set(entry.key, [entry]);
    }
  }
  return buckets;
}

function matchEntries(expected: ExpectedEntry[], actual: ActualEntry[]): {
  matched: MatchedPair[];
  missing: ExpectedEntry[];
  extra: ActualEntry[];
} {
  const matched: MatchedPair[] = [];
  const missing: ExpectedEntry[] = [];
  const extra: ActualEntry[] = [];

  const expectedBuckets = toBuckets(expected);
  const actualBuckets = toBuckets(actual);
  const keys = new Set<string>([...expectedBuckets.keys(), ...actualBuckets.keys()]);

  for (const key of keys) {
    const expectedList = expectedBuckets.get(key) ?? [];
    const actualList = actualBuckets.get(key) ?? [];
    const pairCount = Math.min(expectedList.length, actualList.length);

    for (let i = 0; i < pairCount; i++) {
      const exp = expectedList[i];
      const act = actualList[i];
      matched.push({
        expected: exp,
        actual: act,
        lagMs: Math.max(0, act.time - exp.time),
      });
    }

    for (let i = pairCount; i < expectedList.length; i++) {
      missing.push(expectedList[i]);
    }

    for (let i = pairCount; i < actualList.length; i++) {
      extra.push(actualList[i]);
    }
  }

  return { matched, missing, extra };
}

function detectOrderingIssues(matched: MatchedPair[]): LaneDiffIssue[] {
  const issues: LaneDiffIssue[] = [];
  const ordered = [...matched].sort((a, b) => a.actual.index - b.actual.index);
  let lastExpectedIndex = -Infinity;

  for (const pair of ordered) {
    if (pair.expected.index < lastExpectedIndex) {
      issues.push({
        type: "ordering",
        op: pair.expected.op,
        pk: pair.expected.pk,
        expectedIndex: pair.expected.index,
        actualIndex: pair.actual.index,
        expectedTime: pair.expected.time,
        actualTime: pair.actual.time,
      });
    } else {
      lastExpectedIndex = pair.expected.index;
    }
  }

  return issues;
}

function buildLagSamples(matched: MatchedPair[]): LaneLagSample[] {
  return matched
    .filter(pair => pair.lagMs > 0)
    .sort((a, b) => b.lagMs - a.lagMs)
    .slice(0, 5)
    .map(pair => ({
      op: pair.expected.op,
      pk: pair.expected.pk,
      expectedTime: pair.expected.time,
      actualTime: pair.actual.time,
      lagMs: pair.lagMs,
    }));
}

export function diffLane(method: string, scenarioOps: SourceOp[], events: CdcEvent[]): LaneDiffResult {
  const expectedEntries = buildExpectedEntries(scenarioOps);
  const actualEntries = buildActualEntries(events);
  const { matched, missing, extra } = matchEntries(expectedEntries, actualEntries);

  const issues: LaneDiffIssue[] = [];

  for (const miss of missing) {
    issues.push({
      type: "missing",
      op: miss.op,
      pk: miss.pk,
      expectedIndex: miss.index,
      expectedTime: miss.time,
    });
  }

  for (const surplus of extra) {
    issues.push({
      type: "extra",
      op: surplus.op,
      pk: surplus.pk,
      actualIndex: surplus.index,
      actualTime: surplus.time,
    });
  }

  issues.push(...detectOrderingIssues(matched));

  const lagSamples = buildLagSamples(matched);
  const maxLag = lagSamples.reduce((max, sample) => Math.max(max, sample.lagMs), 0);

  return {
    method,
    totals: {
      missing: issues.filter(issue => issue.type === "missing").length,
      extra: issues.filter(issue => issue.type === "extra").length,
      ordering: issues.filter(issue => issue.type === "ordering").length,
    },
    issues,
    lag: {
      max: maxLag,
      samples: lagSamples,
    },
  };
}

export function diffAllLanes(
  scenarioOps: SourceOp[],
  lanes: Array<{ method: string; events: CdcEvent[] }>,
): LaneDiffResult[] {
  return lanes.map(lane => diffLane(lane.method, scenarioOps, lane.events));
}
