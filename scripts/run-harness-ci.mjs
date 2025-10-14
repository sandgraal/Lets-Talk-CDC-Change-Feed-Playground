#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), "..");
const composeFile = path.resolve(projectRoot, "harness/docker-compose.yml");
const scenarioScript = path.resolve(projectRoot, "harness/scripts/prepare-scenario.mjs");
const scenarioPath = path.resolve(projectRoot, "harness/scenario.json");
const healthUrl = "http://localhost:8089/health";
const reportUrl = "http://localhost:8089/report";
const connectBaseUrl = process.env.HARNESS_CONNECT_URL || "http://localhost:8083";
const connectorsDir = path.resolve(projectRoot, "harness/connectors");
const scenarioId = process.env.HARNESS_SCENARIO || "orders-transactions";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      cwd: projectRoot,
      ...options,
    });
    child.on("error", err => {
      if (err.code === "ENOENT") {
        reject(new Error(`Command not found: ${command}. Ensure Docker CLI is installed and available on PATH.`));
      } else {
        reject(err);
      }
    });
    child.on("exit", code => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(url, { timeoutMs, validate }) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const payload = await res.json();
        if (!validate || validate(payload)) {
          return payload;
        }
        lastError = new Error(`validation failed for ${url}`);
      } else {
        lastError = new Error(`non-200 response from ${url}: ${res.status}`);
      }
    } catch (err) {
      lastError = err;
    }
    await delay(2000);
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

async function applyConnectors() {
  if (!fs.existsSync(connectorsDir)) return;
  const files = fs
    .readdirSync(connectorsDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith(".json"))
    .map(entry => path.resolve(connectorsDir, entry.name));

  for (const filePath of files) {
    const raw = fs.readFileSync(filePath, "utf8");
    let definition;
    try {
      definition = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Failed to parse connector definition ${path.relative(projectRoot, filePath)}: ${err?.message || err}`);
    }
    const name = definition?.name;
    const config = definition?.config;
    if (!name || typeof name !== "string") {
      throw new Error(`Connector file ${path.relative(projectRoot, filePath)} missing required 'name' property`);
    }
    if (!config || typeof config !== "object") {
      throw new Error(`Connector file ${path.relative(projectRoot, filePath)} missing required 'config' object`);
    }
    await ensureConnector(name, config);
  }
}

async function ensureConnector(name, config) {
  const baseUrl = `${connectBaseUrl}/connectors/${encodeURIComponent(name)}`;
  console.log(`[harness] applying connector ${name}`);

  let response = await fetch(baseUrl);
  if (response.ok) {
    const update = await fetch(`${baseUrl}/config`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(config),
    });
    if (!update.ok) {
      const body = await update.text();
      throw new Error(`Failed to update connector ${name}: ${update.status} ${body}`);
    }
  } else if (response.status === 404) {
    response = await fetch(`${connectBaseUrl}/connectors`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, config }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to create connector ${name}: ${response.status} ${body}`);
    }
  } else {
    const body = await response.text();
    throw new Error(`Failed to query connector ${name}: ${response.status} ${body}`);
  }

  await waitFor(`${baseUrl}/status`, {
    timeoutMs: 120000,
    validate: payload =>
      payload?.connector?.state === "RUNNING" &&
      Array.isArray(payload?.tasks) &&
      payload.tasks.length > 0 &&
      payload.tasks.every(task => task.state === "RUNNING"),
  });
}

async function main() {
  await run("node", [scenarioScript, scenarioId], { stdio: "inherit" });
  const scenario = JSON.parse(fs.readFileSync(scenarioPath, "utf8"));
  const expectedEvents = Array.isArray(scenario.ops) ? scenario.ops.length : 0;

  const composeArgs = ["-f", composeFile];

  try {
    // Clean slate (ignore errors if stack isn't running yet)
    try {
      await run("docker", ["compose", ...composeArgs, "down", "--volumes", "--remove-orphans"], { stdio: "ignore" });
    } catch (err) {
      console.warn("harness down warning", err.message);
    }

    try {
      await run("docker", ["compose", ...composeArgs, "up", "--build", "-d"]);
    } catch (err) {
      try {
        await run("docker", ["compose", ...composeArgs, "logs", "--no-color"], { stdio: "inherit" });
      } catch (logsErr) {
        console.warn("failed to stream docker compose logs", logsErr.message);
      }
      throw err;
    }

    await waitFor(`${connectBaseUrl}/connectors`, { timeoutMs: 120000 });
    await applyConnectors();

    await waitFor(healthUrl, { timeoutMs: 120000 });
    const report = await waitFor(reportUrl, {
      timeoutMs: 180000,
      validate: payload => payload && payload.pass && payload.total_events >= expectedEvents,
    });

    console.log(`[harness] PASS events=${report.total_events} maxLag=${report.max_lag_ms}`);

    if (process.env.HARNESS_REPORT_JSON) {
      const jsonPath = path.resolve(projectRoot, process.env.HARNESS_REPORT_JSON);
      fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
      fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    }

    if (process.env.HARNESS_REPORT_HTML) {
      const htmlResponse = await fetch(reportUrl.replace("/report", "/"));
      if (htmlResponse.ok) {
        const html = await htmlResponse.text();
        const htmlPath = path.resolve(projectRoot, process.env.HARNESS_REPORT_HTML);
        fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
        fs.writeFileSync(htmlPath, html);
      }
    }
  } finally {
    await run("docker", ["compose", ...composeArgs, "down", "--volumes"]);
  }
}

main().catch(err => {
  console.error("Harness CI run failed", err);
  process.exitCode = 1;
});
