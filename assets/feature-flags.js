(function initFeatureFlags(global) {
  const STORAGE_KEY = "cdc_feature_flags_v1";

  function safeParse(json) {
    try {
      const parsed = JSON.parse(json);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function readStoredFlags() {
    if (typeof global.localStorage === "undefined") return [];
    try {
      const raw = global.localStorage.getItem(STORAGE_KEY);
      return raw ? safeParse(raw) : [];
    } catch {
      return [];
    }
  }

  function writeStoredFlags(flags) {
    if (typeof global.localStorage === "undefined") return;
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(flags)));
    } catch {
      /* ignore persistence errors */
    }
  }

  function readQueryFlags() {
    if (typeof global.location === "undefined" || !global.location.search) return [];
    try {
      const params = new URLSearchParams(global.location.search);
      const multi = params.getAll("flag");
      const combined = (params.get("flags") || "")
        .split(",")
        .map(part => part.trim())
        .filter(Boolean);
      return [...multi, ...combined];
    } catch {
      return [];
    }
  }

  function collectInitialFlags() {
    const seed = new Set();

    const cfgFlags = Array.isArray(global.APPWRITE_CFG?.featureFlags)
      ? global.APPWRITE_CFG.featureFlags
      : [];
    cfgFlags.forEach(flag => seed.add(String(flag)));

    const globalFlags = Array.isArray(global.CDC_FEATURE_FLAGS)
      ? global.CDC_FEATURE_FLAGS
      : [];
    globalFlags.forEach(flag => seed.add(String(flag)));

    readStoredFlags().forEach(flag => seed.add(String(flag)));
    readQueryFlags().forEach(flag => seed.add(String(flag)));

    return seed;
  }

  function broadcast(flags) {
    try {
      global.dispatchEvent(
        new CustomEvent("cdc:feature-flags", {
          detail: Array.from(flags)
        })
      );
    } catch {
      /* ignore broadcast errors */
    }
  }

  const flags = collectInitialFlags();

  const api = {
    has(flag) {
      return flags.has(String(flag));
    },
    all() {
      return Array.from(flags);
    },
    enable(flag, options = {}) {
      if (!flag) return;
      flags.add(String(flag));
      if (options.persist !== false) writeStoredFlags(flags);
      broadcast(flags);
    },
    disable(flag, options = {}) {
      if (!flag) return;
      flags.delete(String(flag));
      if (options.persist !== false) writeStoredFlags(flags);
      broadcast(flags);
    },
    reset() {
      flags.clear();
      writeStoredFlags(flags);
      broadcast(flags);
    }
  };

  if (!global.cdcFeatureFlags) {
    global.cdcFeatureFlags = api;
  }

  broadcast(flags);
})(typeof window !== "undefined" ? window : globalThis);
