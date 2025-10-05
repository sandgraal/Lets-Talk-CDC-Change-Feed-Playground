#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../");

const modulePath = pathToFileURL(path.resolve(projectRoot, "assets/shared-scenarios.js"));
const { default: sharedScenarios } = await import(modulePath.href);

if (!Array.isArray(sharedScenarios)) {
  console.error("Shared scenarios module did not export an array.");
  process.exit(1);
}

const fixturesDir = path.resolve(projectRoot, "harness/fixtures");
fs.mkdirSync(fixturesDir, { recursive: true });

sharedScenarios.forEach(scenario => {
  if (!scenario?.id) return;
  const payload = {
    id: scenario.id,
    name: scenario.name,
    description: scenario.description,
    tags: scenario.tags || [],
    schema: scenario.schema,
    rows: scenario.rows,
    ops: scenario.ops,
  };
  const target = path.resolve(fixturesDir, `${scenario.id}.json`);
  fs.writeFileSync(target, JSON.stringify(payload, null, 2));
});

console.log(`Snapshot exports written for ${sharedScenarios.length} scenario(s) in ${path.relative(projectRoot, fixturesDir)}`);
