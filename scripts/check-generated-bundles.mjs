#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd());
const ignoredDirs = new Set([".git", "node_modules", "dist", "assets", "reports", "test-results"]);

/**
 * Tolerance for timestamp comparison in milliseconds.
 * 
 * This allows for minor timing discrepancies that can occur due to:
 * - Filesystem timestamp precision limitations (some filesystems only track seconds or have lower resolution)
 * - Clock skew between different systems or processes
 * - Network time synchronization delays
 * - Build tool timing variations
 * 
 * A 500ms tolerance is sufficient to handle these edge cases without masking genuine staleness issues.
 */
const TIMESTAMP_TOLERANCE_MS = 500;

const bundleChecks = [
  {
    output: "assets/generated/sim-bundle.js",
    sources: ["sim", "src"],
    rebuild: "npm run build:sim"
  },
  {
    output: "assets/generated/ui-shell.js",
    sources: ["web", "src"],
    rebuild: "npm run build:web"
  },
  {
    output: "assets/generated/ui-shell.css",
    sources: ["web", "src"],
    rebuild: "npm run build:web"
  }
];

function getLatestMtime(targetPath) {
  const fullPath = path.resolve(repoRoot, targetPath);
  if (!existsSync(fullPath)) {
    return undefined;
  }

  const stats = statSync(fullPath);
  if (!stats.isDirectory()) {
    return stats.mtimeMs;
  }

  let latest = stats.mtimeMs;
  const stack = [fullPath];

  while (stack.length) {
    const current = stack.pop();
    const entries = readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (ignoredDirs.has(entry.name)) continue;

      const childPath = path.join(current, entry.name);
      const childStats = statSync(childPath);

      if (childStats.isDirectory()) {
        stack.push(childPath);
      }

      if (childStats.mtimeMs > latest) {
        latest = childStats.mtimeMs;
      }
    }
  }

  return latest;
}

function checkGitStatus() {
  const { stdout, stderr, status, error } = spawnSync(
    "git",
    ["status", "--porcelain", "--", "assets/generated"],
    { encoding: "utf8" }
  );

  if (error) {
    console.error("Failed to run git status for generated assets:", error.message);
    process.exit(1);
  }

  if (status !== 0) {
    console.error(stderr || "git status returned a non-zero exit code");
    process.exit(status);
  }

  const changed = stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (changed.length > 0) {
    console.error(
      "Generated bundles are out of sync with the repository. Run `npm run build` and commit assets/generated/* before shipping."
    );
    changed.forEach(line => console.error(` - ${line}`));
    process.exit(1);
  }
}

function checkFreshness() {
  const stale = [];

  for (const { output, sources, rebuild } of bundleChecks) {
    let outputStat;
    try {
      outputStat = statSync(output);
    } catch (err) {
      if (err.code === 'ENOENT') {
        outputStat = null;
      } else {
        throw err;
      }
    }

    if (!outputStat) {
      stale.push(`${output} is missing. Rebuild with: ${rebuild}`);
      continue;
    }

    const sourceMtims = sources
      .map(sourcePath => getLatestMtime(sourcePath))
      .filter(value => value !== undefined);

    if (sourceMtims.length === 0) {
      // No sources exist, skip freshness check for this bundle
      continue;
    }

    const latestSourceMtime = Math.max(...sourceMtims);
    if (latestSourceMtime - outputStat.mtimeMs > TIMESTAMP_TOLERANCE_MS) {
      const deltaSeconds = Math.round((latestSourceMtime - outputStat.mtimeMs) / 1000);
      stale.push(
        `${output} is older than source by ${deltaSeconds}s. Run ${rebuild} to refresh assets/generated.`
      );
    }
  }

  if (stale.length > 0) {
    console.error("Generated bundles are stale relative to source:");
    stale.forEach(message => console.error(` - ${message}`));
    process.exit(1);
  }
}

checkGitStatus();
checkFreshness();
process.exit(0);
