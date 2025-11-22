(function initUiShell(global) {
  if (global.__LetstalkCdcUiShellLoaded) return;

  const FLAG_NAME = "comparator_v2";

  if (!global.__LetstalkCdcFallbackOrigins) {
    global.__LetstalkCdcFallbackOrigins = ["http://localhost:4173", "http://localhost:5173"];
  }
  const fallbackOrigins = global.__LetstalkCdcFallbackOrigins;

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

  const loaderUtils = global.__LetstalkCdcLoaderUtils;
  if (!loaderUtils) {
    console.error("loader-utils.js must be loaded before ui-shell-loader.js");
    return;
  }

  const { candidateHrefs, importFromCandidates } = loaderUtils;

  function hasComparatorFlag() {
    return Boolean(global.cdcFeatureFlags?.has?.(FLAG_NAME));
  }

  function markUnavailable() {
    const root = document.getElementById("simShellRoot");
    if (!root) return;
    root.innerHTML =
      '<div class="sim-shell__placeholder">' +
      '<p>Enable the comparator_v2 feature flag to load the CDC Method Comparator.</p>' +
      '<p class="sim-shell__placeholder-actions">' +
      '<button type="button" id="simShellEnableFlag">Enable & retry</button>' +
      " <span aria-live=\"polite\">(Note: Previously saved flag state may override this setting)</span>" +
      "</p>" +
      "</div>";

    const enableButton = document.getElementById("simShellEnableFlag");
    if (enableButton) {
      enableButton.addEventListener(
        "click",
        () => {
          try {
            global.cdcFeatureFlags?.enable?.(FLAG_NAME);
          } catch {
            /* ignore flag failures */
          }
          bootWhenReady();
        },
        { once: true }
      );
    }
  }

  function markMissingBundle() {
    const root = document.getElementById("simShellRoot");
    if (!root) return;
    root.innerHTML =
      '<div class="sim-shell__placeholder">' +
      '<p>Simulator preview unavailable. Run <code>npm run build:web</code> to generate comparator assets, then reload.</p>' +
      `<p class="sim-shell__placeholder-actions">Tried: ${candidateHrefs(bundleHref, scriptBase, fallbackOrigins).join(", ")}</p>` +
      "</div>";
  }

  async function loadShell() {
    try {
      await importFromCandidates(
        bundleHref,
        scriptBase,
        fallbackOrigins,
        assetHeaderEntries,
        "Simulator UI shell"
      );
      global.__LetstalkCdcUiShellLoaded = true;
    } catch (error) {
      console.warn(
        "Simulator UI shell bundle missing. Run `npm run build:web` to generate assets/generated/ui-shell.js before loading the page.",
        error
      );
      markMissingBundle();
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
