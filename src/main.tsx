import "./lib/polyfills";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";

import "./styles/foundation.css";
import "./index.css";
import "./styles/responsive.css";
import "./styles/ruthless-mobile-cleanup.css";
import "./styles/agent-tabs-compact.css";

if (typeof window !== "undefined") {
  const safeReload = () => {
    try {
      const now = Date.now();
      const last = Number(sessionStorage.getItem("wireline:last-preload-reload") || "0");
      const count = Number(sessionStorage.getItem("wireline:preload-reload-count") || "0");
      if (last && now - last < 10_000 && count >= 2) return;
      sessionStorage.setItem("wireline:last-preload-reload", String(now));
      sessionStorage.setItem("wireline:preload-reload-count", String(count + 1));
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  window.addEventListener("error", (event) => {
    const message = event.message || (event.error instanceof Error ? event.error.message : "");
    if (message.includes("dynamically imported module")) safeReload();
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
