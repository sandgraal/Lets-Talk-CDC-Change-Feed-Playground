import pg from "pg";
import fs from "fs";

const scenarioPath = process.env.SCENARIO || "./scenario.json";
const scenario = JSON.parse(fs.readFileSync(scenarioPath, "utf8"));

const client = new pg.Client({
  host: process.env.PGHOST || "localhost",
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "postgres",
  database: process.env.PGDATABASE || "demo",
});

await client.connect();

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
console.log("scenario complete");
