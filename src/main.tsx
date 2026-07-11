import "./lib/polyfills";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import { isLikelyStaleChunkError, requestStaleChunkReload } from "./lib/chunk-recovery";

// One CSS entrypoint owns the complete design-system cascade. Keeping the
// import graph centralized prevents duplicated foundations and order drift.
import "./index.css";

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    const error = event.error instanceof Error ? event.error : event.message;
    if (isLikelyStaleChunkError(error)) requestStaleChunkReload("window-error");
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (isLikelyStaleChunkError(event.reason)) requestStaleChunkReload("unhandled-rejection");
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
