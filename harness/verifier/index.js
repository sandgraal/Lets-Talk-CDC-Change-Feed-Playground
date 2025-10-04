import { Kafka } from "kafkajs";
import http from "http";

const brokers = (process.env.KAFKA_BROKERS || "localhost:9092").split(",");
const topic = process.env.TOPIC || "dbserver1.public.customers";

const kafka = new Kafka({ clientId: "verifier", brokers });
const consumer = kafka.consumer({ groupId: "verifier" });

const received = [];
const startedAt = Date.now();

function serveReport() {
  const server = http.createServer((_req, res) => {
    const report = {
      total: received.length,
      deletes: received.filter(msg => msg.op === "d").length,
      ordering_ok: isOrdered(received),
      first_event_ms: received[0]?.ts_ms ? received[0].ts_ms - startedAt : null,
    };
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(report, null, 2));
  });

  server.listen(8089, () => {
    console.log("verifier report on 8089");
  });
}

function isOrdered(msgs) {
  let prev = -Infinity;
  for (const msg of msgs) {
    const lsn = msg.tx?.lsn ?? null;
    if (lsn != null) {
      if (lsn < prev) return false;
      prev = lsn;
    }
  }
  return true;
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
        received.push({ op, ts_ms: parsed.ts_ms || Date.now(), tx: { lsn } });
      } catch (err) {
        console.warn("verifier parse error", err);
      }
    },
  });

  serveReport();
})();
