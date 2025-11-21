import { memo, ReactNode } from "react";

interface TooltipProps {
  children: ReactNode;
  "data-tooltip": string;
}

export const Tooltip = memo(({ children, "data-tooltip": tooltip }: TooltipProps) => (
  <span className="cf-tooltip" data-tooltip={tooltip}>
    {children}
  </span>
));
Tooltip.displayName = "Tooltip";
