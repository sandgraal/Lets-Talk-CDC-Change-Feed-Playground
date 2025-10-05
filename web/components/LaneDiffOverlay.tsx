import type { LaneDiffResult } from "../../sim";
import { track } from "../telemetry";

type LaneDiffOverlayProps = {
  diff: LaneDiffResult | null;
};

function formatIssueLabel(issue: LaneDiffResult["issues"][number]): string {
  const op = issue.op.toUpperCase();
  const pk = issue.pk || "∅";
  const expectedIndex = issue.expectedIndex != null ? `#${issue.expectedIndex}` : undefined;
  const actualIndex = issue.actualIndex != null ? `#${issue.actualIndex}` : undefined;

  if (issue.type === "missing") {
    return `Missing ${op} for pk=${pk} (${expectedIndex ?? "expected"} @ ${issue.expectedTime ?? "?"}ms)`;
  }
  if (issue.type === "extra") {
    return `Unexpected ${op} for pk=${pk} (${actualIndex ?? "emitted"} @ ${issue.actualTime ?? "?"}ms)`;
  }
  return `Out-of-order ${op} pk=${pk} (expected ${expectedIndex ?? "?"} before actual ${actualIndex ?? "?"})`;
}

export function LaneDiffOverlay({ diff }: LaneDiffOverlayProps) {
  if (!diff) return null;

  const { totals, issues, lag } = diff;
  const hasIssues = totals.missing > 0 || totals.extra > 0 || totals.ordering > 0;
  const surfaceIssues = issues.slice(0, 6);

  if (!hasIssues && lag.max <= 0) {
    return null;
  }

  return (
    <div className="sim-shell__lane-diff" data-has-issues={hasIssues ? "true" : "false"} role="note">
      <div className="sim-shell__lane-diff-summary">
        {hasIssues ? (
          <>
            {totals.missing > 0 && (
              <span className="sim-shell__lane-diff-chip sim-shell__lane-diff-chip--missing">
                {totals.missing} missing
              </span>
            )}
            {totals.extra > 0 && (
              <span className="sim-shell__lane-diff-chip sim-shell__lane-diff-chip--extra">
                {totals.extra} extra
              </span>
            )}
            {totals.ordering > 0 && (
              <span className="sim-shell__lane-diff-chip sim-shell__lane-diff-chip--ordering">
                {totals.ordering} ordering
              </span>
            )}
          </>
        ) : (
          <span className="sim-shell__lane-diff-chip sim-shell__lane-diff-chip--ok">Operations aligned</span>
        )}
        {lag.max > 0 && (
          <span className="sim-shell__lane-diff-chip sim-shell__lane-diff-chip--lag">
            Max lag {Math.round(lag.max)}ms
          </span>
        )}
      </div>

      {(surfaceIssues.length > 0 || lag.samples.length > 0) && (
        <details
          className="sim-shell__lane-diff-details"
          onToggle={event => {
            if ((event.target as HTMLDetailsElement).open) {
              track("comparator.diff.opened", {
                method: diff.method,
                issues: diff.issues.length,
                maxLag: diff.lag.max,
              });
            }
          }}
        >
          <summary>Diff details</summary>
          {surfaceIssues.length > 0 && (
            <ul className="sim-shell__lane-diff-list">
              {surfaceIssues.map((issue, index) => (
                <li key={`${issue.type}-${issue.op}-${issue.pk}-${index}`}>{formatIssueLabel(issue)}</li>
              ))}
            </ul>
          )}
          {issues.length > surfaceIssues.length && (
            <p className="sim-shell__lane-diff-more">
              +{issues.length - surfaceIssues.length} additional difference(s)
            </p>
          )}
          {lag.samples.length > 0 && (
            <div className="sim-shell__lane-diff-lag">
              <h4>Lag hotspots</h4>
              <ul>
                {lag.samples.map(sample => (
                  <li key={`${sample.op}-${sample.pk}-${sample.actualTime}`}>
                    {Math.round(sample.lagMs)}ms on {sample.op.toUpperCase()} pk={sample.pk}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </details>
      )}
    </div>
  );
}
