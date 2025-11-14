import { describe, expect, it } from "vitest";
import { formatWriteAmplificationChip } from "../../../web/App";

describe("formatWriteAmplificationChip", () => {
  it("returns null for non-positive values", () => {
    expect(formatWriteAmplificationChip(0)).toBeNull();
    expect(formatWriteAmplificationChip(-1)).toBeNull();
    expect(formatWriteAmplificationChip(Number.NaN)).toBeNull();
  });

  it("formats amplification values with a single decimal place", () => {
    const chip = formatWriteAmplificationChip(2.456);
    expect(chip).not.toBeNull();
    expect(chip).toEqual({
      key: "write-amplification",
      text: "2.5x write amplification",
      tone: "amplification",
    });
  });
});
