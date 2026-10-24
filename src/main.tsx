import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyTheme, getThemePref } from "./shell/theme";
import "./index.css";

// Set before the first render so a stored "light"/"dark" choice never flashes
// the opposite theme while the app boots.
applyTheme(getThemePref());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
