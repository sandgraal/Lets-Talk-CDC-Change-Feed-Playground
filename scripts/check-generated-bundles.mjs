#!/usr/bin/env node
import { spawnSync } from "node:child_process";

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

process.exit(0);
