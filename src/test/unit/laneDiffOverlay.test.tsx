import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LaneDiffOverlay } from "../../../web/components/LaneDiffOverlay";
import type { LaneDiffResult } from "../../../sim";

describe("LaneDiffOverlay", () => {
  const baseDiff: LaneDiffResult = {
    method: "polling",
    totals: { missing: 0, extra: 0, ordering: 0 },
    issues: [],
    lag: { max: 0, samples: [] },
  };

  it("renders schema drift notice when column missing", () => {
    render(
      <LaneDiffOverlay
        diff={baseDiff}
        scenarioName="schema-demo"
        schemaStatus={{ version: 1, expectedVersion: 2, hasColumn: false, columnName: "priority_flag" }}
      />,
    );

    expect(screen.getByText(/column missing/i)).toBeVisible();
  });

  it("renders schema version lag notice when behind", () => {
    render(
      <LaneDiffOverlay
        diff={baseDiff}
        scenarioName="schema-demo"
        schemaStatus={{ version: 1, expectedVersion: 3, hasColumn: true, columnName: "priority_flag" }}
      />,
    );

    expect(screen.getByText(/Schema behind/i)).toBeVisible();
  });
});
