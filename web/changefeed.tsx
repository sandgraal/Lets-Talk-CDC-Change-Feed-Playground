import React from "react";
import ReactDOM from "react-dom/client";
import { ChangefeedPlayground } from "./changefeed/ChangefeedPlayground";
import "./styles/changefeed.css";

function mount() {
  const rootElement = document.getElementById("changefeedPlaygroundRoot");
  if (!rootElement) {
    console.warn("Change feed playground mount point with id 'changefeedPlaygroundRoot' not found in the DOM. Ensure the HTML contains this element before loading the script.");
    return;
  }
  const root = ReactDOM.createRoot(rootElement);
  root.render(<ChangefeedPlayground />);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount, { once: true });
} else {
  mount();
}
