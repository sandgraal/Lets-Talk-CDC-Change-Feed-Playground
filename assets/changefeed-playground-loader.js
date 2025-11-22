(function attachChangefeedPlaygroundLoader(global) {
  if (global.__LetstalkCdcChangefeedPlayground?.load) return;

  const bundleHref = "./generated/changefeed-playground.js";

  const fallbackOrigins = ["http://localhost:4173", "http://localhost:5173"];

  const scriptBase = (() => {
    if (typeof document !== "undefined" && document.currentScript?.src) {
      return document.currentScript.src;
    }
    if (typeof location !== "undefined" && location.href) {
      return location.href;
    }
    return bundleHref;
  })();

  const assetHeaderEntries = (() => {
    const raw = global.APPWRITE_CFG?.assetHeaders;
    if (!raw || typeof raw !== "object") return [];
    return Object.entries(raw).filter(([, value]) => typeof value === "string" && value);
  })();

  function resolveHref(relativeHref) {
    try {
      return new URL(relativeHref, scriptBase).toString();
    } catch {
      return relativeHref;
    }
  }

  function candidateHrefs(relativeHref) {
    const resolved = resolveHref(relativeHref);
    const candidates = [resolved];
    for (const origin of fallbackOrigins) {
      try {
        candidates.push(new URL(relativeHref, origin).toString());
      } catch {
        /* ignore malformed origins */
      }
    }
    return candidates;
  }

  async function importGeneratedModule(relativeHref) {
    const resolved = resolveHref(relativeHref);

    if (assetHeaderEntries.length === 0) {
      return import(/* @vite-ignore */ resolved);
    }

    const headers = {};
    for (const [key, value] of assetHeaderEntries) {
      headers[key] = value;
    }

    const response = await fetch(resolved, { headers, credentials: "include" });
    if (!response.ok) {
      throw new Error(`Failed to load ${resolved}: ${response.status} ${response.statusText}`);
    }

    const source = await response.text();
    const blob = new Blob([source], { type: "text/javascript" });
    const blobUrl = URL.createObjectURL(blob);

    try {
      return await import(/* @vite-ignore */ blobUrl);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  async function importFromCandidates(relativeHref) {
    const candidates = candidateHrefs(relativeHref);
    let lastError;

    for (const candidate of candidates) {
      try {
        return await importGeneratedModule(candidate);
      } catch (error) {
        lastError = error;
        console.warn(`Changefeed playground load failed for ${candidate}`, error);
      }
    }

    throw lastError || new Error(`Unable to load ${relativeHref}`);
  }

  async function loadBundle() {
    if (global.__LetstalkCdcChangefeedPlaygroundBundle) {
      return global.__LetstalkCdcChangefeedPlaygroundBundle;
    }

    try {
      const mod = await importFromCandidates(bundleHref);
      const resolved = mod?.default ?? mod;
      if (resolved) {
        global.__LetstalkCdcChangefeedPlaygroundBundle = resolved;
      }
      return resolved;
    } catch (error) {
      console.warn(
        "Changefeed-playground bundle missing. Run `npm run build:web` to generate assets/generated/changefeed-playground.js before loading the page.",
        error,
      );
      throw error;
    }
  }

  global.__LetstalkCdcChangefeedPlayground = {
    load: loadBundle,
  };
})(typeof window !== "undefined" ? window : globalThis);
