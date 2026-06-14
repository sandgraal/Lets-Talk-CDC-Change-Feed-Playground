import { test, expect } from "@playwright/test";
import { createServer } from "http";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "../..");

const suite = process.env.PLAYWRIGHT_DISABLE === "1" ? test.describe.skip : test.describe;

// Minimal static file server so the page is served over real HTTP(S), not
// file://. The comparator + changefeed playground load their code-split bundles
// through hand-written loaders; a regression there (e.g. importing a code-split
// bundle via a non-hierarchical blob: URL) breaks both widgets on every deployed
// site while file://-based specs stay green. This file guards that gap in two
// configurations:
//   1. default — APPWRITE_CFG has no assetHeaders, so loaders use native import().
//   2. with assetHeaders injected — proves the loaders' native-import-first
//      path still mounts the widgets even when a header-fetch is configured
//      (the header/blob fallback alone cannot resolve code-split chunks).
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const LOADER_FAILURE =
  /Simulator UI shell (?:load failed|bundle missing)|Changefeed[ -]playground (?:load failed|bundle missing)|Change feed playground unavailable|Failed to resolve module specifier/i;

let server;
let baseUrl;

async function expectBothWidgetsMount(page) {
  const loaderWarnings = [];
  page.on("console", (msg) => {
    if (LOADER_FAILURE.test(msg.text())) loaderWarnings.push(msg.text());
  });

  await page.goto(`${baseUrl}/index.html`, { waitUntil: "load" });

  // The Change Feed Playground is the default ("Drive one feed") tab of the
  // unified Simulator card and must mount (it is never imported unless the
  // index.html bootstrap calls its loader's .load() handle).
  const changefeedRoot = page.locator("#changefeedPlaygroundRoot");
  await expect(changefeedRoot).not.toContainText(/Preparing the change feed playground/i, {
    timeout: 15000,
  });
  await expect(changefeedRoot.getByText(/Source\s*→\s*Change Feed\s*→\s*Consumer/i)).toBeVisible({
    timeout: 15000,
  });

  // The CDC Method Comparator lives behind the "Compare methods" tab; activate
  // it and confirm it still renders (the blob-import regression left it stuck
  // on a "Simulator preview unavailable" placeholder).
  await page.waitForFunction(
    () => {
      const tab = document.getElementById("simTabCompare");
      if (!tab) return false;
      if (tab.getAttribute("aria-selected") === "true") return true;
      tab.click();
      return tab.getAttribute("aria-selected") === "true";
    },
    null,
    { timeout: 15000 },
  );
  await expect(page.getByRole("heading", { name: /CDC Method Comparator/i })).toBeVisible({
    timeout: 15000,
  });

  expect(loaderWarnings, `loader warnings: ${loaderWarnings.join(" | ")}`).toEqual([]);
}

suite("Static hosting smoke (served over HTTP)", () => {
  test.beforeAll(async () => {
    server = createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
        const relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
        const filePath = path.resolve(repoRoot, relative);
        const relToRoot = path.relative(repoRoot, filePath);
        if (relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) {
          res.writeHead(403).end("Forbidden");
          return;
        }
        const body = await readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream" });
        res.end(body);
      } catch {
        res.writeHead(404).end("Not found");
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  test.afterAll(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("cdc_playground_onboarding_v1", "seen");
    });
  });

  test("both widgets mount over HTTP (default config)", async ({ page }) => {
    await expectBothWidgetsMount(page);
  });

  test("both widgets mount over HTTP even when assetHeaders are configured", async ({ page }) => {
    // Force the header-fetch condition the deployed site used to ship with, to
    // prove the loaders' native-import-first path keeps both widgets working.
    // Intercept the assignment of window.APPWRITE_CFG (set by an inline script
    // in index.html) and graft assetHeaders on before the loader scripts read it.
    await page.addInitScript(() => {
      let stored;
      Object.defineProperty(window, "APPWRITE_CFG", {
        configurable: true,
        get() {
          return stored;
        },
        set(value) {
          stored = value
            ? { ...value, assetHeaders: { "X-Appwrite-Project": "smoke-test" } }
            : value;
        },
      });
    });
    await expectBothWidgetsMount(page);

    // Guard against the injection silently no-op'ing (which would make this a
    // duplicate of the default test): the page must actually have shipped with
    // assetHeaders configured.
    const injectedHeader = await page.evaluate(
      () => window.APPWRITE_CFG?.assetHeaders?.["X-Appwrite-Project"],
    );
    expect(injectedHeader).toBe("smoke-test");
  });
});
