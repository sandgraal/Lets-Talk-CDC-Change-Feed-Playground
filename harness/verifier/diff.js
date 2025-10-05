export function diffLane(method, scenarioOps, events) {
  const expected = buildExpected(scenarioOps);
  const actual = buildActual(events);
  const { matched, missing, extra } = matchEntries(expected, actual);

  const issues = [];
  missing.forEach(item => {
    issues.push({
      type: "missing",
      op: item.op,
      pk: item.pk,
      expectedIndex: item.index,
      expectedTime: item.time,
    });
  });
  extra.forEach(item => {
    issues.push({
      type: "extra",
      op: item.op,
      pk: item.pk,
      actualIndex: item.index,
      actualTime: item.time,
    });
  });
  issues.push(...detectOrderingIssues(matched));

  const lagSamples = matched
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

function mapOp(op) {
  if (!op) return null;
  if (op === "insert") return "c";
  if (op === "update") return "u";
  if (op === "delete") return "d";
  return null;
}

function buildExpected(ops) {
  return (ops || [])
    .map((op, index) => {
      const code = mapOp(op.op);
      if (!code) return null;
      const pk = op.pk?.id != null ? String(op.pk.id) : "";
      return {
        key: `${code}::${pk}`,
        op: code,
        pk,
        index,
        time: Number(op.t) || 0,
      };
    })
    .filter(Boolean);
}

function buildActual(events) {
  return (events || [])
    .map((event, index) => {
      const code = event.op;
      if (!code || !["c", "u", "d"].includes(code)) return null;
      const pk = event.pk?.id != null ? String(event.pk.id) : "";
      return {
        key: `${code}::${pk}`,
        op: code,
        pk,
        index,
        time: Number(event.ts_ms) || 0,
      };
    })
    .filter(Boolean);
}

function matchEntries(expected, actual) {
  const matched = [];
  const missing = [];
  const extra = [];

  const expectedBuckets = bucketByKey(expected);
  const actualBuckets = bucketByKey(actual);
  const keys = new Set([...expectedBuckets.keys(), ...actualBuckets.keys()]);

  keys.forEach(key => {
    const expectedList = expectedBuckets.get(key) || [];
    const actualList = actualBuckets.get(key) || [];
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
  });

  return { matched, missing, extra };
}

function bucketByKey(entries) {
  const map = new Map();
  entries.forEach(entry => {
    const bucket = map.get(entry.key);
    if (bucket) {
      bucket.push(entry);
    } else {
      map.set(entry.key, [entry]);
    }
  });
  return map;
}

function detectOrderingIssues(matched) {
  const issues = [];
  const ordered = [...matched].sort((a, b) => a.actual.index - b.actual.index);
  let lastExpectedIndex = -Infinity;

  ordered.forEach(pair => {
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
  });

  return issues;
}
