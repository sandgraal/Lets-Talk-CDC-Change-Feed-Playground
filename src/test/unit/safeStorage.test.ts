import { describe, expect, it } from "vitest";
import { createSafeStorage } from "../../ui/safeStorage";

class MockStorage {
  private readonly store = new Map<string, string>();
  failSet = false;
  failRemove = false;

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    if (this.failSet) {
      throw new Error("quota");
    }
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    if (this.failRemove) {
      throw new Error("remove");
    }
    this.store.delete(key);
  }

  seed(key: string, value: string) {
    this.store.set(key, value);
  }
}

describe("createSafeStorage", () => {
  it("returns fallback values when writes fail", () => {
    const storage = new MockStorage();
    storage.seed("prefs", "old");
    const safe = createSafeStorage(storage);

    storage.failSet = true;
    safe.setItem("prefs", "new");

    expect(safe.getItem("prefs")).toBe("new");
    storage.failRemove = true;
    safe.removeItem("prefs");
    expect(safe.getItem("prefs")).toBeNull();
  });

  it("clears fallback overrides after successful writes", () => {
    const storage = new MockStorage();
    storage.seed("prefs", "old");
    const safe = createSafeStorage(storage);

    storage.failSet = true;
    safe.setItem("prefs", "fallback");
    expect(safe.getItem("prefs")).toBe("fallback");

    storage.failSet = false;
    safe.setItem("prefs", "fresh");
    expect(safe.getItem("prefs")).toBe("fresh");

    storage.setItem("prefs", "base-only");
    expect(safe.getItem("prefs")).toBe("base-only");
  });

  it("operates with in-memory storage when local storage is unavailable", () => {
    const safe = createSafeStorage(null);
    safe.setItem("key", "value");
    expect(safe.getItem("key")).toBe("value");
    safe.removeItem("key");
    expect(safe.getItem("key")).toBeNull();
  });
});
