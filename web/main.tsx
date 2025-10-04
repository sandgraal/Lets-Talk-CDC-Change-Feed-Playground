import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";

function mount() {
  const rootElement = document.getElementById("simShellRoot");
  if (!rootElement) {
    console.warn("Simulator UI shell mount point not found (simShellRoot).");
    return;
  }

  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount, { once: true });
} else {
  mount();
}
