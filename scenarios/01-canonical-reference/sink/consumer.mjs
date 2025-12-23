/**
 * Sink Consumer for The Failure-Aware CDC Reference Pipeline
 *
 * Consumes CDC events from Kafka and applies them to the sink database.
 * Demonstrates:
 * - Idempotent upserts
 * - Deduplication
 * - Schema evolution handling
 * - Error recovery
 */

import { Kafka } from "kafkajs";
import pg from "pg";

const { Pool } = pg;

// Configuration
const kafkaConfig = {
  brokers: [process.env.KAFKA_BROKER || "localhost:29092"],
  clientId: "cdc-sink-consumer",
};

const consumerConfig = {
  groupId: process.env.CONSUMER_GROUP || "cdc-sink-consumer",
};

const topicPrefix = process.env.KAFKA_TOPIC_PREFIX || "cdc-source";

const sinkConfig = {
  host: process.env.SINK_HOST || "localhost",
  port: parseInt(process.env.SINK_PORT || "5433"),
  user: process.env.SINK_USER || "postgres",
  password: process.env.SINK_PASSWORD || "postgres",
  database: process.env.SINK_DB || "sink",
};

const enableDedup = process.env.ENABLE_DEDUP === "true";
const logLevel = process.env.LOG_LEVEL || "info";

// Initialize clients
const kafka = new Kafka(kafkaConfig);
const consumer = kafka.consumer(consumerConfig);
const pool = new Pool(sinkConfig);

// Table mappings
const tableConfigs = {
  customers: {
    keyField: "id",
    columns: [
      "id",
      "external_id",
      "name",
      "email",
      "created_at",
      "updated_at",
      "deleted_at",
      "version",
    ],
  },
  orders: {
    keyField: "id",
    columns: [
      "id",
      "external_id",
      "customer_id",
      "status",
      "subtotal",
      "tax",
      "total",
      "created_at",
      "updated_at",
      "shipped_at",
      "version",
    ],
  },
  order_items: {
    keyField: "id",
    columns: [
      "id",
      "order_id",
      "sku",
      "name",
      "quantity",
      "unit_price",
      "line_total",
      "created_at",
    ],
  },
};

// Metrics
let metrics = {
  messagesProcessed: 0,
  insertsApplied: 0,
  updatesApplied: 0,
  deletesApplied: 0,
  duplicatesSkipped: 0,
  errorsEncountered: 0,
  lastProcessedAt: null,
};

// Paused state for lag simulation
let isPaused = false;

function log(level, message, data = {}) {
  const levels = { debug: 0, info: 1, warn: 2, error: 3 };
  if (levels[level] >= levels[logLevel]) {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        message,
        ...data,
      })
    );
  }
}

/**
 * Check if we've already processed this message (deduplication)
 */
async function isDuplicate(topic, partition, offset, recordKey) {
  if (!enableDedup) return false;

  const result = await pool.query(
    "SELECT 1 FROM _cdc_dedup WHERE topic = $1 AND partition = $2 AND offset_value = $3",
    [topic, partition, offset]
  );

  return result.rows.length > 0;
}

/**
 * Record that we've processed this message
 */
async function recordProcessed(topic, partition, offset, recordKey) {
  if (!enableDedup) return;

  await pool.query(
    "INSERT INTO _cdc_dedup (topic, partition, offset_value, record_key) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
    [topic, partition, offset, recordKey]
  );
}

/**
 * Extract table name from topic
 */
function getTableFromTopic(topic) {
  // Topic format: cdc-source.public.customers
  const parts = topic.split(".");
  return parts[parts.length - 1];
}

/**
 * Parse Debezium message
 */
function parseDebeziumMessage(message) {
  const value = JSON.parse(message.value.toString());
  const key = message.key ? JSON.parse(message.key.toString()) : null;

  // Handle schema-enabled format
  const payload = value.payload || value;
  const keyPayload = key?.payload || key;

  return {
    op: payload.op, // c=create, u=update, d=delete, r=read (snapshot)
    before: payload.before,
    after: payload.after,
    source: payload.source,
    ts_ms: payload.ts_ms,
    key: keyPayload,
  };
}

