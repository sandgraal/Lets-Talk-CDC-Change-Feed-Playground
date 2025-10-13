#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import AdmZip from "adm-zip";

const OWNER = process.env.GITHUB_OWNER || "sandgraal";
const REPO = process.env.GITHUB_REPO || "Lets-Talk-CDC-Change-Feed-Playground";
const TOKEN = process.env.GITHUB_TOKEN;
const LIMIT = Number(process.env.HARNESS_HISTORY_LIMIT ?? process.argv[2] ?? 5);
const OUTPUT = process.env.HARNESS_HISTORY_OUTPUT || path.resolve("reports/harness-history.md");

if (!TOKEN) {
  console.error("GITHUB_TOKEN is required to fetch harness history.");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  "User-Agent": `${REPO}-harness-history",
  Accept: "application/vnd.github+json",
};

async function gh(pathname, options = {}) {
  const url = `https://api.github.com${pathname}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub request failed ${res.status} ${res.statusText}: ${text}`);
  }
  if (options.raw) {
    return res;
  }
  return res.json();
}

async function getWorkflowId() {
  const data = await gh(`/repos/${OWNER}/${REPO}/actions/workflows/harness-nightly.yml`);
  if (!data?.id) {
    throw new Error("Unable to resolve workflow id for harness-nightly.yml");
  }
  return data.id;
}

function sanitizeRow(row) {
  if (!row || typeof row !== "object") return {};
  const result = {};
  Object.entries(row).forEach(([key, value]) => {
    if (value === undefined) return;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = sanitizeRow(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map(item => (item && typeof item === "object" ? sanitizeRow(item) : item));
    } else {
      result[key] = value;
    }
  });
  return result;
}

function reduceState(ops) {
  const state = new Map();
  ops.forEach(op => {
    const table = (op.table || "").toLowerCase();
    if (!table) return;
    const pk = op.pk != null ? String(op.pk) : "";
    if (!pk) return;
    const tableMap = state.get(table) ?? new Map();
    if (op.op === "delete") {
      tableMap.delete(pk);
    } else if (op.after && typeof op.after === "object") {
      const prev = tableMap.get(pk) || {};
      tableMap.set(pk, { ...prev, ...sanitizeRow(op.after) });
    }
    state.set(table, tableMap);
  });
  return state;
}

function coerceComparable(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const num = Number(trimmed);
    if (!Number.isNaN(num)) return num;
    return trimmed;
  }
  if (Array.isArray(value)) return value.map(item => coerceComparable(item));
  if (typeof value === "object") {
    const result = {};
    Object.keys(value)
      .sort()
      .forEach(key => {
        result[key] = coerceComparable(value[key]);
      });
    return result;
  }
  return value;
}

