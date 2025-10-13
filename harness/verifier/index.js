import { Kafka } from "kafkajs";
import http from "http";
import fs from "fs";
import path from "path";
import { diffLane } from "./diff.js";
import { renderHtml } from "./report.js";

const brokers = (process.env.KAFKA_BROKERS || "localhost:9092").split(",");
const topicPrefix = process.env.TOPIC_PREFIX || "dbserver1.public";
const explicitTopics = (process.env.TOPIC_LIST || process.env.TOPIC || "")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);
const scenarioPath = process.env.SCENARIO_PATH || path.resolve(process.cwd(), "../scenario.json");

if (!fs.existsSync(scenarioPath)) {
  console.error(`Scenario fixture missing at ${scenarioPath}`);
  process.exit(1);
}

const scenario = JSON.parse(fs.readFileSync(scenarioPath, "utf8"));
const expectedOps = Array.isArray(scenario.ops) ? scenario.ops : [];
const expectedDeletes = expectedOps.filter(op => op.op === "delete").length;
const expectedTables = new Set(
  expectedOps
    .map(op => op.table)
    .filter(table => typeof table === "string" && table.length)
    .map(table => table.toLowerCase()),
);

const topics = explicitTopics.length
  ? explicitTopics
  : expectedTables.size
    ? [...expectedTables].map(table => `${topicPrefix}.${table}`)
    : [`${topicPrefix}.customers`];

const kafka = new Kafka({ clientId: "verifier", brokers });
const consumer = kafka.consumer({ groupId: "verifier" });

const received = [];
const startedAt = Date.now();

function sanitizeRow(row) {
  if (!row || typeof row !== "object") return {};
  const result = {};
  Object.entries(row).forEach(([key, value]) => {
    if (value === undefined) return;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = sanitizeRow(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map(item => (item && typeof item === "object" ? sanitizeRow(item) : item));
    } else {
      result[key] = value;
    }
  });
  return result;
}

function reduceState(ops) {
  const state = new Map();
  ops.forEach(op => {
    const table = (op.table || "").toLowerCase();
    if (!table) return;
    const pk = op.pk != null ? String(op.pk) : "";
    if (!pk) return;
    const tableMap = state.get(table) ?? new Map();
    if (op.op === "delete") {
      tableMap.delete(pk);
    } else if (op.after && typeof op.after === "object") {
      const previous = tableMap.get(pk) || {};
      tableMap.set(pk, { ...previous, ...sanitizeRow(op.after) });
    }
    state.set(table, tableMap);
  });
  return state;
}

function coerceComparable(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const num = Number(trimmed);
    if (!Number.isNaN(num)) return num;
    return trimmed;
  }
  if (Array.isArray(value)) {
    return value.map(item => coerceComparable(item));
  }
  if (typeof value === "object") {
    const result = {};
    Object.keys(value)
      .sort()
      .forEach(key => {
        result[key] = coerceComparable(value[key]);
      });
    return result;
  }
  return value;
}

