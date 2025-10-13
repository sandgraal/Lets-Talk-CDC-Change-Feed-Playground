#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const connectorsDir = process.env.CONNECTORS_DIR || path.resolve(__dirname, "../connectors");
const baseUrl = process.env.CONNECT_BASE_URL || "http://localhost:8083";
const applyTimeoutMs = Number(process.env.CONNECT_APPLY_TIMEOUT_MS || 120000);
const pollIntervalMs = Number(process.env.CONNECT_POLL_INTERVAL_MS || 3000);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const exit = message => {
  console.error(message);
  process.exit(1);
};

if (!fs.existsSync(connectorsDir)) {
  exit(`Connectors directory not found: ${connectorsDir}`);
}

const connectorFiles = fs
  .readdirSync(connectorsDir)
  .filter(file => file.toLowerCase().endsWith(".json"))
  .map(file => path.resolve(connectorsDir, file));

if (connectorFiles.length === 0) {
  console.log("[connectors] No connector definitions found; nothing to apply.");
  process.exit(0);
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.text();
    const error = new Error(`Request failed ${options.method || "GET"} ${url} -> ${res.status} ${res.statusText}\n${body}`);
    error.status = res.status;
    throw error;
  }
  return res.status === 204 ? null : res.json();
}

async function connectorExists(name) {
  try {
    await fetchJson(`${baseUrl}/connectors/${encodeURIComponent(name)}`);
    return true;
  } catch (err) {
    if (err.status === 404) return false;
    throw err;
  }
}

async function applyConnector({ name, config }) {
  if (!name || typeof name !== "string") {
    throw new Error("Connector definition missing 'name'.");
  }
  if (!config || typeof config !== "object") {
    throw new Error(`Connector '${name}' missing 'config' section.`);
  }

  const exists = await connectorExists(name);
  const url = `${baseUrl}/connectors${exists ? `/${encodeURIComponent(name)}/config` : ""}`;
  const method = exists ? "PUT" : "POST";
  const payload = exists ? config : { name, config };

  console.log(`[connectors] ${exists ? "Updating" : "Creating"} ${name}`);
  await fetchJson(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  const deadline = Date.now() + applyTimeoutMs;
  while (Date.now() < deadline) {
    const status = await fetchJson(`${baseUrl}/connectors/${encodeURIComponent(name)}/status`);
    const connectorState = status?.connector?.state;
    const taskStates = Array.isArray(status?.tasks) ? status.tasks.map(task => task.state) : [];
    const allRunning = connectorState === "RUNNING" && taskStates.every(state => state === "RUNNING");
    if (allRunning) {
      console.log(`[connectors] ${name} RUNNING (${taskStates.length} task${taskStates.length === 1 ? "" : "s"})`);
      return;
    }
    const failedTasks = Array.isArray(status?.tasks)
      ? status.tasks.filter(task => task.state === "FAILED").map(task => task.id)
      : [];
    if (connectorState === "FAILED" || failedTasks.length) {
      console.warn(
        `[connectors] ${name} not running yet (connector=${connectorState} tasks=${taskStates.join(",") || "none"}). Attempting restart...`,
      );
      try {
        if (connectorState === "FAILED") {
          await fetchJson(`${baseUrl}/connectors/${encodeURIComponent(name)}/restart`, { method: "POST" });
        }
        await Promise.all(
          failedTasks.map(taskId =>
            fetchJson(`${baseUrl}/connectors/${encodeURIComponent(name)}/tasks/${taskId}/restart`, { method: "POST" }),
          ),
        );
      } catch (restartErr) {
        console.warn(`[connectors] restart attempt for ${name} failed: ${restartErr.message}`);
      }
    }
    await sleep(pollIntervalMs);
  }
  throw new Error(`Timed out waiting for connector '${name}' to become RUNNING.`);
}

try {
  for (const file of connectorFiles) {
    const raw = fs.readFileSync(file, "utf8");
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Failed to parse ${file}: ${err.message}`);
    }
    await applyConnector(payload);
  }
  console.log("[connectors] All connectors applied successfully.");
  process.exit(0);
} catch (err) {
  console.error("[connectors] Error applying connectors", err);
  process.exit(1);
}
