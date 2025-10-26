/**
 * normalizeComparatorSummary.ts
 * 
 * Ensures that preloaded comparator snapshot summaries match
 * the same shape as live dispatcher events by injecting labels,
 * tooltips, and value fields for known metrics.
 */

export type MetricLabelMap = Record<string, { label: string; tooltip?: string }>;

export interface ComparatorSummaryRaw {
  [key: string]: any;
}

export interface ComparatorSummaryLive {
  bestLag?: { label: string; value?: number; tooltip?: string };
  triggerWriteAmplification?: { label: string; value?: number; tooltip?: string };
  lanes?: Array<{ id: string; label: string; tooltip?: string } & Record<string, any>>;
  [key: string]: any;
}

export function normalizeComparatorSummary(
  raw: ComparatorSummaryRaw,
  methodCopy: MetricLabelMap
): ComparatorSummaryLive {
  const out: ComparatorSummaryLive = structuredClone(raw ?? {});

  const ensureLabeled = (node: any, key: string, fallbackId?: string) => {
    if (!node) return;
    const val = node[key];
    const id = typeof val === "string" ? val : fallbackId;
    const meta = id ? methodCopy[id] : undefined;

    if (val != null && typeof val === "object" && "label" in val) return;

    node[key] = {
      label: meta?.label ?? String(id ?? val ?? ""),
      tooltip: meta?.tooltip,
      value: typeof val === "number" ? val : val?.value ?? val,
    };
  };

  ensureLabeled(out, "bestLag", (out as any)?.bestLagId);
  ensureLabeled(out, "triggerWriteAmplification", (out as any)?.triggerWriteAmplificationId);

  if (Array.isArray(out.lanes)) {
    out.lanes = out.lanes
      .map((lane: any) => {
        const methodName = typeof lane?.method === "string" ? lane.method : undefined;
        const meta = methodName ? methodCopy[methodName] : undefined;
        return {
          ...lane,
          id: methodName,
          label: meta?.label ?? methodName,
          tooltip: meta?.tooltip,
        };
      })
      .filter(Boolean);
  }

  return out;
}
