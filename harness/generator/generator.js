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

const TABLE_CONFIG = {
  customers: {
    columns: ["name", "email"],
    insertDefaults: { deleted: false },
    updateAssignments: ["deleted = false"],
    hasUpdatedAt: true,
  },
  orders: {
    columns: ["status", "total"],
    hasUpdatedAt: true,
  },
  order_items: {
    columns: ["order_id", "sku", "qty"],
    hasUpdatedAt: true,
  },
};

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

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj ?? {}, key);

const ensureTable = table => {
  if (!TABLE_CONFIG[table]) {
    console.warn(`Skipping op for unsupported table '${table}'`);
    return false;
  }
  return true;
};

const upsertRow = async (table, op) => {
  const config = TABLE_CONFIG[table];
  const data = op.after ?? {};
  const dynamicColumns = config.columns.filter(col => hasOwn(data, col));

  const insertColumns = [];
  const insertExpressions = [];
  const insertValues = [];
  let paramIndex = 1;

  const addParam = (column, value) => {
    insertColumns.push(column);
    insertExpressions.push(`$${paramIndex++}`);
    insertValues.push(value);
  };

  const addExpression = (column, expression) => {
    insertColumns.push(column);
    insertExpressions.push(expression);
  };

  addParam("id", op.pk.id);

  dynamicColumns.forEach(col => addParam(col, data[col]));

  if (config.insertDefaults) {
    for (const [column, value] of Object.entries(config.insertDefaults)) {
      if (!hasOwn(data, column)) addParam(column, value);
    }
  }

  if (config.hasUpdatedAt) {
    addExpression("updated_at", "now()");
  }

  const updateAssignments = [];

  dynamicColumns.forEach(col => updateAssignments.push(`${col} = excluded.${col}`));

  if (config.updateAssignments) {
    updateAssignments.push(...config.updateAssignments);
  }

  if (config.hasUpdatedAt) {
    updateAssignments.push("updated_at = now()");
  }

  if (updateAssignments.length === 0) {
    updateAssignments.push(config.hasUpdatedAt ? "updated_at = now()" : "id = excluded.id");
  }

  const sql = `
    insert into ${table} (${insertColumns.join(", ")})
    values (${insertExpressions.join(", ")})
    on conflict (id) do update set ${updateAssignments.join(", ")}
  `;

  await client.query(sql, insertValues);
};

const deleteRow = async (table, id) => {
  const config = TABLE_CONFIG[table];
  if (config?.deleteSoft) {
    const assignments = config.hasUpdatedAt ? "deleted = true, updated_at = now()" : "deleted = true";
    await client.query(`update ${table} set ${assignments} where id = $1`, [id]);
    return;
  }
  await client.query(`delete from ${table} where id = $1`, [id]);
};

for (const op of scenario.ops) {
  const wait = Math.max(0, start + op.t - Date.now());
  if (wait) await new Promise(resolve => setTimeout(resolve, wait));

  if (!op?.table || !op?.pk?.id) {
    console.warn("Skipping op with missing table or pk", op);
    continue;
  }

  if (!ensureTable(op.table)) continue;

  if (op.op === "delete") {
    await deleteRow(op.table, op.pk.id);
    continue;
  }

  await upsertRow(op.table, op);
}

await client.end();
console.log(`scenario '${scenario.id || "custom"}' complete: ${scenario.ops.length} ops`);
process.exit(0);
