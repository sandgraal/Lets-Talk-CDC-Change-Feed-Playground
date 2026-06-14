import { test, expect } from "@playwright/test";
import { pathToFileURL, fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexFileUrl = pathToFileURL(path.resolve(__dirname, "../../index.html"));
indexFileUrl.searchParams.set("resetOnboarding", "1");
const indexUrl = indexFileUrl.href;

const suite = process.env.PLAYWRIGHT_DISABLE === "1" ? test.describe.skip : test.describe;

async function loadWorkspace(page) {
  await page.goto(indexUrl, { waitUntil: "load" });
  await page.waitForSelector("#schema", { timeout: 15000 });
}

suite("Workspace onboarding", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.CDC_FEATURE_FLAGS = ["comparator_v2"];
    });
  });

  test("start from scratch loads the Scranton schema with sample rows", async ({ page }) => {
    await loadWorkspace(page);

    const overlay = page.locator("#onboardingOverlay");
    await expect(overlay).toBeVisible({ timeout: 15000 });

    // The old opt-in Scranton checkbox is gone.
    await expect(page.locator("#onboardingEasterEgg")).toHaveCount(0);

    const startButton = page.getByRole("button", { name: "Start from scratch" });
    await expect(startButton).toBeVisible();
    await startButton.click();

    await expect(overlay).toBeHidden();

    // Learners land on the populated 6-column Scranton schema, not a blank canvas.
    await expect(page.locator("#schemaPills .pill")).toHaveCount(6);

    const stored = await page.evaluate(() => window.localStorage.getItem("cdc_playground"));
    expect(stored).toBeTruthy();
    const parsed = stored ? JSON.parse(stored) : null;
    expect(parsed?.schema ?? []).toHaveLength(6);
    expect((parsed?.rows ?? []).length).toBeGreaterThan(0);

    const officePref = await page.evaluate(() => window.localStorage.getItem("cdc_playground_office_opt_in_v1"));
    expect(officePref).toBe("true");
  });
});
