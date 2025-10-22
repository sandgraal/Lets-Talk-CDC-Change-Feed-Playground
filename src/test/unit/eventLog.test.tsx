import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

  it("invokes the replay callback for change events", () => {
    const onReplay = vi.fn();
    render(
      <EventLog
        events={[{ ...sampleEvent, op: "c", methodId: "polling", table: "orders", pk: "ORD-1" }]}
        onReplayEvent={onReplay}
      />,
    );

    const replayButton = screen.getByRole("button", { name: "Replay" });
    expect(replayButton).toBeEnabled();
    fireEvent.click(replayButton);
    expect(onReplay).toHaveBeenCalledTimes(1);
    expect(onReplay).toHaveBeenCalledWith(expect.objectContaining({ id: sampleEvent.id }));
  });

  it("disables the replay action for schema events", () => {
    const onReplay = vi.fn();
    render(<EventLog events={[{ id: "evt-schema", op: "s" }]} onReplayEvent={onReplay} />);

    const replayButton = screen.getByRole("button", { name: "Replay" });
    expect(replayButton).toBeDisabled();
    fireEvent.click(replayButton);
    expect(onReplay).not.toHaveBeenCalled();
  });

  it("lets users load additional historical events on demand", () => {
    const events = Array.from({ length: 5 }, (_, index) => ({
      id: `evt-${index}`,
      op: "c",
      table: `table-${index}`,
    }));

    render(<EventLog events={events} maxVisibleEvents={2} />);

    expect(screen.getByText(/Showing latest 2 of 5 events\./i)).toBeInTheDocument();
    expect(screen.getByText(/table table-4/i)).toBeInTheDocument();
    expect(screen.getByText(/table table-3/i)).toBeInTheDocument();
    expect(screen.queryByText(/table table-0/i)).not.toBeInTheDocument();

    const loadMore = screen.getByRole("button", { name: "Load more" });
    fireEvent.click(loadMore);

    expect(screen.getByText(/Showing latest 4 of 5 events\./i)).toBeInTheDocument();
    expect(screen.getByText(/table table-1/i)).toBeInTheDocument();
    expect(screen.queryByText(/table table-0/i)).not.toBeInTheDocument();

    const showLatest = screen.getByRole("button", { name: "Show latest" });
    fireEvent.click(showLatest);

    expect(screen.getByText(/Showing latest 2 of 5 events\./i)).toBeInTheDocument();
    expect(screen.queryByText(/table table-1/i)).not.toBeInTheDocument();
  });
});
