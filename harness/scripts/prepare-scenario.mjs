#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../");

const scenarioId = process.argv[2] || process.env.SCENARIO_ID || "crud-basic";

const modulePath = pathToFileURL(path.resolve(projectRoot, "assets/shared-scenarios.js"));
const { default: sharedScenarios } = await import(modulePath.href);

if (!Array.isArray(sharedScenarios)) {
  console.error("Shared scenarios module did not export an array.");
  process.exit(1);
}

const scenario = sharedScenarios.find(s => s.id === scenarioId || s.name === scenarioId);
if (!scenario) {
  console.error(`Scenario '${scenarioId}' not found. Available ids:`, sharedScenarios.map(s => s.id).join(", "));
  process.exit(1);
}

const payload = {
  id: scenario.id,
  name: scenario.name,
  description: scenario.description,
  highlight: scenario.highlight,
  schema: scenario.schema,
  rows: scenario.rows,
  ops: scenario.ops,
};

const targetPath = path.resolve(projectRoot, "harness/scenario.json");
fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2));
console.log(`Scenario '${scenario.id}' written to ${path.relative(projectRoot, targetPath)}`);
