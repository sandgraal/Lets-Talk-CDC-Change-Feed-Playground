import { test, expect } from "@playwright/test";
import { pathToFileURL, fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexUrl = pathToFileURL(path.resolve(__dirname, "../../index.html")).href;

const suite = process.env.PLAYWRIGHT_DISABLE === "1" ? test.describe.skip : test.describe;

// A minimal valid subset of the export payload. importScenario() only needs
// `schema` (rows/events/scenarioId/comparator are optional); the real
// exportScenario() also emits exported_at, remoteId, comparator, and officeOptIn.
const SCENARIO = {
  version: 2,
  schema: [
    { name: "id", type: "string", pk: true },
    { name: "qty", type: "number", pk: false },
  ],
  rows: [
    { id: "A1", qty: 7 },
    { id: "A2", qty: 3 },
  ],
  events: [{ ts_ms: 1, op: "c", after: { id: "A1", qty: 7 } }],
  scenarioId: "qa-import",
};

async function importFile(page, contents, name = "scenario.json") {
  await page.locator("#importFile").setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(typeof contents === "string" ? contents : JSON.stringify(contents)),
  });
}

suite("Scenario import (from file)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      // Skip the onboarding modal; enable ff_crud_fix so the error toast renders.
      window.localStorage.setItem("cdc_playground_onboarding_v1", "seen");
      window.CDC_FEATURE_FLAGS = ["comparator_v2", "ff_crud_fix"];
    });
    await page.goto(indexUrl, { waitUntil: "load" });
    await page.waitForSelector("#schema", { timeout: 15000 });
  });

  test("imports a scenario file and restores schema + rows", async ({ page }) => {
    await importFile(page, SCENARIO);

    await expect(page.locator("#schemaPills .pill")).toHaveCount(2);
    await expect(page.locator("#schemaPills")).toContainText("id");
    await expect(page.locator("#schemaPills")).toContainText("qty");
    await expect(page.locator("#table-state")).toContainText("A1");
    await expect(page.locator("#table-state")).toContainText("A2");

    const stored = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem("cdc_playground") || "{}"),
    );
    expect(stored.schema ?? []).toHaveLength(2);
    expect(stored.rows ?? []).toHaveLength(2);
  });

  test("rejects invalid JSON without wiping the current scenario", async ({ page }) => {
    // Seed a valid scenario first.
    await importFile(page, SCENARIO);
    await expect(page.locator("#schemaPills .pill")).toHaveCount(2);

    // Importing malformed JSON must not overwrite the loaded scenario with empties.
    await importFile(page, "{ this is not json", "broken.json");

    await expect(page.locator(".toast--error")).toContainText(/invalid scenario json/i);
    // The previously loaded scenario is preserved (the bug class: a bad import
    // silently wiping state).
    await expect(page.locator("#schemaPills .pill")).toHaveCount(2);
    const stored = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem("cdc_playground") || "{}"),
    );
    expect(stored.schema ?? []).toHaveLength(2);
  });
});