function stableStringify(value) {
  if (value === null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function valuesEqual(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  return stableStringify(coerceComparable(a)) === stableStringify(coerceComparable(b));
}

function diffRows(expected, actual) {
  const diffs = [];
  const keys = new Set([
    ...Object.keys(expected || {}),
    ...Object.keys(actual || {}),
  ]);
  keys.forEach(key => {
    const exp = expected?.[key];
    const act = actual?.[key];
    if (!valuesEqual(exp, act)) {
      diffs.push({ field: key, expected: exp, actual: act });
    }
  });
  return diffs;
}

function diffStates(expected, actual) {
  const summary = [];
  const mismatches = [];
  const tables = new Set([...expected.keys(), ...actual.keys()]);
  tables.forEach(table => {
    const expectedRows = expected.get(table) ?? new Map();
    const actualRows = actual.get(table) ?? new Map();
    summary.push({
      table,
      expected: expectedRows.size,
      actual: actualRows.size,
    });
    const pks = new Set([...expectedRows.keys(), ...actualRows.keys()]);
    pks.forEach(pk => {
      const expRow = expectedRows.get(pk);
      const actRow = actualRows.get(pk);
      if (!expRow && actRow) {
        mismatches.push({ type: "unexpected_row", table, pk, actual: actRow });
      } else if (expRow && !actRow) {
        mismatches.push({ type: "missing_row", table, pk, expected: expRow });
      } else if (expRow && actRow) {
        const diffs = diffRows(expRow, actRow);
        if (diffs.length) mismatches.push({ type: "field_mismatch", table, pk, diffs });
      }
    });
  });
  return { summary, mismatches };
}

function formatDate(value) {
  return new Date(value).toISOString().replace(/T/, " ").replace(/:\d+Z$/, "Z");
}

async function downloadArtifact(artifactId) {
  const res = await gh(`/repos/${OWNER}/${REPO}/actions/artifacts/${artifactId}/zip`, {
    headers: { Accept: "application/octet-stream" },
    raw: true,
  });
  const buffer = Buffer.from(await res.arrayBuffer());
  const zip = new AdmZip(buffer);
  const entry = zip.getEntries().find(e => e.entryName.endsWith(".json"));
  if (!entry) {
    throw new Error("JSON report not found inside artifact zip");
  }
  const json = JSON.parse(entry.getData().toString("utf8"));
  return json;
}

async function main() {
  const workflowId = await getWorkflowId();
  const runs = await gh(`/repos/${OWNER}/${REPO}/actions/workflows/${workflowId}/runs?per_page=${LIMIT}`);
  const items = [];

  for (const run of runs.workflow_runs || []) {
    const artifacts = await gh(`/repos/${OWNER}/${REPO}/actions/runs/${run.id}/artifacts`);
    const artifact = (artifacts.artifacts || []).find(item => item.name === "harness-report");
    if (!artifact) continue;
    let report;
    try {
      report = await downloadArtifact(artifact.id);
    } catch (err) {
      console.warn(`Failed to download artifact for run ${run.id}:`, err.message);
      continue;
    }

    let state = report.state;
    if (!state) {
      state = { summary: [], mismatches: [] };
    }

    items.push({
      runId: run.id,
      runNumber: run.run_number,
      url: run.html_url,
      conclusion: run.conclusion || run.status,
      createdAt: run.created_at,
      updatedAt: run.updated_at,
      report,
      state,
    });
  }

  const lines = [];
  lines.push(`# Harness Nightly History (last ${items.length} runs)`);
  lines.push("");
  lines.push("| Run | Date | Conclusion | Events | Missing | Extra | Max Lag (ms) | Tables | Mismatches |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  items.forEach(item => {
    const summaries = Array.isArray(item.state.summary) ? item.state.summary : [];
    const mismatches = Array.isArray(item.state.mismatches) ? item.state.mismatches : [];
    const tables = summaries
      .map(entry => `${entry.table}: ${entry.actual}/${entry.expected}`)
      .join(`<br>`);
    lines.push(
      `| [#${item.runNumber}](${item.url}) | ${formatDate(item.createdAt)} | ${item.conclusion?.toUpperCase() ?? "?"} | ${item.report.total_events ?? "?"} | ${item.report.missing ?? "?"} | ${item.report.extra ?? "?"} | ${Math.round(item.report.max_lag_ms ?? 0)} | ${tables || "—"} | ${mismatches.length} |`,
    );
  });
  lines.push("");

  items.forEach(item => {
    lines.push(`## Run #${item.runNumber} (${formatDate(item.createdAt)})`);
    lines.push(`- **Conclusion:** ${item.conclusion ?? "unknown"}`);
    lines.push(`- **Events:** ${item.report.total_events ?? "?"}`);
    lines.push(`- **Missing:** ${item.report.missing ?? "?"}`);
    lines.push(`- **Extra:** ${item.report.extra ?? "?"}`);
    lines.push(`- **Max lag:** ${Math.round(item.report.max_lag_ms ?? 0)} ms`);
    lines.push("");
    lines.push("### Table summary");
    lines.push("| Table | Expected rows | Actual rows |");
    lines.push("| --- | --- | --- |");
    const summaries = Array.isArray(item.state.summary) ? item.state.summary : [];
    summaries.forEach(entry => {
      lines.push(`| ${entry.table} | ${entry.expected} | ${entry.actual} |`);
    });
    if (summaries.length === 0) {
      lines.push("| — | — | — |");
    }
    lines.push("");

    const mismatches = Array.isArray(item.state.mismatches) ? item.state.mismatches : [];
    lines.push(`### Mismatches (${mismatches.length})`);
    if (mismatches.length === 0) {
      lines.push("None.");
    } else {
      mismatches.forEach(mismatch => {
        if (mismatch.type === "field_mismatch") {
          const detail = mismatch.diffs
            .map(diff => `    - ${diff.field}: expected ${JSON.stringify(diff.expected)} vs actual ${JSON.stringify(diff.actual)}`)
            .join("\n");
          lines.push(`- **${mismatch.table}** pk=${mismatch.pk} field mismatch:\n${detail}`);
        } else if (mismatch.type === "missing_row") {
          lines.push(`- **${mismatch.table}** pk=${mismatch.pk} missing row (expected ${JSON.stringify(mismatch.expected)})`);
        } else if (mismatch.type === "unexpected_row") {
          lines.push(`- **${mismatch.table}** pk=${mismatch.pk} unexpected row (actual ${JSON.stringify(mismatch.actual)})`);
        } else {
          lines.push(`- **${mismatch.table}** pk=${mismatch.pk} ${mismatch.type}`);
        }
      });
    }
    lines.push("");
  });

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, lines.join("\n"));
  console.log(`Harness history written to ${OUTPUT}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
