import { test, expect } from "@playwright/test";
import { pathToFileURL, fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexUrl = pathToFileURL(path.resolve(__dirname, "../../index.html")).href;

const suite = process.env.PLAYWRIGHT_DISABLE === "1" ? test.describe.skip : test.describe;

suite("Comparator basics", () => {
  test("renders default scenario", async ({ page }) => {
    await page.goto(indexUrl, { waitUntil: "load" });
    await expect(page.getByRole("heading", { name: /CDC Method Comparator/i })).toBeVisible();
    await expect(page.getByRole("combobox", { name: /Scenario/i })).toBeVisible();
  });

  test("filters events via search", async ({ page }) => {
    await page.goto(indexUrl, { waitUntil: "load" });
    await page.evaluate(() => window.cdcComparatorClock?.play?.());
    await page.waitForTimeout(500);
    const filterInput = page.getByPlaceholder("Filter by pk, seq, or payload");
    await filterInput.fill("R-1");
    await expect(page.getByText(/No events match the current filters/i)).toBeVisible();
  });

  test("toggles event operations", async ({ page }) => {
    await page.goto(indexUrl, { waitUntil: "load" });
    await page.evaluate(() => window.cdcComparatorClock?.play?.());
    await page.waitForTimeout(300);
    const deleteToggle = page.getByRole("button", { name: "D" });
    await deleteToggle.click();
    await expect(deleteToggle).toHaveAttribute("data-active", "false");
  });
});
