(function loadPlayground(global) {
  const bundleHref = "./generated/changefeed-playground.js";
  const mountId = "changefeedPlaygroundRoot";

  function markUnavailable(message) {
    const root = typeof document !== "undefined" ? document.getElementById(mountId) : null;
    if (root) {
      root.innerHTML = `<p class="sim-shell__placeholder">${message}</p>`;
    }
  }

  async function loadBundle() {
    try {
      await import(/* @vite-ignore */ bundleHref);
    } catch (error) {
      console.warn("Change feed playground bundle missing. Run `npm run build:web` to generate assets/generated/changefeed-playground.js.", error);
      markUnavailable("Build the playground bundle to view the interactive lanes.");
    }
  }

  if (typeof document === "undefined") return;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void loadBundle(), { once: true });
  } else {
    void loadBundle();
  }
})(typeof window !== "undefined" ? window : globalThis);
