#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Directories to scan for source files
const SOURCE_DIRS = ["src", "web", "sim", "assets"];

// Directory containing generated bundles
const GENERATED_DIR = "assets/generated";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const bundleChecks = [
  {
    output: join(GENERATED_DIR, "sim-bundle.js"),
    rebuild: "npm run build:sim",
  },
  {
    output: join(GENERATED_DIR, "ui-shell.js"),
    rebuild: "npm run build:web",
  },
  {
    output: join(GENERATED_DIR, "ui-shell.css"),
    rebuild: "npm run build:web",
  },
  {
    output: join(GENERATED_DIR, "ui-main.css"),
    rebuild: "npm run build:web",
  },
  {
    output: join(GENERATED_DIR, "event-log-widget.js"),
    rebuild: "npm run build:web",
  },
];

/**
 * Check for uncommitted changes in generated assets
 */
function checkUncommittedChanges() {
  const { stdout, stderr, status, error } = spawnSync(
    "git",
    ["status", "--porcelain", "--", GENERATED_DIR],
    { encoding: "utf8", cwd: repoRoot }
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
      "Generated bundles are out of sync with the repository. Run `npm run build:web` and commit assets/generated/*."
    );
    changed.forEach(line => console.error(` - ${line}`));
    process.exit(1);
  }
}

function getModifiedSourceFiles() {
  const { stdout, status, stderr, error } = spawnSync(
    "git",
    ["status", "--porcelain"],
    { encoding: "utf8", cwd: repoRoot }
  );

  if (error) {
    console.error("Failed to run git status:", error.message);
    process.exit(1);
  }

  if (status !== 0) {
    console.error(stderr || "git status returned a non-zero exit code");
    process.exit(status);
  }

  return stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      // Parse git status output: "XY filename" or "XY filename -> newname"
      // X = status in index, Y = status in working tree
      // Format is two status chars, space, then filename
      const match = line.match(/^..\s+(.+?)(?:\s+->\s+.+)?$/);
      return match ? match[1] : null;
    })
    .filter(file => file && !file.startsWith(`${GENERATED_DIR}/`));
}

function checkFreshness() {
  const stale = [];

  for (const { output, rebuild } of bundleChecks) {
    const outputPath = resolve(repoRoot, output);
    let outputStat;
    try {
      outputStat = statSync(outputPath);
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
  }

  if (stale.length > 0) {
    console.error("Generated bundles are missing:");
    stale.forEach(message => console.error(` - ${message}`));
    process.exit(1);
  }
}

/**
 * Check if any source files in key directories have been modified
 */
function checkSourceFreshness() {
  const modifiedFiles = getModifiedSourceFiles();
  
  // Filter to only source files in directories we care about
  const modifiedSources = modifiedFiles.filter(file => {
    return SOURCE_DIRS.some(dir => file.startsWith(dir + "/") || file === dir);
  });

  if (modifiedSources.length > 0) {
    console.error("Source files have been modified but generated bundles may be stale.");
    console.error("Run `npm run build` and commit assets/generated/* if these changes affect the bundles:");
    modifiedSources.forEach(file => console.error(`  - ${file}`));
    process.exit(1);
  }
}

// Run checks
checkUncommittedChanges();
checkFreshness();
checkSourceFreshness();

process.exit(0);
