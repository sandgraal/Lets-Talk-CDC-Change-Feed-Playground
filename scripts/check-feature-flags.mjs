import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const manifestPath = path.join(rootDir, "assets", "feature-flag-manifest.json");
const indexPath = path.join(rootDir, "index.html");

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function extractFlags(html, pattern, label) {
  const match = html.match(pattern);
  if (!match) {
    throw new Error(`Could not locate ${label} array in index.html`);
  }

  const tokens = Array.from(match[1].matchAll(/"([^"]+)"/g)).map(entry => entry[1]);
  if (!tokens.length) {
    throw new Error(`No flags parsed from ${label} array in index.html`);
  }
  return tokens;
}

function assertSameSet(expected, actual, label) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);

  const missing = [...expectedSet].filter(flag => !actualSet.has(flag));
  const extra = [...actualSet].filter(flag => !expectedSet.has(flag));

  if (missing.length || extra.length) {
    const parts = [];
    if (missing.length) parts.push(`missing: ${missing.sort().join(", ")}`);
    if (extra.length) parts.push(`extra: ${extra.sort().join(", ")}`);
    throw new Error(`Flag drift in ${label} → ${parts.join("; ")}`);
  }
}

function ensureManifestIntegrity(manifest) {
  const unique = new Set();
  for (const entry of manifest) {
    if (!entry.flag) {
      throw new Error("Manifest entry missing flag name");
    }
    if (unique.has(entry.flag)) {
      throw new Error(`Duplicate flag in manifest: ${entry.flag}`);
    }
    unique.add(entry.flag);
  }
}

const manifest = readJson(manifestPath);
ensureManifestIntegrity(manifest);

const enabledByDefault = manifest
  .filter(entry => entry.defaultInIndex)
  .map(entry => entry.flag);

const indexHtml = fs.readFileSync(indexPath, "utf8");
const appwriteFlags = extractFlags(indexHtml, /featureFlags:\s*\[([\s\S]*?)\]/, "APPWRITE_CFG.featureFlags");
const globalFlags = extractFlags(indexHtml, /window\.CDC_FEATURE_FLAGS[^[]*\[([\s\S]*?)\]/, "window.CDC_FEATURE_FLAGS");

assertSameSet(enabledByDefault, appwriteFlags, "APPWRITE_CFG.featureFlags");
assertSameSet(enabledByDefault, globalFlags, "window.CDC_FEATURE_FLAGS");

for (const source of [appwriteFlags, globalFlags]) {
  const unknown = source.filter(flag => !manifest.some(entry => entry.flag === flag));
  if (unknown.length) {
    throw new Error(`Flags present in index.html but not in manifest: ${unknown.join(", ")}`);
  }
}

console.log("✓ Feature flags in index.html match manifest defaults.");