/**
 * Handle schema evolution - detect new columns and add them dynamically
 * This demonstrates graceful handling of ALTER TABLE on the source.
 */
async function handleSchemaEvolution(tableName, config, data) {
  if (!data) return;

  // Find columns in the data that we don't know about
  const knownColumns = new Set(config.columns);
  const incomingColumns = Object.keys(data).filter(
    (col) => !col.startsWith('_') && data[col] !== undefined
  );
  
  const newColumns = incomingColumns.filter(col => !knownColumns.has(col));
  
  if (newColumns.length === 0) return;

  log('info', `Schema evolution detected for ${tableName}`, { 
    newColumns,
    existingColumns: config.columns.length 
  });

  // Try to add each new column to the sink table
  for (const col of newColumns) {
    // Infer column type from the data
    const value = data[col];
    let pgType = 'TEXT'; // Default to TEXT for maximum flexibility
    
    if (typeof value === 'number') {
      pgType = Number.isInteger(value) ? 'INTEGER' : 'NUMERIC';
    } else if (typeof value === 'boolean') {
      pgType = 'BOOLEAN';
    } else if (value instanceof Date || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value))) {
      pgType = 'TIMESTAMPTZ';
    }

    try {
      // Use the helper function to add column if missing
      const result = await pool.query(
        'SELECT add_column_if_missing($1, $2, $3) as added',
        [tableName, col, pgType]
      );
      
      if (result.rows[0]?.added) {
        log('info', `Added new column: ${tableName}.${col} (${pgType})`);
        // Update our config so we include this column going forward
        config.columns.push(col);
      }
    } catch (err) {
      log('warn', `Failed to add column ${col} to ${tableName}`, { 
        error: err.message 
      });
    }
  }
}

/**
 * Apply CDC event to sink database
 */
async function applyEvent(tableName, event, metadata) {
  const config = tableConfigs[tableName];
  if (!config) {
    log("warn", `Unknown table: ${tableName}`);
    return;
  }

  const { op, before, after, source, ts_ms } = event;
  const cdcMetadata = {
    _cdc_source_ts: ts_ms ? new Date(ts_ms).toISOString() : null,
    _cdc_op: op,
    _cdc_lsn: source?.lsn?.toString(),
  };

  try {
    switch (op) {
      case "c": // Create
      case "r": // Snapshot read
        await upsertRecord(tableName, config, after, cdcMetadata);
        metrics.insertsApplied++;
        break;

      case "u": // Update
        await upsertRecord(tableName, config, after, cdcMetadata);
        metrics.updatesApplied++;
        break;

      case "d": // Delete
        await deleteRecord(tableName, config, before, cdcMetadata);
        metrics.deletesApplied++;
        break;

      default:
        log("warn", `Unknown operation: ${op}`);
    }
  } catch (err) {
    log("error", `Failed to apply event`, {
      table: tableName,
      op,
      error: err.message,
    });
    metrics.errorsEncountered++;

    // Log to processing log
    await pool.query(
      "INSERT INTO _cdc_processing_log (event_type, table_name, record_id, details) VALUES ($1, $2, $3, $4)",
      ["ERROR", tableName, after?.id || before?.id, { error: err.message, op }]
    );
  }
}

/**
 * Upsert a record (idempotent insert/update)
 * Handles schema evolution by detecting new columns and adding them dynamically
 */
async function upsertRecord(tableName, config, data, cdcMetadata) {
  if (!data) return;

  // Detect any new columns in the incoming data that we don't know about
  await handleSchemaEvolution(tableName, config, data);

  // Build column list - only include columns that exist in the data
  const availableColumns = config.columns.filter(
    (col) => data[col] !== undefined
  );
  const allColumns = [
    ...availableColumns,
    "_cdc_source_ts",
    "_cdc_op",
    "_cdc_lsn",
  ];

  // Build values
  const values = [
    ...availableColumns.map((col) => data[col]),
    cdcMetadata._cdc_source_ts,
    cdcMetadata._cdc_op,
    cdcMetadata._cdc_lsn,
  ];

  // Build upsert query
  const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
  const updateSet = allColumns
    .filter((col) => col !== config.keyField)
    .map((col) => `${col} = EXCLUDED.${col}`)
    .join(", ");

  const query = `
    INSERT INTO ${tableName} (${allColumns.join(", ")})
    VALUES (${placeholders})
    ON CONFLICT (${config.keyField}) DO UPDATE SET
      ${updateSet},
      _cdc_received = NOW()
  `;

  await pool.query(query, values);

  log("debug", `Upserted ${tableName}`, { id: data[config.keyField] });
}

