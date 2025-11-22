/**
 * Shared utilities for dynamic module loading with fallback origins support.
 * Used by ui-shell-loader.js and changefeed-playground-loader.js.
 */
(function attachLoaderUtils(global) {
  if (global.__LetstalkCdcLoaderUtils) return;

  /**
   * Resolves a relative href to an absolute URL based on the script base.
   * @param {string} relativeHref - The relative path to resolve
   * @param {string} scriptBase - The base URL for resolution
   * @returns {string} The resolved absolute URL, or the original href if resolution fails
   */
  function resolveHref(relativeHref, scriptBase) {
    try {
      return new URL(relativeHref, scriptBase).toString();
    } catch {
      return relativeHref;
    }
  }

  /**
   * Generates candidate URLs by combining a relative href with fallback origins.
   * @param {string} relativeHref - The relative path to resolve
   * @param {string} scriptBase - The base URL for resolution
   * @param {string[]} fallbackOrigins - Array of fallback origin URLs
   * @returns {string[]} Array of candidate URLs to try
   */
  function candidateHrefs(relativeHref, scriptBase, fallbackOrigins) {
    const resolved = resolveHref(relativeHref, scriptBase);
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

  /**
   * Imports a module, optionally fetching with custom headers first.
   * @param {string} resolvedUrl - The resolved absolute URL to import
   * @param {string} scriptBase - The base URL for URL validation
   * @param {Array<[string, string]>} assetHeaderEntries - Array of [key, value] header entries
   * @returns {Promise<any>} The imported module
   */
  async function importGeneratedModule(resolvedUrl, scriptBase, assetHeaderEntries) {
    const shouldFetchWithHeaders = (() => {
      if (assetHeaderEntries.length === 0) return false;
      try {
        const url = new URL(resolvedUrl, scriptBase);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    })();

    if (!shouldFetchWithHeaders) {
      return import(/* @vite-ignore */ resolvedUrl);
    }

    const headers = {};
    for (const [key, value] of assetHeaderEntries) {
      headers[key] = value;
    }

    const response = await fetch(resolvedUrl, { headers, credentials: "include" });
    if (!response.ok) {
      throw new Error(`Failed to load ${resolvedUrl}: ${response.status} ${response.statusText}`);
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

  /**
   * Attempts to import a module from multiple candidate URLs.
   * @param {string} relativeHref - The relative path to import
   * @param {string} scriptBase - The base URL for resolution
   * @param {string[]} fallbackOrigins - Array of fallback origin URLs
   * @param {Array<[string, string]>} assetHeaderEntries - Array of [key, value] header entries
   * @param {string} logContext - Context string for console warnings
   * @returns {Promise<any>} The imported module
   * @throws {Error} If all candidate URLs fail to load
   */
  async function importFromCandidates(
    relativeHref,
    scriptBase,
    fallbackOrigins,
    assetHeaderEntries,
    logContext
  ) {
    const candidates = candidateHrefs(relativeHref, scriptBase, fallbackOrigins);
    let lastError;

    for (const candidate of candidates) {
      try {
        return await importGeneratedModule(candidate, scriptBase, assetHeaderEntries);
      } catch (error) {
        lastError = error;
        console.warn(`${logContext} load failed for ${candidate}`, error);
      }
    }

    throw lastError || new Error(`Unable to load ${relativeHref}`);
  }

  global.__LetstalkCdcLoaderUtils = {
    resolveHref,
    candidateHrefs,
    importGeneratedModule,
    importFromCandidates,
  };
})(typeof window !== "undefined" ? window : globalThis);
