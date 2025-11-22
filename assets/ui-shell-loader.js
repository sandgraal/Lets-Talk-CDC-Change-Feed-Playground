(function initUiShell(global) {
  if (global.__LetstalkCdcUiShellLoaded) return;

  const FLAG_NAME = "comparator_v2";

  const fallbackOrigins = ["http://localhost:4173", "http://localhost:5173"];

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

  async function importFromCandidates(relativeHref) {
    const candidates = candidateHrefs(relativeHref);
    let lastError;

    for (const candidate of candidates) {
      try {
        return await importGeneratedModule(candidate);
      } catch (error) {
        lastError = error;
        console.warn(`Simulator UI shell load failed for ${candidate}`, error);
      }
    }

    throw lastError || new Error(`Unable to load ${relativeHref}`);
  }

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
      `<p class="sim-shell__placeholder-actions">Tried: ${candidateHrefs(bundleHref).join(", ")}</p>` +
      "</div>";
  }

  async function loadShell() {
    try {
      await importFromCandidates(bundleHref);
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
