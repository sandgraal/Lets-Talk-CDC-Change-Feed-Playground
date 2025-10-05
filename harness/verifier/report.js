export function renderHtml(report, events = []) {
  const statusColor = report.pass ? "#15803d" : "#b91c1c";
  const recent = events.slice(-10);
  const recentMarkup = recent.length
    ? recent
        .map(evt => `<li>${evt.op.toUpperCase()} pk=${evt.pk ?? "∅"} ts=${evt.ts_ms}</li>`)
        .join("")
    : "<li>No events captured yet.</li>";

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
      <h2>Recent events (${recent.length})</h2>
      <ul>
        ${recentMarkup}
      </ul>
    </section>
  </main>
</body>
</html>`;
}
