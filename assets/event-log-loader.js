(function attachEventLogWidgetLoader(global) {
  if (global.__LetstalkCdcEventLogWidget?.load) return;

  const bundleHref = "./generated/event-log-widget.js";

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

  async function loadBundle() {
    if (global.__LetstalkCdcEventLogWidgetBundle) {
      return global.__LetstalkCdcEventLogWidgetBundle;
    }

    try {
      const mod = await importGeneratedModule(bundleHref);
      const resolved = mod?.default ?? mod;
      if (resolved) {
        global.__LetstalkCdcEventLogWidgetBundle = resolved;
      }
      return resolved;
    } catch (error) {
      console.warn(
        "Event log widget bundle missing. Run `npm run build:web` to generate assets/generated/event-log-widget.js before loading the page.",
        error,
      );
      throw error;
    }
  }

  global.__LetstalkCdcEventLogWidget = {
    load: loadBundle,
  };
})(typeof window !== "undefined" ? window : globalThis);
