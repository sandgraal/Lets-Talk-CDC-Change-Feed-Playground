import { LaneDiffOverlay as BaseLaneDiffOverlay } from "../../src/ui/components/LaneDiffOverlay";
import type {
  LaneDiffOverlayContext,
  LaneDiffOverlayProps,
} from "../../src/ui/components/LaneDiffOverlay";
import { track } from "../telemetry";

export type {
  LaneDiffOverlayProps,
  LaneDiffOverlayContext,
  LaneDiffResult,
  LaneDiffIssue,
  LaneDiffLagSample,
  LaneDiffSchemaStatus,
} from "../../src/ui/components/LaneDiffOverlay";

export function LaneDiffOverlay({ onDiffDetailsOpened, ...rest }: LaneDiffOverlayProps) {
  const handleOpened = (context: LaneDiffOverlayContext) => {
    onDiffDetailsOpened?.(context);
    track("comparator.diff.opened", {
      method: context.method,
      issues: context.issueCount,
      maxLag: context.maxLag,
      scenario: context.scenario,
    });
  };

  return (
    <BaseLaneDiffOverlay
      {...rest}
      onDiffDetailsOpened={handleOpened}
    />
  );
}

export default LaneDiffOverlay;
