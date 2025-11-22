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

  const loaderUtils = global.__LetstalkCdcLoaderUtils;
  if (!loaderUtils) {
    console.error("loader-utils.js must be loaded before changefeed-playground-loader.js");
    return;
  }

  const { importFromCandidates } = loaderUtils;

  async function loadBundle() {
    if (global.__LetstalkCdcChangefeedPlaygroundBundle) {
      return global.__LetstalkCdcChangefeedPlaygroundBundle;
    }

    try {
      const mod = await importFromCandidates(
        bundleHref,
        scriptBase,
        fallbackOrigins,
        assetHeaderEntries,
        "Changefeed playground"
      );
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
