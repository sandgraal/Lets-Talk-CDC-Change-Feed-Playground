const EXTRA_WRITE_THRESHOLD = 0.05;

export const MIN_MEANINGFUL_WRITE_AMPLIFICATION = 1 + EXTRA_WRITE_THRESHOLD;

const stripTrailingZero = (value: string) => value.replace(/\.0$/, "");

export function hasMeaningfulWriteAmplification(
  value: number | null | undefined,
): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= MIN_MEANINGFUL_WRITE_AMPLIFICATION;
}

export function formatWriteAmplificationRatio(value: number): string {
  const ratio = Number.isFinite(value) ? Math.max(value, 0) : 0;
  return `${ratio.toFixed(1)}x`;
}

export function describeWriteAmplification(value: number): string {
  const ratioText = formatWriteAmplificationRatio(value);
  const extraWrites = Number.isFinite(value) ? Math.max(value - 1, 0) : 0;
  if (extraWrites < EXTRA_WRITE_THRESHOLD) {
    return ratioText;
  }
  const precision = extraWrites >= 10 ? 0 : extraWrites >= 1 ? 1 : 2;
  const rounded = stripTrailingZero(extraWrites.toFixed(precision));
  return `${ratioText} (~${rounded} extra writes/change)`;
}
