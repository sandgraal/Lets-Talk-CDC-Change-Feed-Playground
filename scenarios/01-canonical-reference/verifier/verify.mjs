/**
 * Verifier for The Failure-Aware CDC Reference Pipeline
 *
 * Continuously compares source and sink databases to verify CDC correctness.
 * Exposes an HTTP endpoint for real-time verification reports.
 */

import http from "http";
import pg from "pg";

const { Pool } = pg;

// Configuration
const sourceConfig = {
  host: process.env.SOURCE_HOST || "localhost",
  port: parseInt(process.env.SOURCE_PORT || "5432"),
  user: process.env.SOURCE_USER || "postgres",
  password: process.env.SOURCE_PASSWORD || "postgres",
  database: process.env.SOURCE_DB || "source",
};

const sinkConfig = {
  host: process.env.SINK_HOST || "localhost",
  port: parseInt(process.env.SINK_PORT || "5433"),
  user: process.env.SINK_USER || "postgres",
  password: process.env.SINK_PASSWORD || "postgres",
  database: process.env.SINK_DB || "sink",
};

const verifyIntervalMs = parseInt(process.env.VERIFY_INTERVAL_MS || "10000");
const httpPort = parseInt(process.env.HTTP_PORT || "8089");

// Initialize pools
const sourcePool = new Pool(sourceConfig);
const sinkPool = new Pool(sinkConfig);

// Tables to verify
const tablesToVerify = ["customers", "orders", "order_items"];

// Latest verification report
let latestReport = {
  timestamp: null,
  status: "initializing",
  tables: {},
  summary: {
    totalSourceRows: 0,
    totalSinkRows: 0,
    totalMismatches: 0,
    totalMissing: 0,
    totalOrphans: 0,
  },
  failures: [],
  history: [],
};

/**
 * Get row counts for a table in both databases
 */
async function getRowCounts(tableName) {
  const [sourceResult, sinkResult] = await Promise.all([
    sourcePool.query(`SELECT COUNT(*) as count FROM ${tableName}`),
    sinkPool.query(`SELECT COUNT(*) as count FROM ${tableName}`),
  ]);

  return {
    source: parseInt(sourceResult.rows[0].count),
    sink: parseInt(sinkResult.rows[0].count),
  };
}

/**
 * Get all primary keys from a table
 */
async function getPrimaryKeys(pool, tableName) {
  const result = await pool.query(`SELECT id FROM ${tableName} ORDER BY id`);
  return new Set(result.rows.map((row) => row.id));
}

/**
 * Compare a specific row between source and sink
 */
async function compareRow(tableName, id, columns) {
  const [sourceResult, sinkResult] = await Promise.all([
    sourcePool.query(
      `SELECT ${columns.join(", ")} FROM ${tableName} WHERE id = $1`,
      [id]
    ),
    sinkPool.query(
      `SELECT ${columns.join(", ")} FROM ${tableName} WHERE id = $1`,
      [id]
    ),
  ]);

  const sourceRow = sourceResult.rows[0];
  const sinkRow = sinkResult.rows[0];

  if (!sourceRow && !sinkRow) {
    return { status: "both_missing", id };
  }
  if (!sourceRow) {
    return { status: "orphan_in_sink", id };
  }
  if (!sinkRow) {
    return { status: "missing_in_sink", id };
  }

  // Compare values
  const differences = [];
  for (const col of columns) {
    const sourceVal = JSON.stringify(sourceRow[col]);
    const sinkVal = JSON.stringify(sinkRow[col]);
    if (sourceVal !== sinkVal) {
      differences.push({
        column: col,
        source: sourceRow[col],
        sink: sinkRow[col],
      });
    }
  }

  if (differences.length > 0) {
    return { status: "mismatch", id, differences };
  }

  return { status: "match", id };
}

/**
 * Verify a single table
 */
