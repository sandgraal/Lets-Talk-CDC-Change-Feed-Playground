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

function evaluate() {
  const diff = diffLane("log", expectedOps, received);
  const deletesCaptured = received.filter(msg => msg.op === "d").length;
  const orderingOk = diff.totals.ordering === 0;
  const complete = diff.totals.missing === 0 && diff.totals.extra === 0;
  const pass = complete && orderingOk;
  return {
    total_events: received.length,
    deletes_expected: expectedDeletes,
    deletes_captured: deletesCaptured,
    ordering_ok: orderingOk,
    missing: diff.totals.missing,
    extra: diff.totals.extra,
    max_lag_ms: diff.lag.max,
    pass,
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
        const pkValue = envelope.after?.id ?? envelope.before?.id ?? envelope.key ?? null;
        const pk = pkValue != null ? String(pkValue) : null;
        const op = opCode === "c" ? "c" : opCode === "u" ? "u" : opCode === "d" ? "d" : "r";
        if (op === "r") return;
        const ts_ms = envelope.ts_ms || parsed.ts_ms || Date.now();
        const lsn = source.lsn || source.sequence || null;
        received.push({ op, table, ts_ms, tx: { lsn }, pk: { id: pk } });
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
