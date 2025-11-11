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
        insertCount={3}
        updateCount={4}
        deleteCount={5}
        schemaChangeCount={2}
      />,
    );

    expect(screen.getByText(/Lag: 240ms/i)).toBeInTheDocument();
    expect(screen.getByText(/TPS: 12\.3/i)).toBeInTheDocument();
    expect(screen.getByText(/Deletes: 64%/i)).toBeInTheDocument();
    expect(screen.getByText(/Ordering: KO/i)).toBeInTheDocument();
    expect(screen.getByText(/Consistency: OK/i)).toBeInTheDocument();
    expect(screen.getByText(/Ops C\/U\/D: 3\/4\/5/i)).toBeInTheDocument();
    expect(screen.getByText(/Schema: 2/i)).toBeInTheDocument();
    expect(screen.getByText(/Trigger WA: 2\.5x \(~1\.5 extra writes\/change\)/i)).toBeInTheDocument();
  });
});