async function verifyTable(tableName) {
  const result = {
    tableName,
    timestamp: new Date().toISOString(),
    counts: { source: 0, sink: 0 },
    missing: [],
    orphans: [],
    mismatches: [],
    sampleMatches: 0,
    status: "unknown",
  };

  try {
    // Get counts
    result.counts = await getRowCounts(tableName);

    // Get all keys from both databases
    const [sourceKeys, sinkKeys] = await Promise.all([
      getPrimaryKeys(sourcePool, tableName),
      getPrimaryKeys(sinkPool, tableName),
    ]);

    // Find missing in sink
    for (const key of sourceKeys) {
      if (!sinkKeys.has(key)) {
        result.missing.push(key);
      }
    }

    // Find orphans in sink
    for (const key of sinkKeys) {
      if (!sourceKeys.has(key)) {
        result.orphans.push(key);
      }
    }

    // Sample comparison (check up to 10 random matching keys)
    const commonKeys = [...sourceKeys].filter((k) => sinkKeys.has(k));
    const sampleSize = Math.min(10, commonKeys.length);
    const sampleKeys = commonKeys
      .sort(() => Math.random() - 0.5)
      .slice(0, sampleSize);

    // Determine columns to compare based on table
    const columnMap = {
      customers: ["id", "external_id", "name", "email", "version"],
      orders: [
        "id",
        "external_id",
        "customer_id",
        "status",
        "total",
        "version",
      ],
      order_items: ["id", "order_id", "sku", "quantity", "line_total"],
    };

    const columns = columnMap[tableName] || ["id"];

    for (const key of sampleKeys) {
      const comparison = await compareRow(tableName, key, columns);
      if (comparison.status === "match") {
        result.sampleMatches++;
      } else if (comparison.status === "mismatch") {
        result.mismatches.push(comparison);
      }
    }

    // Determine overall status
    if (
      result.missing.length === 0 &&
      result.orphans.length === 0 &&
      result.mismatches.length === 0 &&
      result.counts.source === result.counts.sink
    ) {
      result.status = "PASS";
    } else if (
      result.counts.source === result.counts.sink &&
      result.mismatches.length === 0
    ) {
      result.status = "WARN"; // Counts match but there might be lag
    } else {
      result.status = "FAIL";
    }
  } catch (err) {
    result.status = "ERROR";
    result.error = err.message;
  }

  return result;
}

/**
 * Run full verification
 */
async function runVerification() {
  const timestamp = new Date().toISOString();
  const tables = {};
  let totalSourceRows = 0;
  let totalSinkRows = 0;
  let totalMismatches = 0;
  let totalMissing = 0;
  let totalOrphans = 0;
  const failures = [];

  for (const tableName of tablesToVerify) {
    const result = await verifyTable(tableName);
    tables[tableName] = result;

    totalSourceRows += result.counts.source;
    totalSinkRows += result.counts.sink;
    totalMismatches += result.mismatches.length;
    totalMissing += result.missing.length;
    totalOrphans += result.orphans.length;

    if (result.status === "FAIL" || result.status === "ERROR") {
      failures.push({
        table: tableName,
        reason: result.error || "Data mismatch",
        missing: result.missing.length,
        orphans: result.orphans.length,
        mismatches: result.mismatches.length,
      });
    }
  }

  // Determine overall status
  let overallStatus = "PASS";
  if (failures.length > 0) {
    overallStatus = "FAIL";
  } else if (totalSourceRows !== totalSinkRows) {
    overallStatus = "SYNC_IN_PROGRESS";
  }

  // Update report
  const previousHistory = latestReport.history.slice(-29); // Keep last 30

  latestReport = {
    timestamp,
    status: overallStatus,
    tables,
    summary: {
      totalSourceRows,
      totalSinkRows,
      totalMismatches,
      totalMissing,
      totalOrphans,
      lag: totalSourceRows - totalSinkRows,
    },
    failures,
    history: [
      ...previousHistory,
      {
        timestamp,
        status: overallStatus,
        sourceRows: totalSourceRows,
        sinkRows: totalSinkRows,
      },
    ],
  };

  console.log(
    `[${timestamp}] Verification: ${overallStatus} | Source: ${totalSourceRows} | Sink: ${totalSinkRows} | Lag: ${
      totalSourceRows - totalSinkRows
    }`
  );
}

/**
 * Format report as text
 */
