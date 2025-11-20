import { render, screen, act } from "@testing-library/react";
import { vi } from "vitest";
import { PlaygroundCorePreview } from "../../../web/components/PlaygroundCorePreview";
import type { ShellScenario } from "../../../web/scenarios";

const demoScenario: ShellScenario = {
  id: "demo",
  name: "Demo",
  label: "Demo scenario",
  description: "Simple insert/update/delete to exercise the core",
  highlight: undefined,
  stats: { rows: 1, ops: 3 },
  table: "orders",
  tags: [],
  schema: [],
  rows: [],
  events: [],
  schemaVersion: 1,
  comparator: null,
  seed: 1,
  ops: [
    { t: 0, op: "insert", table: "orders", pk: { id: "1" }, after: { id: "1", status: "new" } },
    { t: 120, op: "update", table: "orders", pk: { id: "1" }, after: { status: "paid" } },
    { t: 240, op: "delete", table: "orders", pk: { id: "1" } },
  ],
};

describe("PlaygroundCorePreview", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("renders three lanes and controls", () => {
    act(() => {
      render(<PlaygroundCorePreview scenarios={[demoScenario]} />);
    });

    expect(screen.getByTestId("polling-event-count")).toBeInTheDocument();
    expect(screen.getByTestId("trigger-event-count")).toBeInTheDocument();
    expect(screen.getByTestId("log-event-count")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /step/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reset/i })).toBeInTheDocument();
  });

  it("shows scenario selector options", () => {
    render(<PlaygroundCorePreview scenarios={[demoScenario]} />);
    const select = screen.getByLabelText(/Preview blueprint/i) as HTMLSelectElement;
    expect(select.value).toBe("demo");
  });
});
