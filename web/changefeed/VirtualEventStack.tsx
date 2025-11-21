import { memo, useRef, useState, useEffect, useCallback } from "react";
import type { ChangeEvent } from "../../src";

interface VirtualEventStackProps {
  events: ChangeEvent[];
  renderEvent: (event: ChangeEvent) => React.ReactNode;
  itemHeight?: number;
  maxHeight?: number;
  threshold?: number;
}

/**
 * VirtualEventStack renders a virtualized list of events.
 * Only renders visible items + buffer for smooth scrolling.
 * Activates virtualization when event count exceeds threshold.
 */
export const VirtualEventStack = memo(
  ({
    events,
    renderEvent,
    itemHeight = 120,
    maxHeight = 600,
    threshold = 50,
  }: VirtualEventStackProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);

    const shouldVirtualize = events.length > threshold;

    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
      setScrollTop(e.currentTarget.scrollTop);
    }, []);

    // Calculate which items to render
    const { visibleItems, totalHeight, offsetY } = (() => {
      if (!shouldVirtualize) {
        return {
          visibleItems: events,
          totalHeight: "auto" as const,
          offsetY: 0,
        };
      }

      const totalHeight = events.length * itemHeight;
      const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - 5); // 5 item buffer above
      const endIndex = Math.min(
        events.length,
        Math.ceil((scrollTop + maxHeight) / itemHeight) + 5 // 5 item buffer below
      );

      const visibleItems = events.slice(startIndex, endIndex);
      const offsetY = startIndex * itemHeight;

      return { visibleItems, totalHeight, offsetY };
    })();

    return (
      <div
        ref={containerRef}
        className={`cf-event-stack ${
          shouldVirtualize ? "cf-event-stack--virtual" : ""
        }`}
        style={
          shouldVirtualize
            ? {
                maxHeight: `${maxHeight}px`,
                overflowY: "auto",
                position: "relative",
              }
            : undefined
        }
        onScroll={shouldVirtualize ? handleScroll : undefined}
      >
        {shouldVirtualize ? (
          <>
            <div style={{ height: totalHeight, position: "relative" }}>
              <div style={{ transform: `translateY(${offsetY}px)` }}>
                {visibleItems.map((event) => (
                  <div key={event.lsn}>{renderEvent(event)}</div>
                ))}
              </div>
            </div>
          </>
        ) : (
          events.map((event) => <div key={event.lsn}>{renderEvent(event)}</div>)
        )}
      </div>
    );
  }
);

VirtualEventStack.displayName = "VirtualEventStack";
