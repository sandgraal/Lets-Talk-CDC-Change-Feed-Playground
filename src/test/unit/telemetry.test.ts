import { describe, expect, it, vi } from "vitest";
import { createTelemetryClient, type TelemetryEntry } from "../../ui/telemetry";

type SeedEntry = {
  event: string;
  payload?: Record<string, unknown>;
  context?: Record<string, unknown>;
  question?: string;
  recordedAt?: string;
};

const createMemoryStorage = (seed: SeedEntry[] | null = null) => {
  let value = seed ? JSON.stringify(seed) : null;
  return {
    getItem: (_key: string) => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
    removeItem: (_key: string) => {
      value = null;
    },
    dump: () => value,
  };
};

describe("createTelemetryClient", () => {
  it("loads buffer from storage and trims to the configured size", () => {
    const storage = createMemoryStorage([
      {
        event: "comparator.event.search",
        payload: { query: "orders" },
        question: "activation",
        recordedAt: "2024-01-01T00:00:00.000Z",
      },
      {
        event: "comparator.event.download",
        question: "adoption",
        recordedAt: "2024-01-01T00:00:01.000Z",
      },
      {
        event: "tour.completed",
        question: "activation",
        recordedAt: "2024-01-01T00:00:02.000Z",
      },
    ]);

    const client = createTelemetryClient({ storage, storageKey: "key", maxEntries: 2 });

    expect(client.buffer).toHaveLength(2);
    expect(client.buffer[0].event).toBe("comparator.event.download");
    expect(client.buffer[1].event).toBe("tour.completed");
  });

  it("tracks events, maps taxonomy, persists buffer, and logs when debug is enabled", () => {
    const storage = createMemoryStorage();
    const debug = vi.fn();
    const warn = vi.fn();
    const now = () => new Date("2024-01-01T05:00:00.000Z");
    const client = createTelemetryClient({
      storage,
      storageKey: "telemetry",
      maxEntries: 3,
      now,
      console: { debug, warn },
    });

    client.track(
      "comparator.event.copy",
      { scenario: "orders-transactions" },
      { debug: true, source: "test" },
    );

    expect(client.buffer).toHaveLength(1);
    const entry = client.buffer[0];
    expect(entry.question).toBe("activation");
    expect(entry.payload).toEqual({ scenario: "orders-transactions" });
    expect(entry.context).toEqual({ debug: true, source: "test" });
    expect(entry.recordedAt).toBe("2024-01-01T05:00:00.000Z");
    expect(debug).toHaveBeenCalledWith("[telemetry]", entry);

    const persisted = JSON.parse(storage.dump() ?? "[]") as TelemetryEntry[];
    expect(persisted).toHaveLength(1);
    expect(persisted[0].event).toBe("comparator.event.copy");
  });

  it("ignores blank events and guards against storage errors", () => {
    const storage = {
      getItem: (_key: string) => {
        throw new Error("boom");
      },
      setItem: (_key: string, _value: string) => {
        throw new Error("save boom");
      },
      removeItem: (_key: string) => undefined,
    };
    const warn = vi.fn();
    const client = createTelemetryClient({ storage, console: { warn, debug: vi.fn() } });

    expect(client.buffer).toHaveLength(0);
    client.track("", { foo: "bar" });
    expect(client.buffer).toHaveLength(0);
    client.track("workspace.share.generated");
    expect(warn).toHaveBeenCalled();
  });

  it("flushes the buffer and clears persisted state", () => {
    const storage = createMemoryStorage();
    const client = createTelemetryClient({ storage, storageKey: "flush" });

    client.track("comparator.event.search", { query: "cdc" });
    expect(client.buffer).toHaveLength(1);

    const snapshot = client.flush();
    expect(snapshot).toHaveLength(1);
    expect(client.buffer).toHaveLength(0);
    expect(storage.dump()).toBe("[]");
  });

  it("exposes telemetry metadata as defensive copies", () => {
    const storage = createMemoryStorage();
    const client = createTelemetryClient({ storage });
    const questions = client.questions();
    expect(questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "quality_gate" }),
        expect.objectContaining({ key: "collaboration" }),
      ]),
    );

    const taxonomy = client.taxonomy();
    expect(taxonomy["comparator.event.copy"]).toBe("activation");
    taxonomy["comparator.event.copy"] = "adoption" as never;
    expect(client.taxonomy()["comparator.event.copy"]).toBe("activation");
  });
});
