#!/usr/bin/env node
import fs from "node:fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../");

const modulePath = pathToFileURL(path.resolve(projectRoot, "harness/verifier/report.js"));
const { renderHtml } = await import(modulePath.href);

const sampleReport = {
  total_events: 12,
  deletes_expected: 1,
  deletes_captured: 1,
  ordering_ok: true,
  missing: 0,
  extra: 0,
  max_lag_ms: 5,
  pass: true,
};

const sampleEvents = [
  { op: "c", pk: "R-101", ts_ms: 1200 },
  { op: "u", pk: "R-101", ts_ms: 1350 },
  { op: "d", pk: "R-101", ts_ms: 1500 },
];

const snapshotPath = path.resolve(projectRoot, "tests/__snapshots__/harness-report.html");
fs.writeFileSync(snapshotPath, renderHtml(sampleReport, sampleEvents));
console.log(`Snapshot refreshed at ${path.relative(projectRoot, snapshotPath)}`);
