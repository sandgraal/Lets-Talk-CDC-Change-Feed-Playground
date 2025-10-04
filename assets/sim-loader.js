(function attachSimulatorLoader(global) {
  if (global.__LetstalkCdcSimulator?.load) return;

  const bundleHref = "./assets/generated/sim-bundle.js";

  async function loadBundle() {
    if (global.__LetstalkCdcSimulatorBundle) {
      return global.__LetstalkCdcSimulatorBundle;
    }

    try {
      const mod = await import(bundleHref);
      const resolved = mod?.default ?? mod;
      if (resolved) {
        global.__LetstalkCdcSimulatorBundle = resolved;
      }
      return resolved;
    } catch (error) {
      console.warn(
        "Simulator bundle not found. Run `npm install` and `npm run build:sim` to generate assets/generated/sim-bundle.js.",
      );
      throw error;
    }
  }

  global.__LetstalkCdcSimulator = { load: loadBundle };
})(typeof window !== "undefined" ? window : globalThis);
