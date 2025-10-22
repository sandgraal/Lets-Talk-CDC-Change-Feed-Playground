import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MetricsDashboard } from "../../ui/components/MetricsDashboard";

describe("MetricsDashboard", () => {
  it("renders lane metrics with totals", () => {
    render(
      <MetricsDashboard
        lanes={[
          {
            id: "polling",
            label: "Polling",
            produced: 10,
            consumed: 8,
            backlog: 2,
            lagP50: 400,
            lagP95: 900,
            missedDeletes: 1,
            snapshotRows: 4,
            inserts: 4,
            updates: 3,
            deletes: 1,
            schemaChanges: 1,
          },
          {
            id: "trigger",
            label: "Trigger",
            produced: 12,
            consumed: 12,
            backlog: 0,
            lagP50: 80,
            lagP95: 120,
            writeAmplification: 2.1,
            snapshotRows: 0,
            inserts: 6,
            updates: 4,
            deletes: 2,
          },
        ]}
      />,
    );

    expect(screen.getByText(/Produced 22/i)).toBeInTheDocument();
    expect(screen.getByText(/Polling/)).toBeInTheDocument();
    expect(screen.getByText(/Trigger/)).toBeInTheDocument();
    expect(screen.getByText(/Missed deletes/i)).toBeInTheDocument();
    expect(screen.getByText(/Write amplification/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Snapshot rows/i)).toHaveLength(2);
    expect(screen.getAllByText(/Change mix/i)).toHaveLength(2);
    expect(screen.getByText(/C 4 · U 3 · D 1 · Schema 1/i)).toBeInTheDocument();
    expect(screen.getByText(/C 6 · U 4 · D 2/i)).toBeInTheDocument();
  });
});
