import { test, expect } from "@playwright/test";
import { createServer } from "http";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "../..");

const suite = process.env.PLAYWRIGHT_DISABLE === "1" ? test.describe.skip : test.describe;

// Minimal static file server so the page is served over real HTTP(S), not
// file://. This is the condition under which `index.html`'s hardcoded
// APPWRITE_CFG.assetHeaders activates the loaders' header path. A regression
// in that path (e.g. importing code-split bundles via a non-hierarchical
// blob: URL) breaks the comparator + changefeed playground on every deployed
// site while file://-based specs stay green. This guards that gap.
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

let server;
let baseUrl;

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

  test("comparator and changefeed playground mount on static HTTP hosting", async ({ page }) => {
    const loaderWarnings = [];
    // Match only loader-specific failures, not unrelated "… unavailable"
    // warnings (e.g. anonymous session, event log widget) that would make this
    // smoke test flaky. These are the exact phrases the bundle loaders and the
    // index.html changefeed bootstrap emit on failure.
    const LOADER_FAILURE = /Simulator UI shell (?:load failed|bundle missing)|Changefeed[ -]playground (?:load failed|bundle missing)|Change feed playground unavailable|Failed to resolve module specifier/i;
    page.on("console", (msg) => {
      const text = msg.text();
      if (LOADER_FAILURE.test(text)) {
        loaderWarnings.push(text);
      }
    });

    await page.goto(`${baseUrl}/index.html`, { waitUntil: "load" });

    // The CDC Method Comparator must render (the blob-import regression left it
    // stuck on a "Simulator preview unavailable" placeholder).
    await expect(page.getByRole("heading", { name: /CDC Method Comparator/i })).toBeVisible({
      timeout: 15000,
    });

    // The Change Feed Playground must mount too (it is never imported unless the
    // index.html bootstrap calls its loader's .load() handle).
    const changefeedRoot = page.locator("#changefeedPlaygroundRoot");
    await expect(changefeedRoot).not.toContainText(/Preparing the change feed playground/i, {
      timeout: 15000,
    });
    await expect(changefeedRoot.getByText(/Source\s*→\s*Change Feed\s*→\s*Consumer/i)).toBeVisible({
      timeout: 15000,
    });

    expect(loaderWarnings, `loader warnings: ${loaderWarnings.join(" | ")}`).toEqual([]);
  });
});
