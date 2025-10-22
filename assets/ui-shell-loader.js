(function initUiShell(global) {
  if (global.__LetstalkCdcUiShellLoaded) return;

  const FLAG_NAME = "comparator_v2";

  const bundleHref = "./generated/ui-shell.js";

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

  async function importGeneratedModule(relativeHref) {
    const resolved = (() => {
      try {
        return new URL(relativeHref, scriptBase).toString();
      } catch {
        return relativeHref;
      }
    })();

    const shouldFetchWithHeaders = (() => {
      if (assetHeaderEntries.length === 0) return false;
      try {
        const url = new URL(resolved, scriptBase);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    })();

    if (!shouldFetchWithHeaders) {
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

  function hasComparatorFlag() {
    return Boolean(global.cdcFeatureFlags?.has?.(FLAG_NAME));
  }

  function markUnavailable() {
    const root = document.getElementById("simShellRoot");
    if (!root) return;
    root.innerHTML =
      '<p class="sim-shell__placeholder">Enable the comparator_v2 feature flag to load the CDC Method Comparator.</p>';
  }

  async function loadShell() {
    try {
      await importGeneratedModule(bundleHref);
      global.__LetstalkCdcUiShellLoaded = true;
    } catch (error) {
      console.warn(
        "Simulator UI shell bundle missing. Run `npm run build:web` to generate assets/generated/ui-shell.js before loading the page.",
        error
      );
    }
  }

  function bootWhenReady() {
    if (!hasComparatorFlag()) {
      markUnavailable();
      return;
    }

    if (document.readyState === "loading") {
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          void loadShell();
        },
        { once: true }
      );
    } else {
      void loadShell();
    }
  }

  if (hasComparatorFlag()) {
    bootWhenReady();
  } else {
    markUnavailable();
    const listener = event => {
      const detail = Array.isArray(event.detail) ? event.detail : [];
      if (detail.includes(FLAG_NAME)) {
        global.removeEventListener("cdc:feature-flags", listener);
        bootWhenReady();
      }
    };
    global.addEventListener("cdc:feature-flags", listener);
  }
})(typeof window !== "undefined" ? window : globalThis);
