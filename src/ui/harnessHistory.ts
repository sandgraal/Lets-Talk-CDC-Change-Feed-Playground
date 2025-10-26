export type HarnessHistoryCell = {
  text: string;
  href?: string;
  emphasis?: boolean;
};

export type HarnessHistoryRow = HarnessHistoryCell[];

export type HarnessHistoryTable = {
  headers: string[];
  rows: HarnessHistoryRow[];
  placeholder?: string | null;
};

const splitTableLine = (line: string): string[] => {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || trimmed === "|") return [];
  const segments = trimmed.split("|");
  segments.shift();
  if (segments.length > 0 && segments[segments.length - 1].trim() === "") {
    segments.pop();
  }
  return segments.map(cell => cell.trim());
};

const stripEmphasis = (value: string): { text: string; emphasis: boolean } => {
  let text = value.trim();
  let emphasis = false;
  const markers = ["*", "_"];
  let changed = true;
  while (changed && text.length >= 2) {
    changed = false;
    markers.forEach(marker => {
      if (text.startsWith(marker) && text.endsWith(marker)) {
        const next = text.slice(marker.length, text.length - marker.length).trim();
        if (next.length >= 0) {
          text = next;
          emphasis = true;
          changed = true;
        }
      }
    });
  }
  return { text, emphasis };
};

const parseLink = (value: string): { text: string; href?: string } => {
  const match = value.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (!match) {
    return { text: value };
  }
  const [, label, href] = match;
  return { text: label.trim(), href: href.trim() };
};

const decodeHtmlEntities = (value: string): string =>
  value.replace(/&nbsp;/gi, " ").replace(/&#160;/g, " ");

const parseCell = (value: string): HarnessHistoryCell => {
  if (!value) return { text: "" };
  const decoded = decodeHtmlEntities(value);
  const { text, emphasis } = stripEmphasis(decoded);
  const link = parseLink(text);
  return {
    text: link.text.trim(),
    href: link.href,
    emphasis,
  };
};

const isSeparatorRow = (cells: string[]): boolean =>
  cells.length > 0 && cells.every(cell => /^:?[-=]+:?$/u.test(cell.replace(/\s+/g, "")));

const isPlaceholderRow = (cells: HarnessHistoryCell[]): boolean => {
  if (!cells.length) return false;
  const first = cells[0].text.trim().toLowerCase();
  return first.length > 0 && first.includes("no runs") && first.includes("captured");
};

export const parseHarnessHistoryMarkdown = (
  markdown: string | null | undefined,
): HarnessHistoryTable | null => {
  if (!markdown || typeof markdown !== "string") return null;
  const lines = markdown
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith("|"));
  if (lines.length < 2) return null;

  const headerCells = splitTableLine(lines[0]);
  if (!headerCells.length) return null;

  const headers = headerCells.map(cell => stripEmphasis(decodeHtmlEntities(cell)).text);

  const dataLines = lines.slice(1);
  const rows: HarnessHistoryRow[] = [];
  let placeholder: string | null = null;

  dataLines.forEach(line => {
    const rawCells = splitTableLine(line);
    if (!rawCells.length) return;
    if (isSeparatorRow(rawCells)) return;
    const parsedCells = rawCells.map(parseCell);
    if (isPlaceholderRow(parsedCells)) {
      placeholder = parsedCells[0].text.trim();
      return;
    }
    if (parsedCells.every(cell => cell.text === "")) return;
    rows.push(parsedCells);
  });

  return {
    headers,
    rows,
    placeholder,
  };
};

export type { HarnessHistoryTable as ParsedHarnessHistory };
