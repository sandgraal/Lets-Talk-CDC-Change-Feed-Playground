import { pathToFileURL, fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const comparatorIndexUrl = pathToFileURL(
  path.resolve(__dirname, "../../../index.html"),
).href;

export async function loadComparator(page) {
  await page.addInitScript(() => {
    const existing = Array.isArray(window.CDC_FEATURE_FLAGS)
      ? window.CDC_FEATURE_FLAGS.slice()
      : [];
    if (!existing.includes("comparator_v2")) {
      existing.push("comparator_v2");
    }
    window.CDC_FEATURE_FLAGS = existing;
  });
  await page.goto(comparatorIndexUrl, { waitUntil: "load" });

  await page.waitForFunction(() => {
    return Boolean(window.__LetstalkCdcUiShellLoaded);
  }, null, { timeout: 15000 });

  // The comparator now lives behind the "Compare methods" tab of the unified
  // Simulator card; activate it so its contents become visible.
  await activateCompareTab(page);

  await page.waitForSelector(".sim-shell__title", { state: "visible", timeout: 15000 });
}

// Switch the unified Simulator card to its "Compare methods" tab. Polls until
// the tab handler (bound by assets/app.js) has taken effect to avoid races.
export async function activateCompareTab(page) {
  await page.waitForSelector("#simTabCompare", { timeout: 15000 });
  await page.waitForFunction(
    () => {
      const tab = document.getElementById("simTabCompare");
      if (!tab) return false;
      if (tab.getAttribute("aria-selected") === "true") return true;
      tab.click();
      return tab.getAttribute("aria-selected") === "true";
    },
    null,
    { timeout: 10000 },
  );
}

export default loadComparator;