/**
 * Delete a record
 */
async function deleteRecord(tableName, config, data, cdcMetadata) {
  if (!data) return;

  // For soft-delete tables, we might want to set deleted_at instead
  // For this demo, we'll do a hard delete but log it

  await pool.query(`DELETE FROM ${tableName} WHERE ${config.keyField} = $1`, [
    data[config.keyField],
  ]);

  await pool.query(
    "INSERT INTO _cdc_processing_log (event_type, table_name, record_id, details) VALUES ($1, $2, $3, $4)",
    ["DELETE", tableName, data[config.keyField], cdcMetadata]
  );

  log("debug", `Deleted from ${tableName}`, { id: data[config.keyField] });
}

/**
 * Main message handler
 */
async function handleMessage({ topic, partition, message }) {
  // Check if paused (for lag simulation)
  if (isPaused) {
    log("debug", "Consumer paused, waiting...");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return;
  }

  const offset = message.offset;
  const tableName = getTableFromTopic(topic);

  // Parse the message
  let event;
  try {
    event = parseDebeziumMessage(message);
  } catch (err) {
    log("error", "Failed to parse message", { error: err.message });
    metrics.errorsEncountered++;
    return;
  }

  // Check for duplicates
  const recordKey =
    event.key?.id || event.after?.id || event.before?.id || "unknown";
  if (await isDuplicate(topic, partition, offset, recordKey)) {
    log("debug", "Duplicate message skipped", { topic, partition, offset });
    metrics.duplicatesSkipped++;
    return;
  }

  // Apply the event
  await applyEvent(tableName, event, { topic, partition, offset });

  // Record as processed
  await recordProcessed(topic, partition, offset, recordKey);

  metrics.messagesProcessed++;
  metrics.lastProcessedAt = new Date().toISOString();
}

/**
 * Start the consumer
 */
async function start() {
  log("info", "CDC Sink Consumer starting...", {
    kafkaBrokers: kafkaConfig.brokers,
    consumerGroup: consumerConfig.groupId,
    topicPrefix,
    sinkDb: `${sinkConfig.host}:${sinkConfig.port}/${sinkConfig.database}`,
    dedupEnabled: enableDedup,
  });

  // Wait for sink database
  let dbReady = false;
  for (let i = 0; i < 30 && !dbReady; i++) {
    try {
      await pool.query("SELECT 1");
      dbReady = true;
    } catch (err) {
      log("info", `Waiting for sink database... (${30 - i} retries left)`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  if (!dbReady) {
    log("error", "Could not connect to sink database");
    process.exit(1);
  }

  // Connect to Kafka
  await consumer.connect();

  // Subscribe to topics
  const topics = Object.keys(tableConfigs).map(
    (table) => `${topicPrefix}.public.${table}`
  );
  for (const topic of topics) {
    await consumer.subscribe({ topic, fromBeginning: true });
    log("info", `Subscribed to topic: ${topic}`);
  }

  // Start consuming
  await consumer.run({
    eachMessage: handleMessage,
  });

  log("info", "Consumer running");
}

/**
 * Handle pause/resume signals (for lag simulation)
 */
process.on("SIGUSR1", () => {
  isPaused = true;
  log("info", "Consumer PAUSED (SIGUSR1)");
});

process.on("SIGUSR2", () => {
  isPaused = false;
  log("info", "Consumer RESUMED (SIGUSR2)");
});

/**
 * Graceful shutdown
 */
async function shutdown() {
  log("info", "Shutting down...", { metrics });
  await consumer.disconnect();
  await pool.end();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Start
start().catch((err) => {
  log("error", "Fatal error", { error: err.message });
  process.exit(1);
});
