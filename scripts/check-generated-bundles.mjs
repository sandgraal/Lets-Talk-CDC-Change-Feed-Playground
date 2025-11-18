#!/usr/bin/env node
import { spawnSync } from "node:child_process";
// Directories to scan for source files
const SOURCE_DIRS = ["src", "web", "sim", "assets"];


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

function getGitTreeHash(commitRef, paths) {
  // Get a hash representing the state of source paths at a given commit
  const hashInputs = [];
  
  for (const sourcePath of paths) {
    const { stdout, status } = spawnSync(
      "git",
      ["ls-tree", "-r", commitRef, sourcePath],
      { encoding: "utf8", cwd: repoRoot }
    );

    if (status === 0 && stdout.trim()) {
      hashInputs.push(stdout.trim());
    }
  }

  if (hashInputs.length === 0) {
    return null;
  }

  // Create a hash of the combined ls-tree output (which includes file hashes)
  const { stdout, status } = spawnSync(
    "git",
    ["hash-object", "--stdin"],
    { 
      encoding: "utf8", 
      cwd: repoRoot,
      input: hashInputs.sort().join('\n')
    }
  );

  return status === 0 ? stdout.trim() : null;
}

function checkFreshness() {
  const stale = [];
  const toleranceMs = 500; // allow minor clock skew/rounding

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

    // Check 1: mtime comparison (catches local edits)
    const latestSourceMtime = Math.max(...sourceMtims);
    if (latestSourceMtime - outputStat.mtimeMs > toleranceMs) {
      const deltaSeconds = Math.round((latestSourceMtime - outputStat.mtimeMs) / 1000);
      stale.push(
        `${output} is older than source by ${deltaSeconds}s. Run ${rebuild} to refresh assets/generated.`
      );
      continue;
    }

    // Check 2: git content comparison (catches committed mismatches in clean checkouts)
    // Get the commit where the output bundle was last modified
    const { stdout: bundleCommit, status: bundleStatus } = spawnSync(
      "git",
      ["log", "-1", "--format=%H", "--", output],
      { encoding: "utf8", cwd: repoRoot }
    );

    if (bundleStatus === 0 && bundleCommit.trim()) {
      const lastBundleCommit = bundleCommit.trim();
      
      // Get the hash of source tree at that commit
      const sourceHashAtBundleCommit = getGitTreeHash(lastBundleCommit, sources);
      
      // Get the hash of current source tree
      const currentSourceHash = getGitTreeHash("HEAD", sources);
      
      if (sourceHashAtBundleCommit && currentSourceHash && sourceHashAtBundleCommit !== currentSourceHash) {
        stale.push(
          `${output} is stale: source files have changed since the bundle was last committed. Run ${rebuild} to refresh assets/generated.`
        );
      }
    }
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
