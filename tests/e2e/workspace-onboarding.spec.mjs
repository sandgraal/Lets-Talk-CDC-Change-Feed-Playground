import { test, expect } from "@playwright/test";
import { pathToFileURL, fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexUrl = pathToFileURL(path.resolve(__dirname, "../../index.html")).href;

const suite = process.env.PLAYWRIGHT_DISABLE === "1" ? test.describe.skip : test.describe;

async function loadWorkspace(page) {
  await page.goto(indexUrl, { waitUntil: "load" });
  await page.waitForSelector("#schema", { timeout: 15000 });
}

suite("Workspace onboarding", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
    });
  });

  test("start from scratch without Scranton seeds a blank schema", async ({ page }) => {
    await loadWorkspace(page);

    const overlay = page.locator("#onboardingOverlay");
    await expect(overlay).toBeVisible({ timeout: 15000 });

    const startButton = page.getByRole("button", { name: "Start from scratch" });
    await expect(startButton).toBeVisible();
    await startButton.click();

    await expect(overlay).toBeHidden();

    const schemaPills = page.locator("#schemaPills .pill");
    await expect(schemaPills).toHaveCount(0);

    await expect(page.locator("#schemaStatus")).toContainText("Add a column to begin");

    const stored = await page.evaluate(() => window.localStorage.getItem("cdc_playground"));
    expect(stored).toBeTruthy();
    const parsed = stored ? JSON.parse(stored) : null;
    expect(parsed?.schema ?? []).toHaveLength(0);
    expect(parsed?.rows ?? []).toHaveLength(0);

    const officePref = await page.evaluate(() => window.localStorage.getItem("cdc_playground_office_opt_in_v1"));
    expect(officePref).toBe("false");
  });
});
