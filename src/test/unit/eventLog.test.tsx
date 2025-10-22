import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EventLog } from "../../ui/components/EventLog";

const sampleEvent = {
  id: "evt-1",
  op: "c",
};

describe("EventLog", () => {
  it("renders snapshot row stats when provided", () => {
    render(
      <EventLog
        events={[sampleEvent]}
        stats={{ produced: 1, consumed: 1, backlog: 0, snapshotRows: 5 }}
      />,
    );

    expect(screen.getByText(/Produced 1/)).toBeInTheDocument();
    expect(screen.getByText(/Consumed 1/)).toBeInTheDocument();
    expect(screen.getByText(/Backlog 0/)).toBeInTheDocument();
    expect(screen.getByText(/Snapshot rows 5/)).toBeInTheDocument();
  });

  it("omits snapshot rows when not provided", () => {
    render(<EventLog events={[sampleEvent]} stats={{ produced: 2, consumed: 2, backlog: 1 }} />);

    expect(screen.queryByText(/Snapshot rows/)).not.toBeInTheDocument();
  });
});
