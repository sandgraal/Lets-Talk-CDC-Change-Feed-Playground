import { createRoot } from "react-dom/client";
import { PlaygroundCorePreview } from "./components/PlaygroundCorePreview";
import { SCENARIOS, type ShellScenario } from "./scenarios";

export type ChangefeedPlaygroundHandle = {
  render: (props: { scenarios?: ShellScenario[]; autoStart?: boolean }) => void;
  unmount: () => void;
};

export function createChangefeedPlayground(
  container: HTMLElement,
  initialProps: { scenarios?: ShellScenario[]; autoStart?: boolean } = {}
): ChangefeedPlaygroundHandle {
  const root = createRoot(container);

  const render = (props: { scenarios?: ShellScenario[]; autoStart?: boolean }) => {
    const scenarios = props.scenarios ?? SCENARIOS;
    const autoStart = props.autoStart ?? false;
    root.render(<PlaygroundCorePreview scenarios={scenarios} autoStart={autoStart} />);
  };

  render(initialProps);

  return {
    render,
    unmount: () => root.unmount(),
  };
}
