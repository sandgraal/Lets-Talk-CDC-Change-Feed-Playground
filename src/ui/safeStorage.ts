import type { ScenarioFilterStorage } from "../features/scenarioFilters";

export type StorageLike = Pick<ScenarioFilterStorage, "getItem" | "setItem" | "removeItem">;

export type SafeStorage = ScenarioFilterStorage & { removeItem: (key: string) => void };

export const createSafeStorage = (storage: StorageLike | null | undefined): SafeStorage => {
  const memory = new Map<string, string | null>();

  const readFromBase = (key: string): string | null => {
    if (!storage) {
      return memory.get(key) ?? null;
    }

    try {
      const value = storage.getItem(key);
      return typeof value === "string" ? value : value ?? null;
    } catch {
      return memory.get(key) ?? null;
    }
  };

  const removeFromBase = (key: string): boolean => {
    if (!storage) return false;

    try {
      if (typeof storage.removeItem === "function") {
        storage.removeItem(key);
      } else {
        storage.setItem(key, "");
      }
      return true;
    } catch {
      return false;
    }
  };

  return {
    getItem(key: string): string | null {
      if (memory.has(key)) {
        return memory.get(key) ?? null;
      }
      return readFromBase(key);
    },
    setItem(key: string, value: string): void {
      if (storage) {
        try {
          storage.setItem(key, value);
          memory.delete(key);
          return;
        } catch {
          // fall through to store in memory
        }
      }
      memory.set(key, value);
    },
    removeItem(key: string): void {
      memory.delete(key);
      if (!removeFromBase(key)) {
        memory.set(key, null);
      }
    },
  };
};
