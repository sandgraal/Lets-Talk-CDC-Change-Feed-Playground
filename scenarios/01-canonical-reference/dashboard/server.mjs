/**
 * Web Dashboard for The Failure-Aware CDC Reference Pipeline
 *
 * A simple, single-file dashboard that shows real-time pipeline status.
 * Served by the verifier on port 8089.
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

const httpPort = parseInt(process.env.HTTP_PORT || "8089");

// Initialize pools
const sourcePool = new Pool(sourceConfig);
const sinkPool = new Pool(sinkConfig);

// State
let lastReport = null;
let eventLog = [];
const MAX_EVENTS = 100;

// Add event to log
function logEvent(type, message, details = {}) {
  eventLog.unshift({
    timestamp: new Date().toISOString(),
    type,
    message,
    details,
  });
  if (eventLog.length > MAX_EVENTS) {
    eventLog.pop();
  }
}

// Get verification data
async function getVerificationData() {
  try {
    const tables = ["customers", "orders", "order_items"];
    const result = { tables: {}, summary: {} };

    let totalSource = 0,
      totalSink = 0;

    for (const table of tables) {
      const [sourceRes, sinkRes] = await Promise.all([
        sourcePool.query(`SELECT COUNT(*) as count FROM ${table}`),
        sinkPool.query(`SELECT COUNT(*) as count FROM ${table}`),
      ]);

      const source = parseInt(sourceRes.rows[0].count);
      const sink = parseInt(sinkRes.rows[0].count);

      result.tables[table] = { source, sink, diff: source - sink };
      totalSource += source;
      totalSink += sink;
    }

    result.summary = {
      totalSource,
      totalSink,
      lag: totalSource - totalSink,
      status: totalSource === totalSink ? "PASS" : "SYNC_IN_PROGRESS",
    };

    lastReport = result;
    return result;
  } catch (err) {
    return { error: err.message };
  }
}

// HTML Dashboard
function renderDashboard() {
  const report = lastReport || { summary: { status: "LOADING" }, tables: {} };
  const statusColor =
    report.summary?.status === "PASS"
      ? "#10b981"
      : report.summary?.status === "SYNC_IN_PROGRESS"
      ? "#f59e0b"
      : "#ef4444";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CDC Pipeline Dashboard</title>
  <style>
    :root {
      --bg: #0f172a;
      --card: #1e293b;
      --border: #334155;
      --text: #f1f5f9;
      --muted: #94a3b8;
      --pass: #10b981;
      --warn: #f59e0b;
      --fail: #ef4444;
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      padding: 24px;
    }
    
    .container { max-width: 1200px; margin: 0 auto; }
    
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }
    
    h1 {
      font-size: 1.5rem;
      font-weight: 600;
    }
    
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: 9999px;
      font-weight: 600;
      font-size: 0.875rem;
    }
    
    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
    }
    
    .card-title {
      font-size: 0.875rem;
      color: var(--muted);
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .card-value {
      font-size: 2rem;
      font-weight: 700;
    }
    
    .card-subtitle {
      font-size: 0.875rem;
      color: var(--muted);
      margin-top: 4px;
    }
    
    .table-wrap {
      overflow-x: auto;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
    }
    
    th, td {
      text-align: left;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
    }
    
    th {
      font-size: 0.75rem;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .diff-zero { color: var(--pass); }
    .diff-pos { color: var(--warn); }
    
    .event-log {
      max-height: 300px;
      overflow-y: auto;
    }
    
    .event {
      display: flex;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid var(--border);
      font-size: 0.875rem;
    }
    
    .event-time {
      color: var(--muted);
      font-family: monospace;
      white-space: nowrap;
    }
    
    .event-type {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    
    .event-type.info { background: #1e40af; }
    .event-type.success { background: #065f46; }
    .event-type.warning { background: #92400e; }
    .event-type.error { background: #991b1b; }
    .event-type.failure { background: #7c2d12; }
    
    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    
    .btn {
      padding: 8px 16px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--card);
      color: var(--text);
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .btn:hover {
      background: var(--border);
    }
    
    .btn.danger {
      border-color: var(--fail);
      color: var(--fail);
    }
    
    .btn.danger:hover {
      background: var(--fail);
      color: white;
    }
    
    footer {
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
      color: var(--muted);
      font-size: 0.875rem;
      text-align: center;
    }
    
    footer a {
      color: var(--text);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🔄 CDC Pipeline Dashboard</h1>
      <div class="status-badge" style="background: ${statusColor}22; color: ${statusColor}">
        <span class="status-dot" style="background: ${statusColor}"></span>
        <span id="status">${report.summary?.status || "LOADING"}</span>
      </div>
    </header>
    
    <div class="grid">
      <div class="card">
        <div class="card-title">Source Rows</div>
        <div class="card-value" id="source-rows">${
          report.summary?.totalSource || "—"
        }</div>
        <div class="card-subtitle">Total across all tables</div>
      </div>
      
      <div class="card">
        <div class="card-title">Sink Rows</div>
        <div class="card-value" id="sink-rows">${
          report.summary?.totalSink || "—"
        }</div>
        <div class="card-subtitle">Total across all tables</div>
      </div>
      
      <div class="card">
        <div class="card-title">Current Lag</div>
        <div class="card-value" id="lag" style="color: ${
          report.summary?.lag > 0 ? "var(--warn)" : "var(--pass)"
        }">${report.summary?.lag || 0}</div>
        <div class="card-subtitle">Events behind source</div>
      </div>
    </div>
    
    <div class="card" style="margin-bottom: 16px;">
      <div class="card-title">Table Breakdown</div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Table</th>
              <th>Source</th>
              <th>Sink</th>
              <th>Difference</th>
            </tr>
          </thead>
          <tbody id="table-body">
            ${Object.entries(report.tables || {})
              .map(
                ([name, data]) => `
              <tr>
                <td>${name}</td>
                <td>${data.source}</td>
                <td>${data.sink}</td>
                <td class="${data.diff === 0 ? "diff-zero" : "diff-pos"}">${
                  data.diff === 0 ? "✓ Match" : `+${data.diff}`
                }</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
    
    <div class="grid">
      <div class="card">
        <div class="card-title">Trigger Failures</div>
        <div class="actions">
          <button class="btn" onclick="trigger('restart')">🔄 Restart</button>
          <button class="btn" onclick="trigger('lag')">⏳ Lag</button>
          <button class="btn" onclick="trigger('schema')">📋 Schema</button>
          <button class="btn danger" onclick="trigger('duplicate')">⚠️ Duplicate</button>
          <button class="btn" onclick="trigger('backfill')">📥 Backfill</button>
        </div>
      </div>
      
      <div class="card">
        <div class="card-title">Event Log</div>
        <div class="event-log" id="event-log">
          ${
            eventLog
              .map(
                (e) => `
            <div class="event">
              <span class="event-time">${e.timestamp.slice(11, 19)}</span>
              <span class="event-type ${e.type}">${e.type}</span>
              <span>${e.message}</span>
            </div>
          `
              )
              .join("") ||
            '<div style="color: var(--muted); padding: 16px;">No events yet</div>'
          }
        </div>
      </div>
    </div>
    
    <footer>
      <p>The Failure-Aware CDC Reference Pipeline • <a href="/report">JSON API</a> • <a href="/health">Health</a></p>
    </footer>
  </div>
  
  <script>
    // Auto-refresh every 2 seconds
    setInterval(async () => {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        
        document.getElementById('status').textContent = data.summary.status;
        document.getElementById('source-rows').textContent = data.summary.totalSource;
        document.getElementById('sink-rows').textContent = data.summary.totalSink;
        document.getElementById('lag').textContent = data.summary.lag;
        
        // Update status badge color
        const badge = document.querySelector('.status-badge');
        const dot = document.querySelector('.status-dot');
        const color = data.summary.status === 'PASS' ? '#10b981' : 
                      data.summary.status === 'SYNC_IN_PROGRESS' ? '#f59e0b' : '#ef4444';
        badge.style.background = color + '22';
        badge.style.color = color;
        dot.style.background = color;
        
        // Update table
        const tbody = document.getElementById('table-body');
        tbody.innerHTML = Object.entries(data.tables).map(([name, d]) => \`
          <tr>
            <td>\${name}</td>
            <td>\${d.source}</td>
            <td>\${d.sink}</td>
            <td class="\${d.diff === 0 ? 'diff-zero' : 'diff-pos'}">\${d.diff === 0 ? '✓ Match' : '+' + d.diff}</td>
          </tr>
        \`).join('');
      } catch (e) {
        console.error('Failed to refresh:', e);
      }
    }, 2000);
    
    // Trigger failure
    async function trigger(type) {
      if (!confirm(\`Trigger \${type} failure?\`)) return;
      try {
        const res = await fetch('/api/trigger/' + type, { method: 'POST' });
        const data = await res.json();
        alert(data.message || 'Triggered');
        location.reload();
      } catch (e) {
        alert('Failed to trigger: ' + e.message);
      }
    }
  </script>
</body>
</html>`;
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${httpPort}`);

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  // Routes
  if (url.pathname === "/" || url.pathname === "/dashboard") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(renderDashboard());
  } else if (url.pathname === "/api/status" || url.pathname === "/report") {
    const data = await getVerificationData();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data, null, 2));
  } else if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ status: "ok", timestamp: new Date().toISOString() })
    );
  } else if (url.pathname.startsWith("/api/trigger/")) {
    const type = url.pathname.split("/").pop();
    logEvent("failure", `Triggered ${type} failure`, { type });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        success: true,
        message: `${type} failure triggered. Use 'make trigger-${type}' to execute.`,
        note: "Web triggers are logged only. Run make commands for actual execution.",
      })
    );
  } else if (url.pathname === "/api/events") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(eventLog));
  } else {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }
});

// Start server
async function main() {
  console.log("Dashboard starting...");

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
      console.log(`Waiting for databases... (${30 - i} retries)`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  if (!ready) {
    console.error("Could not connect to databases");
    process.exit(1);
  }

  // Initial data fetch
  await getVerificationData();
  logEvent("info", "Dashboard started");

  // Start periodic refresh
  setInterval(async () => {
    await getVerificationData();
  }, 5000);

  server.listen(httpPort, () => {
    console.log(`Dashboard running at http://localhost:${httpPort}`);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