function formatReportText(report) {
  const lines = [
    "═══════════════════════════════════════════════════════════════════",
    "              CDC VERIFICATION REPORT",
    "═══════════════════════════════════════════════════════════════════",
    "",
    `Status:     ${report.status}`,
    `Timestamp:  ${report.timestamp}`,
    "",
    "───────────────────────────────────────────────────────────────────",
    "  SUMMARY",
    "───────────────────────────────────────────────────────────────────",
    `  Source Rows:  ${report.summary.totalSourceRows}`,
    `  Sink Rows:    ${report.summary.totalSinkRows}`,
    `  Lag:          ${report.summary.lag}`,
    `  Missing:      ${report.summary.totalMissing}`,
    `  Orphans:      ${report.summary.totalOrphans}`,
    `  Mismatches:   ${report.summary.totalMismatches}`,
    "",
  ];

  for (const [tableName, result] of Object.entries(report.tables)) {
    lines.push(
      "───────────────────────────────────────────────────────────────────"
    );
    lines.push(`  TABLE: ${tableName.toUpperCase()}`);
    lines.push(
      "───────────────────────────────────────────────────────────────────"
    );
    lines.push(`  Status:   ${result.status}`);
    lines.push(`  Source:   ${result.counts.source} rows`);
    lines.push(`  Sink:     ${result.counts.sink} rows`);
    lines.push(`  Missing:  ${result.missing.length}`);
    lines.push(`  Orphans:  ${result.orphans.length}`);
    lines.push(`  Matches:  ${result.sampleMatches}/10 sampled`);

    if (result.mismatches.length > 0) {
      lines.push("  Mismatches:");
      for (const m of result.mismatches.slice(0, 3)) {
        lines.push(
          `    - ${m.id}: ${m.differences.map((d) => d.column).join(", ")}`
        );
      }
    }
    lines.push("");
  }

  if (report.failures.length > 0) {
    lines.push(
      "───────────────────────────────────────────────────────────────────"
    );
    lines.push("  FAILURES");
    lines.push(
      "───────────────────────────────────────────────────────────────────"
    );
    for (const f of report.failures) {
      lines.push(`  ${f.table}: ${f.reason}`);
    }
    lines.push("");
  }

  lines.push(
    "═══════════════════════════════════════════════════════════════════"
  );

  return lines.join("\n");
}

/**
 * HTTP server for report endpoint
 */
function startHttpServer() {
  const server = http.createServer((req, res) => {
    if (req.url === "/report" || req.url === "/") {
      const accept = req.headers.accept || "";

      if (accept.includes("application/json")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(latestReport, null, 2));
      } else {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(formatReportText(latestReport));
      }
    } else if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ status: "ok", lastCheck: latestReport.timestamp })
      );
    } else if (req.url === "/history") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(latestReport.history, null, 2));
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  server.listen(httpPort, () => {
    console.log(`Verifier HTTP server listening on port ${httpPort}`);
    console.log(`  GET /report  - Current verification report`);
    console.log(`  GET /health  - Health check`);
    console.log(`  GET /history - Verification history`);
  });
}

/**
 * Main entry point
 */
async function main() {
  console.log("CDC Verifier starting...");
  console.log(
    `  Source: ${sourceConfig.host}:${sourceConfig.port}/${sourceConfig.database}`
  );
  console.log(
    `  Sink: ${sinkConfig.host}:${sinkConfig.port}/${sinkConfig.database}`
  );
  console.log(`  Interval: ${verifyIntervalMs}ms`);

  // Wait for databases
  let ready = false;
  for (let i = 0; i < 30 && !ready; i++) {
    try {
      await Promise.all([
        sourcePool.query("SELECT 1"),
        sinkPool.query("SELECT 1"),
      ]);
      ready = true;
    } catch (err) {
      console.log(`Waiting for databases... (${30 - i} retries left)`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  if (!ready) {
    console.error("Could not connect to databases");
    process.exit(1);
  }

  console.log("Databases connected");

  // Start HTTP server
  startHttpServer();

  // Run initial verification
  await runVerification();

  // Schedule periodic verification
  setInterval(runVerification, verifyIntervalMs);
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("Shutting down...");
  await sourcePool.end();
  await sinkPool.end();
  process.exit(0);
});

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
