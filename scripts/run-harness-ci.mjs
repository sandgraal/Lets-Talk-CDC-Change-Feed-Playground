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
