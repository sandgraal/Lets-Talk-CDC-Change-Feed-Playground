#!/usr/bin/env node
import { spawnSync } from "node:child_process";
const ROOT = process.cwd();

// Directories to scan for source files
const SOURCE_DIRS = ["src", "web", "sim", "assets"];

// Directories to skip when scanning
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "generated", // Skip assets/generated
  "test-results",
  "reports",
  ".next",
]);

// Directory containing generated bundles
const GENERATED_DIR = "assets/generated";

/**
 * Check for uncommitted changes in generated assets
 */
function checkUncommittedChanges() {
  const { stdout, stderr, status, error } = spawnSync("git", [
    "status",
    "--porcelain",
    "--",
    "assets/generated"
  ], { encoding: "utf8" });

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
    console.error("Generated bundles are out of sync with the repository. Run `npm run build:web` and commit assets/generated/*.");
    changed.forEach(line => console.error(` - ${line}`));
    process.exit(1);
  }
}

/**
 * Get list of modified source files (excluding generated assets)
 */
function getModifiedSourceFiles() {
  // Get all modified, added, or untracked files
  const { stdout, stderr, status, error } = spawnSync("git", [
    "status",
    "--porcelain",
    "--untracked-files=all"
  ], { encoding: "utf8" });

  if (error) {
    console.error("Failed to run git status:", error.message);
    process.exit(1);
  }

  if (status !== 0) {
    console.error(stderr || "git status returned a non-zero exit code");
    process.exit(status);
  }

  const modifiedFiles = stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      // Parse git status output: "XY filename" or "XY filename -> newname"
      // X = status in index, Y = status in working tree
      // Format is two status chars, space, then filename
      const match = line.match(/^..\s+(.+?)(?:\s+->\s+.+)?$/);
      return match ? match[1] : null;
    })
    .filter(file => file && !file.startsWith("assets/generated/"));

  return modifiedFiles;
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
checkSourceFreshness();

process.exit(0);
