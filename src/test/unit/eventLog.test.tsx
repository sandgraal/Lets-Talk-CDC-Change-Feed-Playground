import { fireEvent, render, screen, within } from "@testing-library/react";
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

  it("enables replay for verbose change verbs", () => {
    const onReplay = vi.fn();
    render(
      <EventLog
        events={[
          { id: "evt-insert", op: "INSERT" },
          { id: "evt-update", op: "update" },
          { id: "evt-delete", op: "Delete" },
        ]}
        onReplayEvent={onReplay}
      />,
    );

    const replayButtons = screen.getAllByRole("button", { name: "Replay" });
    replayButtons.forEach(button => expect(button).toBeEnabled());
  });

  it("disables the replay action for schema events", () => {
    const onReplay = vi.fn();
    render(<EventLog events={[{ id: "evt-schema", op: "s" }]} onReplayEvent={onReplay} />);

    const replayButton = screen.getByRole("button", { name: "Replay" });
    expect(replayButton).toBeDisabled();
    fireEvent.click(replayButton);
    expect(onReplay).not.toHaveBeenCalled();
  });

  it("surfaces change and method mix summaries for the visible window", () => {
    render(
      <EventLog
        events={[
          { id: "evt-1", op: "c", methodId: "polling", methodLabel: "Polling" },
          { id: "evt-2", op: "u", methodId: "log", methodLabel: "Log" },
          { id: "evt-3", op: "c", methodId: "polling", methodLabel: "Polling" },
        ]}
      />,
    );

    const changeMix = screen.getByText("Change mix").closest(".cdc-event-log__summary-block");
    const methodMix = screen.getByText("Method mix").closest(".cdc-event-log__summary-block");

    expect(changeMix).toBeTruthy();
    expect(methodMix).toBeTruthy();

    if (changeMix) {
      expect(within(changeMix).getByText(/INSERT/)).toBeInTheDocument();
      expect(within(changeMix).getByText(/UPDATE/)).toBeInTheDocument();
    }
    if (methodMix) {
      expect(within(methodMix).getByText(/Polling/)).toBeInTheDocument();
      expect(within(methodMix).getByText(/Log/)).toBeInTheDocument();
    }
  });

  it("invokes filter callbacks when selecting an operation", () => {
    const onFiltersChange = vi.fn();
    render(
      <EventLog
        events={[sampleEvent]}
        onFiltersChange={onFiltersChange}
        filterOptions={{
          methods: [],
          ops: ["c", "u"],
          tables: [],
          txns: [],
        }}
      />,
    );

    const opSelect = screen.getByLabelText("Operation");
    fireEvent.change(opSelect, { target: { value: "u" } });
    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ op: "u" }));

    fireEvent.change(opSelect, { target: { value: "" } });
    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ op: undefined }));
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

  it("handles events with missing or empty methodId and methodLabel fields gracefully", () => {
    render(
      <EventLog
        events={[
          { id: "evt-1", op: "c", methodId: "polling", methodLabel: "Polling" },
          { id: "evt-2", op: "u", methodId: "log", methodLabel: null },
          { id: "evt-3", op: "d", methodId: null, methodLabel: null },
          { id: "evt-4", op: "c", methodId: "", methodLabel: "" },
          { id: "evt-5", op: "u" },
        ]}
      />,
    );

    const methodMix = screen.getByText("Method mix").closest(".cdc-event-log__summary-block");

    expect(methodMix).toBeTruthy();
    if (methodMix) {
      // Events with valid methodId/methodLabel should appear
      expect(within(methodMix).getByText(/Polling/)).toBeInTheDocument();
      // Event with methodId but no methodLabel should use methodId as label
      expect(within(methodMix).getByText(/log/)).toBeInTheDocument();
      // Events with both fields missing/empty are excluded from the summary
    }
  });

  it("handles events with missing or invalid op codes", () => {
    render(
      <EventLog
        events={[
          { id: "evt-1", op: "" },
          { id: "evt-2", op: "   " },
          { id: "evt-3", op: "invalid-op" },
        ]}
      />,
    );

    const changeMix = screen.getByText("Change mix").closest(".cdc-event-log__summary-block");

    expect(changeMix).toBeTruthy();
    if (changeMix) {
      // Empty and whitespace-only ops should be filtered out, but invalid-op should appear as uppercase
      expect(within(changeMix).getByText(/INVALID-OP/)).toBeInTheDocument();
    }
  });

  it("shows 'No op codes' fallback when all events have empty op values", () => {
    render(
      <EventLog
        events={[
          { id: "evt-1", op: "" },
          { id: "evt-2", op: "   " },
          { id: "evt-3", op: "" },
        ]}
      />,
    );

    const changeMix = screen.getByText("Change mix").closest(".cdc-event-log__summary-block");

    expect(changeMix).toBeTruthy();
    if (changeMix) {
      expect(within(changeMix).getByText("No op codes")).toBeInTheDocument();
    }
  });

  it("shows 'No method labels' fallback when all events have empty method values", () => {
    render(
      <EventLog
        events={[
          { id: "evt-1", op: "c", methodId: null, methodLabel: null },
          { id: "evt-2", op: "u", methodId: "", methodLabel: "" },
          { id: "evt-3", op: "d" },
        ]}
      />,
    );

    const methodMix = screen.getByText("Method mix").closest(".cdc-event-log__summary-block");

    expect(methodMix).toBeTruthy();
    if (methodMix) {
      expect(within(methodMix).getByText("No method labels")).toBeInTheDocument();
    }
  });
});
