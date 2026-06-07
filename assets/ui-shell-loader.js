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

    const canFetchWithHeaders = (() => {
      if (assetHeaderEntries.length === 0) return false;
      try {
        const url = new URL(resolved, scriptBase);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    })();

    // Prefer a native dynamic import: the browser resolves the bundle's
    // relative cross-chunk imports (e.g. "./event-log-widget.js") against the
    // bundle's own URL. This is the path that works for static hosting,
    // Appwrite Sites (public assets), GitHub Pages, and `open index.html`.
    try {
      return await import(/* @vite-ignore */ resolved);
    } catch (nativeError) {
      // Native import only fails when the host genuinely refuses the request
      // (e.g. a CDN that requires custom headers). Fall back to a
      // header-authenticated fetch + blob import. NOTE: blob: URLs have a
      // non-hierarchical base, so a code-split bundle that imports sibling
      // chunks relatively will still fail here — keep the web bundles
      // self-contained, or this fallback cannot help them.
      if (!canFetchWithHeaders) {
        throw nativeError;
      }
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
      "<p>The CDC Method Comparator is turned off. Turn it on to compare polling, trigger, and log capture side by side.</p>" +
      '<p class="sim-shell__placeholder-actions">' +
      '<button type="button" class="sim-shell__btn" id="simShellEnableFlag">Turn on comparator</button>' +
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
      '<div class="sim-shell__placeholder sim-shell__placeholder--error" role="alert">' +
      "<p>The CDC Method Comparator couldn't load — this is usually a temporary network hiccup.</p>" +
      '<p class="sim-shell__placeholder-actions">' +
      '<button type="button" class="sim-shell__btn" id="simShellRetry">Retry</button>' +
      "</p>" +
      "</div>";
    // Technical detail stays in the console for maintainers, not the learner UI.
    console.warn(
      "Simulator UI shell bundle could not be loaded. Tried:",
      candidateHrefs(bundleHref).join(", ")
    );
    const retry = document.getElementById("simShellRetry");
    if (retry) {
      retry.addEventListener("click", () => global.location.reload(), { once: true });
    }
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
