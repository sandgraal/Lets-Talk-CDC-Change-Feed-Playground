import pg from "pg";
import fs from "fs";
import path from "path";

const scenarioPath = process.env.SCENARIO_PATH || process.env.SCENARIO || path.resolve(process.cwd(), "../scenario.json");
if (!fs.existsSync(scenarioPath)) {
  console.error(`Scenario file not found at ${scenarioPath}`);
  process.exit(1);
}
const scenario = JSON.parse(fs.readFileSync(scenarioPath, "utf8"));
scenario.ops = Array.isArray(scenario.ops)
  ? [...scenario.ops].sort((a, b) => (a.t ?? 0) - (b.t ?? 0))
  : [];

const client = new pg.Client({
  host: process.env.PGHOST || "localhost",
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "postgres",
  database: process.env.PGDATABASE || "demo",
});

const MAX_RETRIES = Number(process.env.CONNECT_RETRIES || 20);
for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
  try {
    await client.connect();
    break;
  } catch (err) {
    if (attempt === MAX_RETRIES) {
      console.error("Failed to connect to Postgres", err?.message || err);
      process.exit(1);
    }
    const backoff = Math.min(5000, attempt * 250);
    console.log(`Postgres unavailable (attempt ${attempt}). Retrying in ${backoff}ms`);
    await new Promise(resolve => setTimeout(resolve, backoff));
  }
}

const start = Date.now();

for (const op of scenario.ops) {
  const wait = Math.max(0, start + op.t - Date.now());
  if (wait) await new Promise(resolve => setTimeout(resolve, wait));

  if (op.op === "insert") {
    await client.query(
      `insert into customers(id, name, email, updated_at, deleted)
       values($1, $2, $3, now(), false)
       on conflict (id)
       do update set name = excluded.name, email = excluded.email, updated_at = now()`,
      [op.pk.id, op.after.name || null, op.after.email || null],
    );
  } else if (op.op === "update") {
    await client.query(
      `update customers
         set name = $2,
             email = $3,
             updated_at = now()
       where id = $1`,
      [op.pk.id, op.after.name || null, op.after.email || null],
    );
  } else if (op.op === "delete") {
    await client.query(`delete from customers where id = $1`, [op.pk.id]);
  }
}

await client.end();
console.log(`scenario '${scenario.id || "custom"}' complete: ${scenario.ops.length} ops`);
process.exit(0);
