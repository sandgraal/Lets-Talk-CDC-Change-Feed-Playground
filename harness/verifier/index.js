import { Kafka } from "kafkajs";
import http from "http";
import fs from "fs";
import path from "path";
import { diffLane } from "./diff.js";
import { renderHtml } from "./report.js";

const brokers = (process.env.KAFKA_BROKERS || "localhost:9092").split(",");
const topic = process.env.TOPIC || "dbserver1.public.customers";
const scenarioPath = process.env.SCENARIO_PATH || path.resolve(process.cwd(), "../scenario.json");

if (!fs.existsSync(scenarioPath)) {
  console.error(`Scenario fixture missing at ${scenarioPath}`);
  process.exit(1);
}

const scenario = JSON.parse(fs.readFileSync(scenarioPath, "utf8"));
const expectedOps = Array.isArray(scenario.ops) ? scenario.ops : [];
const expectedDeletes = expectedOps.filter(op => op.op === "delete").length;

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

(async () => {
  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: true });
  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const val = message.value?.toString();
        if (!val) return;
        const parsed = JSON.parse(val);
        const op = parsed.op === "c" ? "c" : parsed.op === "u" ? "u" : parsed.op === "d" ? "d" : "r";
        const lsn = parsed?.source?.lsn || parsed?.source?.sequence || null;
        const pk = (parsed.after?.id ?? parsed.before?.id ?? parsed?.payload?.op ?? "") || null;
        received.push({ op, ts_ms: parsed.ts_ms || Date.now(), tx: { lsn }, pk });
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
