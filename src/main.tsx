import "./lib/polyfills";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Global error + rejection safety net for voice + async surfaces.
// Vapi WebSocket drops, ElevenLabs streaming failures, recipe promise
// rejections, and any uncaught third-party widget errors all land here.
// This prevents silent white screens or broken agent states for SMB operators
// who expect the console to "just work" even when the network hiccups.
if (typeof window !== "undefined") {
  const report = (kind: string, err: unknown, extra?: Record<string, unknown>) => {
    // Always surface in console for local debugging
    console.error(`[wireline:${kind}]`, err, extra);
    // Plausible already loaded via index.html — tag the event so we see
    // production error volume without adding another analytics vendor.
    if (typeof window.plausible === "function") {
      window.plausible("Error", {
        props: { kind, message: err instanceof Error ? err.message : String(err) },
      });
    }
  };

  window.addEventListener("error", (event) => {
    report("window-error", event.error || event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    report("unhandled-rejection", event.reason);
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
