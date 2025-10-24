import React from "react";
import ReactDOM from "react-dom/client";
import { createTelemetryClient, type TelemetryClient } from "../src";
import { App } from "./App";

declare global {
  interface Window {
    telemetry?: TelemetryClient;
  }
}

function ensureTelemetryClient() {
  if (typeof window === "undefined") return;

  const existing = window.telemetry;
  if (existing && typeof existing.track === "function" && typeof existing.flush === "function") {
    return existing;
  }

  let storage: Storage | undefined;
  try {
    storage = window.localStorage;
  } catch {
    storage = undefined;
  }

  const client = createTelemetryClient({
    storage,
    console:
      typeof console !== "undefined"
        ? { warn: console.warn.bind(console), debug: console.debug.bind(console) }
        : undefined,
  });

  window.telemetry = client;
  return client;
}

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
  ensureTelemetryClient();
  document.addEventListener("DOMContentLoaded", mount, { once: true });
} else {
  ensureTelemetryClient();
  mount();
}
