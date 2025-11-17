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

  await page.waitForSelector(".sim-shell__title", { timeout: 15000 });
}

export default loadComparator;
