import { describe, expect, it } from "vitest";

import { parseHarnessHistoryMarkdown } from "../../ui/harnessHistory";

describe("parseHarnessHistoryMarkdown", () => {
  it("parses table headers and rows", () => {
    const markdown = `
| Run | Date | Conclusion |
| --- | --- | --- |
| [#12](https://example.invalid/run/12) | 2025-01-02 | success |
| #11 | 2025-01-01 | failure |
`;

    const result = parseHarnessHistoryMarkdown(markdown);

    expect(result).not.toBeNull();
    expect(result?.headers).toEqual(["Run", "Date", "Conclusion"]);
    expect(result?.rows).toHaveLength(2);
    expect(result?.rows[0][0].text).toBe("#12");
    expect(result?.rows[0][0].href).toBe("https://example.invalid/run/12");
    expect(result?.rows[0][2].text).toBe("success");
    expect(result?.rows[1][0].text).toBe("#11");
  });

  it("captures placeholder rows when no runs are recorded", () => {
    const markdown = `
| Run | Date |
| --- | --- |
| _No runs captured yet._ |   |
`;

    const result = parseHarnessHistoryMarkdown(markdown);

    expect(result).not.toBeNull();
    expect(result?.rows).toHaveLength(0);
    expect(result?.placeholder).toBe("No runs captured yet.");
  });

  it("marks emphasised cells", () => {
    const markdown = `
| Run | Notes |
| --- | --- |
| #10 | _Lag increased_ |
`;

    const result = parseHarnessHistoryMarkdown(markdown);

    expect(result).not.toBeNull();
    expect(result?.rows).toHaveLength(1);
    const cell = result?.rows[0][1];
    expect(cell?.text).toBe("Lag increased");
    expect(cell?.emphasis).toBe(true);
  });
});
