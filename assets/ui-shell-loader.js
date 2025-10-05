(function initUiShell(global) {
  if (global.__LetstalkCdcUiShellLoaded) return;

  const FLAG_NAME = "comparator_v2";

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
      await import("./assets/generated/ui-shell.js");
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
