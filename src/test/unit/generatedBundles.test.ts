import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Guards against drift between the generated stylesheets index.html actually
// loads and the freshness contract in check-generated-bundles.mjs. Without this,
// CI could stay green while a linked widget stylesheet goes unbuilt at runtime
// (exactly how the comparator/playground once shipped unstyled).
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const indexHtml = readFileSync(resolve(repoRoot, "index.html"), "utf8");
const bundleCheckScript = readFileSync(
  resolve(repoRoot, "scripts/check-generated-bundles.mjs"),
  "utf8",
);

const linkedStylesheets = Array.from(
  indexHtml.matchAll(/href="\.\/assets\/generated\/([^"]+\.css)"/g),
  ([, stylesheet]) => stylesheet,
);

const checkedBundles = Array.from(
  bundleCheckScript.matchAll(/output:\s+join\(GENERATED_DIR,\s+"([^"]+)"\)/g),
  ([, bundle]) => bundle,
);

describe("generated bundle checks", () => {
  it("covers every generated stylesheet linked from index.html", () => {
    expect(linkedStylesheets.length).toBeGreaterThan(0);

    for (const stylesheet of linkedStylesheets) {
      expect(checkedBundles).toContain(stylesheet);
    }
  });
});
