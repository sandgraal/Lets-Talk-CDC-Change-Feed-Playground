import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const indexHtml = readFileSync(resolve(repoRoot, "index.html"), "utf8");
const bundleCheckScript = readFileSync(
  resolve(repoRoot, "scripts/check-generated-bundles.mjs"),
  "utf8",
);

const generatedStylesheets = Array.from(
  indexHtml.matchAll(/href="\.\/assets\/generated\/([^"]+\.css)"/g),
  ([, stylesheet]) => stylesheet,
);

const checkedBundles = Array.from(
  bundleCheckScript.matchAll(/output:\s+join\(GENERATED_DIR,\s+"([^"]+)"\)/g),
  ([, bundle]) => bundle,
);

describe("generated bundle checks", () => {
  it("verifies every generated stylesheet linked from index.html", () => {
    expect(generatedStylesheets.length).toBeGreaterThan(0);

    generatedStylesheets.forEach(stylesheet => {
      expect(checkedBundles).toContain(stylesheet);
    });
  });
});
