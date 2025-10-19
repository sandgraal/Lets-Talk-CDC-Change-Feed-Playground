import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MetricsStrip } from "../../ui/components/MetricsStrip";

describe("MetricsStrip", () => {
  it("renders key metrics and status flags", () => {
    render(
      <MetricsStrip
        lagMs={240}
        throughput={12.3}
        deletesPct={64}
        orderingOk={false}
        consistent={true}
        writeAmplification={2.5}
      />,
    );

    expect(screen.getByText(/Lag: 240ms/i)).toBeInTheDocument();
    expect(screen.getByText(/TPS: 12\.3/i)).toBeInTheDocument();
    expect(screen.getByText(/Deletes: 64%/i)).toBeInTheDocument();
    expect(screen.getByText(/Ordering: KO/i)).toBeInTheDocument();
    expect(screen.getByText(/Consistency: OK/i)).toBeInTheDocument();
    expect(screen.getByText(/Trigger WA: 2\.5x/i)).toBeInTheDocument();
  });
});
