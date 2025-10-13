(function attachEventLogWidgetLoader(global) {
  if (global.__LetstalkCdcEventLogWidget?.load) return;

  const bundleHref = "./generated/event-log-widget.js";

  async function loadBundle() {
    if (global.__LetstalkCdcEventLogWidgetBundle) {
      return global.__LetstalkCdcEventLogWidgetBundle;
    }

    try {
      const mod = await import(bundleHref);
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
