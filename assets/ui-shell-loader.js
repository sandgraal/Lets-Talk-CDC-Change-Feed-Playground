(function initUiShell(global) {
  if (global.__LetstalkCdcUiShellLoaded) return;

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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      void loadShell();
    }, { once: true });
  } else {
    void loadShell();
  }
})(typeof window !== "undefined" ? window : globalThis);
