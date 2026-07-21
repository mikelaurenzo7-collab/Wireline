import "./lib/polyfills";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import { isLikelyStaleChunkError, requestStaleChunkReload } from "./lib/chunk-recovery";
import { captureSignupIntentFromLocation } from "./lib/signup-intent";
import {
  clearDomReconciliationReloadGuardAfterStableRender,
  isDomReconciliationError,
  requestDomReconciliationReload,
} from "./lib/dom-reconciliation-recovery";
import { captureException } from "./lib/sentry";

// One CSS entrypoint owns the complete design-system cascade. Keeping the
// import graph centralized prevents duplicated foundations and order drift.
import "./index.css";

if (typeof window !== "undefined") {
  // Preserve campaign and plan intent before a public landing-page CTA changes
  // the URL. Signup can then persist first-touch attribution server-side.
  captureSignupIntentFromLocation();

  window.addEventListener("error", (event) => {
    const error = event.error instanceof Error ? event.error : event.message;
    if (isLikelyStaleChunkError(error)) requestStaleChunkReload("window-error");
    if (isDomReconciliationError(error)) {
      captureException(error, { errorClass: "dom_reconciliation", source: "window-error" });
      requestDomReconciliationReload(error, "window-error");
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (isLikelyStaleChunkError(event.reason)) requestStaleChunkReload("unhandled-rejection");
    if (isDomReconciliationError(event.reason)) {
      captureException(event.reason, {
        errorClass: "dom_reconciliation",
        source: "unhandled-rejection",
      });
      requestDomReconciliationReload(event.reason, "unhandled-rejection");
    }
  });

  clearDomReconciliationReloadGuardAfterStableRender();
}

createRoot(document.getElementById("root")!, {
  onRecoverableError(error, errorInfo) {
    captureException(error, {
      errorClass: isDomReconciliationError(error) ? "dom_reconciliation" : "react_recoverable",
      componentStack: errorInfo.componentStack,
    });
    requestDomReconciliationReload(error, "react-recoverable");
  },
}).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
