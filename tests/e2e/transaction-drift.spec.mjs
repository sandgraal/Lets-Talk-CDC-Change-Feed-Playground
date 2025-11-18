import { test, expect } from "@playwright/test";
import { loadComparator } from "./support/comparator.mjs";

const suite = process.env.PLAYWRIGHT_DISABLE === "1" ? test.describe.skip : test.describe;

suite("Transaction drift", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("cdc_playground_onboarding_v1", "seen");
    });
  });

  test("apply-on-commit keeps multi-table transactions atomic", async ({ page }) => {
    await loadComparator(page);

    await page.waitForFunction(() => Boolean(window.cdcComparatorDebug), undefined, {
      timeout: 10000,
    });

    const scenarioSelect = page.locator('select[aria-label="Scenario"]');
    await scenarioSelect.waitFor({ timeout: 10000 });
    await scenarioSelect.selectOption({ label: "Orders + Items Transactions" });

    const throttleGroup = page.getByRole("group", { name: /Apply rate limit/i });
    const throttleSlider = throttleGroup.locator('input[type="range"]');
    if (await throttleSlider.isDisabled()) {
      await throttleGroup.getByRole("button").click();
    }
    await expect(throttleSlider).toBeEnabled();
    await throttleSlider.evaluate(input => {
      input.value = "10";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const applyToggle = page.getByRole("checkbox", { name: "Apply on commit" });
    if (await applyToggle.isChecked()) {
      await applyToggle.uncheck();
    }

    await page.evaluate(() => {
      window.cdcComparatorDebug?.resetHistory();
      window.cdcComparatorClock?.reset?.();
      window.cdcComparatorClock?.play?.();
    });

    await page.waitForFunction(() => {
      const history = window.cdcComparatorDebug?.getLaneHistory("polling") ?? [];
      return history.includes(1) && history.includes(2);
    }, undefined, { timeout: 10000 });

    await page.waitForFunction(() => {
      const snapshot = window.cdcComparatorDebug?.getLaneSnapshot("polling");
      return Boolean(snapshot && snapshot.rows.length >= 3);
    }, undefined, { timeout: 10000 });

    const partialHistory = await page.evaluate(() => {
      return window.cdcComparatorDebug?.getLaneHistory("polling") ?? [];
    });
    expect(partialHistory).toContain(1);
    expect(partialHistory).toContain(2);

    await page.evaluate(() => {
      window.cdcComparatorClock?.reset?.();
      window.cdcComparatorDebug?.resetHistory();
    });
    await applyToggle.check();
    await page.evaluate(() => window.cdcComparatorClock?.play?.());

    await page.waitForFunction(() => {
      const snapshot = window.cdcComparatorDebug?.getLaneSnapshot("polling");
      return Boolean(snapshot && snapshot.rows.length >= 3);
    }, undefined, { timeout: 10000 });

    const commitHistory = await page.evaluate(() => {
      return window.cdcComparatorDebug?.getLaneHistory("polling") ?? [];
    });
    expect(commitHistory).not.toContain(1);
    expect(commitHistory).not.toContain(2);
    const lastEntry = commitHistory[commitHistory.length - 1] ?? 0;
    expect(lastEntry).toBeGreaterThanOrEqual(3);
  });
});
