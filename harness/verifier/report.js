export function renderHtml(report, events = []) {
  const statusColor = report.pass ? "#15803d" : "#b91c1c";
  const recent = events.slice(-10);
  const recentMarkup = recent.length
    ? recent
        .map(evt => {
          const pk = evt.pk ?? "∅";
          const table = evt.table ? ` table=${evt.table}` : "";
          return `<li>${evt.op.toUpperCase()} pk=${pk}${table} ts=${evt.ts_ms}</li>`;
        })
        .join("")
    : "<li>No events captured yet.</li>";
  const summaryRows = (report.state?.summary || []).map(row => `<tr><td>${row.table}</td><td>${row.expected_rows}</td><td>${row.actual_rows}</td></tr>`).join("") || "<tr><td colspan=\"3\">No tables observed.</td></tr>";
  const stateMismatches = report.state?.mismatches || [];
  const mismatchMarkup = stateMismatches.length
    ? stateMismatches
        .map(entry => {
          if (entry.type === "field_mismatch") {
            const details = entry.diffs
              .map(diff => `${diff.field}: expected ${JSON.stringify(diff.expected)} ≠ actual ${JSON.stringify(diff.actual)}`)
              .join("; ");
            return `<li><strong>${entry.table}</strong> pk=${entry.pk} – field mismatch (${details})</li>`;
          }
          if (entry.type === "missing_row") {
            return `<li><strong>${entry.table}</strong> pk=${entry.pk} – missing row (expected ${JSON.stringify(entry.expected)})</li>`;
          }
          if (entry.type === "unexpected_row") {
            return `<li><strong>${entry.table}</strong> pk=${entry.pk} – unexpected row (actual ${JSON.stringify(entry.actual)})</li>`;
          }
          return `<li><strong>${entry.table}</strong> pk=${entry.pk} – ${entry.type}</li>`;
        })
        .join("")
    : "<li>No state mismatches detected.</li>";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>CDC Harness Report</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; background: #0f1729; color: #e2e8f0; }
    main { max-width: 720px; margin: 0 auto; background: rgba(15, 23, 42, 0.8); padding: 24px; border-radius: 16px; }
    h1 { margin-top: 0; }
    .status { font-weight: 700; color: ${statusColor}; }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 24px; }
    dt { font-weight: 600; }
    .issues { margin-top: 16px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid rgba(148, 163, 184, 0.2); padding: 6px 8px; text-align: left; }
  </style>
</head>
<body>
  <main>
    <h1>Harness Verification</h1>
    <p class="status">Status: ${report.pass ? "PASS" : "FAIL"}</p>
    <dl>
      <dt>Total events</dt><dd>${report.total_events}</dd>
      <dt>Deletes</dt><dd>${report.deletes_captured} / ${report.deletes_expected}</dd>
      <dt>Ordering OK</dt><dd>${report.ordering_ok ? "yes" : "no"}</dd>
      <dt>Missing</dt><dd>${report.missing}</dd>
      <dt>Extra</dt><dd>${report.extra}</dd>
      <dt>Max lag</dt><dd>${Math.round(report.max_lag_ms)} ms</dd>
    </dl>
    <section class="issues">
      <h2>Table summary</h2>
      <table>
        <thead><tr><th>Table</th><th>Expected rows</th><th>Actual rows</th></tr></thead>
        <tbody>${summaryRows}</tbody>
      </table>
    </section>
    <section class="issues">
      <h2>State mismatches (${stateMismatches.length})</h2>
      <ul>
        ${mismatchMarkup}
      </ul>
    </section>
    <section class="issues">
      <h2>Recent events (${recent.length})</h2>
      <ul>
        ${recentMarkup}
      </ul>
    </section>
  </main>
</body>
</html>`;
}
