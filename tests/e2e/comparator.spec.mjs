import { test, expect } from "@playwright/test";
import { pathToFileURL, fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexUrl = pathToFileURL(path.resolve(__dirname, "../../index.html")).href;

const suite = process.env.PLAYWRIGHT_DISABLE === "1" ? test.describe.skip : test.describe;

suite("Comparator basics", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("cdc_playground_onboarding_v1", "seen");
    });
  });

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
    const laneCard = page.locator(".sim-shell__lane-card").first();
    await expect(laneCard.getByText("No events match the current filters.").first()).toBeVisible();
  });

  test("toggles event operations", async ({ page }) => {
    await page.goto(indexUrl, { waitUntil: "load" });
    await page.evaluate(() => window.cdcComparatorClock?.play?.());
    await page.waitForTimeout(300);
    const deleteToggle = page.locator(".sim-shell__event-ops").getByRole("button", { name: "D" });
    await deleteToggle.click();
    await expect(deleteToggle).toHaveAttribute("data-active", "false");
  });

  test("schema walkthrough emits events and updates destinations", async ({ page }) => {
    await page.goto(indexUrl, { waitUntil: "load" });

    const scenarioSelect = page.locator('select[aria-label="Scenario"]');
    await scenarioSelect.waitFor({ timeout: 10000 });
    await scenarioSelect.selectOption({ label: "Schema Evolution" });

    const simulator = page.getByRole("region", { name: "Simulator preview" });
    const addButton = simulator.locator('[data-tour-target="schema-add"]').first();
    const dropButton = simulator.locator('[data-tour-target="schema-drop"]').first();
    const destination = simulator.locator(".sim-shell__destination").first();
    const eventLog = page.locator(".sim-shell__event-log");

    await page.evaluate(() => window.cdcComparatorClock?.play?.());
    await page.waitForTimeout(200);

    await page.waitForSelector('[data-tour-target="schema-add"]', { timeout: 5000 });
    await expect(addButton).toBeEnabled();

    await addButton.click();

    await expect(eventLog.getByText(/Added column priority_flag/i).first()).toBeVisible();
    await expect(addButton).toBeDisabled();
    await expect(destination.locator('th[data-highlight="true"]')).toContainText("priority_flag");

    await dropButton.click();

    await expect(eventLog.getByText(/Dropped column priority_flag/i).first()).toBeVisible();
    await expect(destination.locator('th[data-highlight="true"]')).toHaveCount(0);
  });
  
  test("transactions scenario exposes apply-on-commit toggle", async ({ page }) => {
    await page.goto(indexUrl, { waitUntil: "load" });

    const scenarioSelect = page.locator('select[aria-label="Scenario"]');
    await scenarioSelect.waitFor({ timeout: 10000 });
    await scenarioSelect.selectOption({ label: "Orders + Items Transactions" });

    await page.evaluate(() => window.cdcComparatorClock?.play?.());
    await page.waitForTimeout(300);

    const firstLane = page.locator(".sim-shell__lane-card").first();
    await expect(firstLane.locator("thead th", { hasText: "Table" })).toBeVisible();

    const toggle = page.getByRole("checkbox", { name: "Apply on commit" });
    await expect(toggle).toBeVisible();
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await expect(toggle).toBeChecked();
  });
});