function stableStringify(value) {
  if (value === null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function diffRows(expectedRow, actualRow) {
  const diffs = [];
  const keys = new Set([
    ...Object.keys(expectedRow || {}),
    ...Object.keys(actualRow || {}),
  ]);
  keys.forEach(field => {
    const expectedValue = expectedRow?.[field];
    const actualValue = actualRow?.[field];
    if (!valuesEqual(expectedValue, actualValue)) {
      diffs.push({ field, expected: expectedValue, actual: actualValue });
    }
  });
  return diffs;
}

function valuesEqual(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  const normA = coerceComparable(a);
  const normB = coerceComparable(b);
  return stableStringify(normA) === stableStringify(normB);
}

function diffStates(expected, actual) {
  const summary = [];
  const mismatches = [];
  const tables = new Set([...expected.keys(), ...actual.keys()]);
  tables.forEach(table => {
    const expectedRows = expected.get(table) ?? new Map();
    const actualRows = actual.get(table) ?? new Map();
    summary.push({
      table,
      expected_rows: expectedRows.size,
      actual_rows: actualRows.size,
    });
    const pks = new Set([...expectedRows.keys(), ...actualRows.keys()]);
    pks.forEach(pk => {
      const expectedRow = expectedRows.get(pk);
      const actualRow = actualRows.get(pk);
      if (!expectedRow && actualRow) {
        mismatches.push({ type: "unexpected_row", table, pk, actual: actualRow });
      } else if (expectedRow && !actualRow) {
        mismatches.push({ type: "missing_row", table, pk, expected: expectedRow });
      } else if (expectedRow && actualRow) {
        const diffs = diffRows(expectedRow, actualRow);
        if (diffs.length) {
          mismatches.push({ type: "field_mismatch", table, pk, diffs });
        }
      }
    });
  });
  return { summary, mismatches };
}

function evaluate() {
  const diff = diffLane("log", expectedOps, received);
  const deletesCaptured = received.filter(msg => msg.op === "d").length;
  const orderingOk = diff.totals.ordering === 0;
  const complete = diff.totals.missing === 0 && diff.totals.extra === 0;
  const pass = complete && orderingOk;
  const normalizedExpected = expectedOps
    .map(op => ({
      table: (op.table || "customers").toLowerCase(),
      pk: op.pk?.id != null ? String(op.pk.id) : "",
      op: op.op,
      after: op.after ? sanitizeRow(op.after) : null,
      before: op.before ? sanitizeRow(op.before) : null,
    }))
    .filter(item => item.pk);
  const normalizedActual = received.map(event => ({
    table: (event.table || "").toLowerCase(),
    pk: event.pk ?? "",
    op: event.op === "d" ? "delete" : event.op === "u" ? "update" : "insert",
    after: event.op === "d" ? null : event.after,
    before: event.before,
  }));
  const expectedState = reduceState(normalizedExpected);
  const actualState = reduceState(normalizedActual);
  const stateReport = diffStates(expectedState, actualState);
  return {
    total_events: received.length,
    deletes_expected: expectedDeletes,
    deletes_captured: deletesCaptured,
    ordering_ok: orderingOk,
    missing: diff.totals.missing,
    extra: diff.totals.extra,
    max_lag_ms: diff.lag.max,
    pass,
    state: stateReport,
  };
}

function serveReport() {
  const server = http.createServer((_req, res) => {
    const report = evaluate();
    if (_req.url === "/report") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(report, null, 2));
      return;
    }
    if (_req.url === "/health") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(renderHtml(report, received));
  });

  server.listen(8089, () => {
    console.log("verifier report on 8089");
  });
}

(function attachProcessHandlers() {
  const shutdown = async () => {
    try {
      await consumer.disconnect();
    } catch (err) {
      console.warn("verifier shutdown warning", err);
    }
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
})();

function deriveTableFromTopic(topicName) {
  if (!topicName) return "";
  const parts = topicName.split(".");
  return parts.length ? parts[parts.length - 1]?.toLowerCase() ?? "" : "";
}

(async () => {
  await consumer.connect();
  for (const t of topics) {
    console.log(`subscribing to topic ${t}`);
    await consumer.subscribe({ topic: t, fromBeginning: true });
  }
  await consumer.run({
    eachMessage: async ({ message, topic: msgTopic }) => {
      try {
        const val = message.value?.toString();
        if (!val) return;
        const parsed = JSON.parse(val);
        const envelope = parsed?.payload && typeof parsed.payload === "object" ? parsed.payload : parsed;
        const opCode = envelope.op;
        if (!opCode || !["c", "u", "d", "r"].includes(opCode)) return;
        const source = envelope.source || {};
        const table = (source.table || deriveTableFromTopic(msgTopic) || "").toLowerCase();
        if (expectedTables.size && table && !expectedTables.has(table)) {
          return;
        }
        const keyPayload = parsed?.key && typeof parsed.key === "object"
          ? (parsed.key.payload ?? parsed.key)
          : null;
        const pkValue = envelope.after?.id ?? envelope.before?.id ?? keyPayload?.id ?? keyPayload ?? null;
        const op = opCode === "c" ? "c" : opCode === "u" ? "u" : opCode === "d" ? "d" : "r";
        if (op === "r") return;
        if (pkValue == null) return;
        const pk = String(pkValue);
        const ts_ms = envelope.ts_ms || parsed.ts_ms || Date.now();
        const lsn = source.lsn || source.sequence || null;
        const after = envelope.after ? sanitizeRow(envelope.after) : null;
        const before = envelope.before ? sanitizeRow(envelope.before) : null;
        received.push({ op, table, ts_ms, tx: { lsn }, pk, after, before });
      } catch (err) {
        console.warn("verifier parse error", err);
      }
    },
  });

  setInterval(() => {
    const report = evaluate();
    console.log(`[verifier] events=${report.total_events} pass=${report.pass}`);
  }, 10000).unref();

  serveReport();
})();
