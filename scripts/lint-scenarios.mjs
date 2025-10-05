#!/usr/bin/env node
import { readdir, stat, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const ALLOWED_PREFIXES = [
  "node_modules/",
  "assets/generated/",
  "harness/fixtures/",
  "harness/connectors/",
  "harness/verifier/",
  "harness/generator/",
  "docs/schema/",
  "sim/tests/"
];
const ALLOWED_FILES = new Set([
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "harness/scenario.json"
]);

const SCENARIO_PATTERNS = [
  /"ops"\s*:\s*\[/i,
  /"rows"\s*:\s*\[/i,
  /"events"\s*:\s*\[/i,
  /"schema"\s*:\s*\[/i
];

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist"
]);

async function collectJsonFiles(dir) {
  const results = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const name = entry.name;
    if (SKIP_DIRS.has(name)) continue;
    const filePath = path.join(dir, name);
    const relPath = path.relative(ROOT, filePath).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      results.push(...(await collectJsonFiles(filePath)));
    } else if (entry.isFile() && name.endsWith(".json")) {
      results.push(relPath);
    }
  }
  return results;
}

function isAllowed(relPath) {
  if (ALLOWED_FILES.has(relPath)) return true;
  return ALLOWED_PREFIXES.some(prefix => relPath.startsWith(prefix));
}

async function main() {
  const jsonFiles = await collectJsonFiles(ROOT);
  const violations = [];

  for (const relPath of jsonFiles) {
    if (isAllowed(relPath)) continue;
    const absPath = path.join(ROOT, relPath);
    const content = await readFile(absPath, "utf8");
    const looksLikeScenario = SCENARIO_PATTERNS.some(pattern => pattern.test(content));
    if (looksLikeScenario) {
      violations.push(relPath);
    }
  }

  if (violations.length) {
    console.error("Scenario JSON should live in assets/shared-scenarios.js or harness fixtures.");
    violations.forEach(file => console.error(` - Unexpected scenario JSON detected: ${file}`));
    process.exitCode = 1;
    return;
  }

  process.exitCode = 0;
}

main().catch(err => {
  console.error("Scenario lint failed", err);
  process.exitCode = 1;
});
