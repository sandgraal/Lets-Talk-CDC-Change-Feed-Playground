import { createRoot } from "react-dom/client";
import { EventLog, type EventLogProps } from "../src";

export type EventLogWidgetHandle = {
  render: (props: EventLogProps) => void;
  unmount: () => void;
};

export function createEventLogWidget(container: HTMLElement, initialProps: EventLogProps): EventLogWidgetHandle {
  const root = createRoot(container);

  const render = (props: EventLogProps) => {
    root.render(<EventLog {...props} />);
  };

  render(initialProps);

  return {
    render,
    unmount: () => root.unmount(),
  };
}
